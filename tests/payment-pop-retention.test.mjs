import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {popServiceFixture,popFixtureId as id} from './helpers/payment-pop-service-fixture.mjs';
import {stagePopSubmission} from '../cloudflare/src/payment-pop-staging-service.js';
import {retireStoredPop,inspectPopRecovery} from '../cloudflare/src/payment-pop-retention.js';
const png=new Uint8Array([137,80,78,71,13,10,26,10,1]),actor={platformOwner:true,userId:id};
async function fixture(){
 const f=popServiceFixture();const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('local')}}",compatibilityDate:'2026-09-03',r2Buckets:['EVIDENCE']}));
 const bucket=await mf.getR2Bucket('EVIDENCE');let deletes=0;
 f.env.EVIDENCE={get:(...a)=>bucket.get(...a),head:(...a)=>bucket.head(...a),put:(...a)=>bucket.put(...a),async delete(...a){deletes++;return bucket.delete(...a)}};
 Object.assign(f.env,{APP_ENV:'staging',DEPLOYMENT_PROFILE:'billing-staging-readonly',POP_RETENTION_STAGING_ENABLED:'true',POP_RECOVERY_STAGING_ENABLED:'true',AUDIT_INTEGRITY_SECRET:'local-retirement-audit-secret-'.repeat(3)});
 const upload={session:f.session,orderId:id,documentId:id,requestKey:'retirement-fixture-upload-0001',bytes:png,name:'receipt.png',contentType:'image/png'};
 await stagePopSubmission(f.env,upload);
 const row=f.sql.prepare('SELECT * FROM payment_pop_documents').get();
 const options={actor,documentId:id,tenantId:id,orderId:id,expectedSha256:row.content_sha256,expectedEtag:row.object_etag,reason:'Explicit local fixture deletion request'};
 const close=f.close;f.close=async()=>{close();await mf.dispose()};return {...f,bucket,row,options,upload,deletes:()=>deletes};
}
const count=(f,type)=>f.sql.prepare('SELECT count(*) n FROM audit_events WHERE event_type=?').get(type).n;
test('stored receipt retirement is audited and replayable while retaining quota and payment history',async()=>{
 const f=await fixture();try{
  const reservations=JSON.stringify(f.sql.prepare('SELECT * FROM payment_pop_upload_requests').all());
  const r=await retireStoredPop(f.env,f.options);assert.equal(r.storageDeleted,true);assert.equal(r.quotaReleased,false);assert.equal(r.bankFundsConfirmed,false);
  assert.equal(await f.bucket.head(f.row.object_key),null);const row=f.sql.prepare('SELECT * FROM payment_pop_documents').get();assert.ok(row.deleted_at);assert.ok(row.storage_deleted_at);
  assert.equal((await retireStoredPop(f.env,f.options)).replayed,true);assert.equal(f.deletes(),1);
  assert.equal(count(f,'POP_RETIREMENT_REQUESTED'),1);assert.equal(count(f,'POP_STORAGE_REMOVED'),1);assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM payment_pop_upload_requests').all()),reservations);
  await assert.rejects(stagePopSubmission(f.env,{...f.upload,documentId:crypto.randomUUID()}),/pop_upload_deleted/);
  const inspection=await inspectPopRecovery(f.env,f.options);assert.equal(inspection.observation,'retired_object_absent');assert.equal(inspection.needsReconciliation,false);
  assert.equal(f.sql.prepare('SELECT status FROM payment_orders').get().status,'pending');assert.equal(f.sql.prepare('SELECT count(*) n FROM payment_fulfillments').get().n,0);
 }finally{await f.close()}
});
test('retirement refuses disabled/production context, unauthorized actor, wrong scope and changed snapshot',async()=>{
 const f=await fixture();try{
  for(const [env,options] of [[{...f.env,POP_RETENTION_STAGING_ENABLED:'false'},f.options],[{...f.env,APP_ENV:'production'},f.options],[f.env,{...f.options,actor:{platformOwner:false,userId:id}}],[f.env,{...f.options,tenantId:'22222222-2222-4222-8222-222222222222'}],[f.env,{...f.options,expectedSha256:'0'.repeat(64)}],[f.env,{...f.options,expectedEtag:'changed'}],[f.env,{...f.options,reason:'x'}]])await assert.rejects(retireStoredPop(env,options),/pop_retirement_/);
  assert.equal(f.sql.prepare('SELECT deleted_at FROM payment_pop_documents').get().deleted_at,null);assert.ok(await f.bucket.head(f.row.object_key));assert.equal(f.deletes(),0);assert.equal(count(f,'POP_RETIREMENT_REQUESTED'),0);
 }finally{await f.close()}
});
test('failed initial audit prevents tombstone and storage deletion',async()=>{
 const f=await fixture();try{
  f.sql.exec("CREATE TRIGGER refuse_retirement_audit BEFORE INSERT ON audit_events WHEN NEW.event_type='POP_RETIREMENT_REQUESTED' BEGIN SELECT RAISE(ABORT,'retirement audit failure'); END");
  await assert.rejects(retireStoredPop(f.env,f.options),/audit_write_failed/);assert.equal(f.sql.prepare('SELECT deleted_at FROM payment_pop_documents').get().deleted_at,null);assert.equal(f.deletes(),0);assert.ok(await f.bucket.head(f.row.object_key));
 }finally{await f.close()}
});
test('failed storage deletion keeps receipt tombstoned and permits an audited retry',async()=>{
 const f=await fixture();try{
  const del=f.env.EVIDENCE.delete;f.env.EVIDENCE.delete=async()=>{throw Error('local storage unavailable')};
  await assert.rejects(retireStoredPop(f.env,f.options),/pop_retirement_cleanup_required/);const row=f.sql.prepare('SELECT * FROM payment_pop_documents').get();assert.ok(row.deleted_at);assert.equal(row.storage_deleted_at,null);assert.ok(await f.bucket.head(row.object_key));
  const inspection=await inspectPopRecovery(f.env,f.options);assert.equal(inspection.observation,'cleanup_pending');assert.equal(inspection.needsReconciliation,true);
  f.env.EVIDENCE.delete=del;assert.equal((await retireStoredPop(f.env,f.options)).storageDeleted,true);assert.equal(count(f,'POP_RETIREMENT_REQUESTED'),1);assert.equal(count(f,'POP_STORAGE_REMOVED'),1);
 }finally{await f.close()}
});
test('lost storage acknowledgement recovers physical absence without repeated deletion',async()=>{
 const f=await fixture();try{
  const del=f.env.EVIDENCE.delete;f.env.EVIDENCE.delete=async(...a)=>{await del(...a);throw Error('lost deletion acknowledgement')};
  assert.equal((await retireStoredPop(f.env,f.options)).storageDeleted,true);assert.equal(f.deletes(),1);assert.equal(await f.bucket.head(f.row.object_key),null);
 }finally{await f.close()}
});
test('failed completion audit records no false cleanup success and retry does not delete again',async()=>{
 const f=await fixture();try{
  f.sql.exec("CREATE TRIGGER refuse_storage_audit BEFORE INSERT ON audit_events WHEN NEW.event_type='POP_STORAGE_REMOVED' BEGIN SELECT RAISE(ABORT,'storage audit failure'); END");
  await assert.rejects(retireStoredPop(f.env,f.options),/audit_write_failed/);assert.equal(await f.bucket.head(f.row.object_key),null);assert.equal(f.sql.prepare('SELECT storage_deleted_at FROM payment_pop_documents').get().storage_deleted_at,null);assert.equal(count(f,'POP_STORAGE_REMOVED'),0);
  f.sql.exec('DROP TRIGGER refuse_storage_audit');assert.equal((await retireStoredPop(f.env,f.options)).storageDeleted,true);assert.equal(f.deletes(),1);assert.equal(count(f,'POP_RETIREMENT_REQUESTED'),1);assert.equal(count(f,'POP_STORAGE_REMOVED'),1);
 }finally{await f.close()}
});
test('changed private object is quarantined for reconciliation rather than deleted',async()=>{
 const f=await fixture();try{
  await f.bucket.put(f.row.object_key,new Uint8Array([...png,2]));
  await assert.rejects(retireStoredPop(f.env,f.options),/pop_retirement_reconciliation_required/);assert.ok(await f.bucket.head(f.row.object_key));assert.equal(f.deletes(),0);assert.ok(f.sql.prepare('SELECT deleted_at FROM payment_pop_documents').get().deleted_at);
  assert.equal((await inspectPopRecovery(f.env,f.options)).observation,'object_identity_mismatch');
 }finally{await f.close()}
});
test('concurrent retirement requests produce one tombstone and one physical-removal audit',async()=>{
 const f=await fixture();try{
  const results=await Promise.all([retireStoredPop(f.env,f.options),retireStoredPop(f.env,f.options)]);assert.ok(results.every(r=>r.storageDeleted));assert.equal(count(f,'POP_RETIREMENT_REQUESTED'),1);assert.equal(count(f,'POP_STORAGE_REMOVED'),1);assert.equal(await f.bucket.head(f.row.object_key),null);
 }finally{await f.close()}
});
test('orphan inspection reports uncertainty without deleting content or releasing reservations',async()=>{
 const f=await fixture();try{
  const doc=crypto.randomUUID(),key='payment-pop/quarantine/'+id+'/'+id+'/'+doc;
  f.sql.prepare("INSERT INTO payment_pop_upload_requests(document_id,tenant_id,payment_order_id,key_hash,request_hash,bytes,state) VALUES(?,?,?,?,?,9,'reserved')").run(doc,id,id,'c'.repeat(64),'d'.repeat(64));await f.bucket.put(key,png);
  const before=JSON.stringify(f.sql.prepare('SELECT * FROM payment_pop_upload_requests').all());
  const r=await inspectPopRecovery(f.env,{...f.options,documentId:doc});assert.equal(r.observation,'reserved_object_present');assert.equal(r.needsReconciliation,true);assert.equal(r.quotaReleased,false);assert.equal(r.objectPresent,true);assert.equal(r.metadataPresent,false);assert.ok(!JSON.stringify(r).includes('payment-pop/quarantine/'));
  assert.ok(await f.bucket.head(key));assert.equal(f.deletes(),0);assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM payment_pop_upload_requests').all()),before);
  await assert.rejects(retireStoredPop(f.env,{...f.options,documentId:doc}),/pop_retirement_scope_not_found/);
 }finally{await f.close()}
});
test('reappearing retired objects and unavailable storage remain reconciliation cases',async()=>{
 const f=await fixture();try{
  await retireStoredPop(f.env,f.options);await f.bucket.put(f.row.object_key,png);
  await assert.rejects(retireStoredPop(f.env,f.options),/pop_retirement_reconciliation_required/);assert.equal((await inspectPopRecovery(f.env,f.options)).observation,'retired_object_present');
  f.env.EVIDENCE.head=async()=>{throw Error('storage unavailable')};const inspection=await inspectPopRecovery(f.env,f.options);assert.equal(inspection.objectPresent,null);assert.equal(inspection.observation,'storage_unavailable');assert.equal(inspection.needsReconciliation,true);
 }finally{await f.close()}
});
test('mis-scoped metadata never directs cleanup toward another private object',async()=>{
 const f=await fixture();try{
  const other='payment-pop/quarantine/'+id+'/'+id+'/'+crypto.randomUUID();await f.bucket.put(other,png);f.sql.prepare('UPDATE payment_pop_documents SET object_key=?').run(other);
  await assert.rejects(retireStoredPop(f.env,f.options),/pop_retirement_reconciliation_required/);assert.equal(f.deletes(),0);assert.ok(await f.bucket.head(other));assert.ok(await f.bucket.head(f.row.object_key));
  assert.equal((await inspectPopRecovery(f.env,f.options)).observation,'metadata_scope_mismatch');assert.equal(count(f,'POP_RETIREMENT_REQUESTED'),0);
 }finally{await f.close()}
});
test('lost audit acknowledgements recover both deletion phases without duplicate events',async()=>{
 const f=await fixture();try{
  const batch=f.env.DB.batch.bind(f.env.DB);let lostIntent=false,lostCompletion=false;
  f.env.DB.batch=async statements=>{
   const result=await batch(statements),row=f.sql.prepare('SELECT deleted_at,storage_deleted_at FROM payment_pop_documents').get();
   if(row.deleted_at&&!row.storage_deleted_at&&!lostIntent){lostIntent=true;throw Error('lost initial audit acknowledgement')}
   if(row.storage_deleted_at&&!lostCompletion){lostCompletion=true;throw Error('lost completion audit acknowledgement')}
   return result;
  };
  assert.equal((await retireStoredPop(f.env,f.options)).storageDeleted,true);assert.equal(f.deletes(),1);assert.equal(count(f,'POP_RETIREMENT_REQUESTED'),1);assert.equal(count(f,'POP_STORAGE_REMOVED'),1);
 }finally{await f.close()}
});
test('recovery inspection requires qualified owner and audit while leaving all receipt state unchanged',async()=>{
 const f=await fixture();try{
  const before=JSON.stringify(f.sql.prepare('SELECT * FROM payment_pop_documents').all());
  for(const [env,options] of [[{...f.env,POP_RECOVERY_STAGING_ENABLED:'false'},f.options],[{...f.env,APP_ENV:'production'},f.options],[{...f.env,AUDIT_INTEGRITY_SECRET:''},f.options],[f.env,{...f.options,actor:{platformOwner:false,userId:id}}],[f.env,{...f.options,tenantId:'22222222-2222-4222-8222-222222222222'}]])await assert.rejects(inspectPopRecovery(env,options),/pop_recovery_/);
  f.sql.exec("CREATE TRIGGER refuse_inspection BEFORE INSERT ON audit_events WHEN NEW.event_type='POP_RECOVERY_INSPECTED' BEGIN SELECT RAISE(ABORT,'inspection audit unavailable'); END");
  await assert.rejects(inspectPopRecovery(f.env,f.options),/audit_write_failed/);assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM payment_pop_documents').all()),before);assert.equal(f.deletes(),0);assert.ok(await f.bucket.head(f.row.object_key));
 }finally{await f.close()}
});
