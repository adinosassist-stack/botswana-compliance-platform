import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {reservePopUpload,POP_UPLOAD_LIMITS,popSha256} from '../cloudflare/src/payment-pop-upload-reservations.js';
import {recordPendingPop} from '../cloudflare/src/payment-pop-metadata.js';
import {MAX_POP_BYTES} from '../cloudflare/src/payment-pop-validation.js';
import {splitSqliteMigrationStatements} from '../scripts/sqlite-migration-statements.mjs';
const tenantId='11111111-1111-4111-8111-111111111111',requestHash='a'.repeat(64);
async function fixture(){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('local')}}",compatibilityDate:'2026-09-03',d1Databases:{DB:'pop-reservation-'+crypto.randomUUID()}}));
 const DB=await mf.getD1Database('DB');
 await DB.prepare('CREATE TABLE tenants(id TEXT PRIMARY KEY)').run();
 await DB.prepare('CREATE TABLE payment_orders(id TEXT PRIMARY KEY,tenant_id TEXT)').run();
 await DB.prepare('CREATE TABLE manual_payment_submissions(id TEXT PRIMARY KEY)').run();
 await DB.prepare('INSERT INTO tenants(id) VALUES(?)').bind(tenantId).run();
 await DB.batch(splitSqliteMigrationStatements(readFileSync('docs/proposals/payment-pop-documents-schema.sql','utf8')).map(s=>DB.prepare(s)));
 async function order(tenant=tenantId){const id=crypto.randomUUID();await DB.prepare('INSERT INTO payment_orders(id,tenant_id) VALUES(?,?)').bind(id,tenant).run();return id}
 const args=orderId=>({tenantId,orderId,documentId:crypto.randomUUID(),requestKey:crypto.randomUUID(),requestHash,bytes:9});
 return {DB,order,args,close:()=>mf.dispose()};
}
test('local D1 simultaneous duplicate keys reserve exactly one document',async()=>{
 const f=await fixture();try{
  const a=f.args(await f.order());const key=a.requestKey;
  const results=await Promise.allSettled(Array.from({length:12},()=>reservePopUpload(f.DB,{...a,documentId:crypto.randomUUID()})));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  for(const r of results.filter(x=>x.status==='rejected'))assert.match(r.reason.message,/pop_upload_in_progress/);
  const rows=(await f.DB.prepare('SELECT * FROM payment_pop_upload_requests').all()).results;assert.equal(rows.length,1);assert.notEqual(rows[0].key_hash,key);assert.equal(rows[0].key_hash,await popSha256(key));
 }finally{await f.close()}
});
test('local D1 simultaneous distinct keys cannot exceed the per-order admission cap',async()=>{
 const f=await fixture();try{
  const orderId=await f.order();
  const results=await Promise.allSettled(Array.from({length:12},()=>reservePopUpload(f.DB,f.args(orderId))));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,POP_UPLOAD_LIMITS.perOrder);
  for(const r of results.filter(x=>x.status==='rejected'))assert.match(r.reason.message,/pop_upload_quota_exceeded/);
  assert.equal((await f.DB.prepare('SELECT count(*) n FROM payment_pop_upload_requests').first()).n,5);
 }finally{await f.close()}
});
test('local D1 applies tenant daily limit across orders and permits a stored replay at capacity',async()=>{
 const f=await fixture();try{
  let first;
  for(let o=0;o<5;o++){const orderId=await f.order();for(let i=0;i<4;i++){const a=f.args(orderId);await reservePopUpload(f.DB,a);if(!first)first=a}}
  await assert.rejects(reservePopUpload(f.DB,f.args(await f.order())),/pop_upload_quota_exceeded/);
  await f.DB.prepare("UPDATE payment_pop_upload_requests SET state='stored' WHERE document_id=?").bind(first.documentId).run();
  const replay=await reservePopUpload(f.DB,{...first,documentId:crypto.randomUUID()});assert.equal(replay.replayed,true);assert.equal(replay.documentId,first.documentId);
  await assert.rejects(reservePopUpload(f.DB,{...first,requestHash:'b'.repeat(64)}),/pop_idempotency_conflict/);
 }finally{await f.close()}
});
async function seed(f,count,bytes){
 const statements=[];
 for(let i=0;i<count;i++){
  const orderId=crypto.randomUUID();statements.push(f.DB.prepare('INSERT INTO payment_orders(id,tenant_id) VALUES(?,?)').bind(orderId,tenantId));
  statements.push(f.DB.prepare("INSERT INTO payment_pop_upload_requests(document_id,tenant_id,payment_order_id,key_hash,request_hash,bytes,state,created_at) VALUES(?,?,?,?,?,?,'failed',datetime('now','-2 days'))").bind(crypto.randomUUID(),tenantId,orderId,String(i).padStart(64,'0'),requestHash,bytes));
 }
 await f.DB.batch(statements);
}
test('local D1 counts failed attempts against total tenant admissions without charging another tenant',async()=>{
 const f=await fixture();try{
  await seed(f,100,9);await assert.rejects(reservePopUpload(f.DB,f.args(await f.order())),/pop_upload_quota_exceeded/);
  const other='22222222-2222-4222-8222-222222222222';await f.DB.prepare('INSERT INTO tenants(id) VALUES(?)').bind(other).run();
  const admitted=await reservePopUpload(f.DB,{...f.args(await f.order(other)),tenantId:other});assert.equal(admitted.replayed,false);
 }finally{await f.close()}
});
test('local D1 enforces byte budget exactly, including failed reservations',async()=>{
 const f=await fixture();try{
  await seed(f,14,MAX_POP_BYTES);await assert.rejects(reservePopUpload(f.DB,{...f.args(await f.order()),bytes:MAX_POP_BYTES}),/pop_upload_quota_exceeded/);
  await reservePopUpload(f.DB,{...f.args(await f.order()),bytes:1024*1024});
  assert.equal((await f.DB.prepare('SELECT sum(bytes) n FROM payment_pop_upload_requests').first()).n,POP_UPLOAD_LIMITS.perTenantBytes);
  await assert.rejects(reservePopUpload(f.DB,{...f.args(await f.order()),bytes:8}),/pop_upload_quota_exceeded/);
 }finally{await f.close()}
});
test('local D1 rolls back metadata and completion together if the ledger update fails',async()=>{
 const f=await fixture();try{
  const a=f.args(await f.order());await reservePopUpload(f.DB,a);
  await f.DB.prepare("CREATE TRIGGER refuse_pop_completion BEFORE UPDATE OF state ON payment_pop_upload_requests WHEN NEW.state='stored' BEGIN SELECT RAISE(ABORT,'local ledger failure'); END").run();
  const metadata={...a,objectKey:'payment-pop/quarantine/'+tenantId+'/'+a.orderId+'/'+a.documentId,name:'receipt.png',contentType:'image/png',userId:'local-actor',reservationHash:requestHash};
  await assert.rejects(recordPendingPop(f.DB,metadata),/pop_metadata_write_failed/);
  assert.equal((await f.DB.prepare('SELECT count(*) n FROM payment_pop_documents').first()).n,0);assert.equal((await f.DB.prepare('SELECT state FROM payment_pop_upload_requests').first()).state,'reserved');
  await f.DB.prepare('DROP TRIGGER refuse_pop_completion').run();await recordPendingPop(f.DB,metadata);
  assert.equal((await f.DB.prepare('SELECT count(*) n FROM payment_pop_documents').first()).n,1);assert.equal((await f.DB.prepare('SELECT state FROM payment_pop_upload_requests').first()).state,'stored');
 }finally{await f.close()}
});
