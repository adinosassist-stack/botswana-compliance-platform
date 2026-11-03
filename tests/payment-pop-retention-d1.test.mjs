import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {splitSqliteMigrationStatements} from '../scripts/sqlite-migration-statements.mjs';
import {popSha256} from '../cloudflare/src/payment-pop-upload-reservations.js';
import {retireStoredPop} from '../cloudflare/src/payment-pop-retention.js';
const id='11111111-1111-4111-8111-111111111111';
test('local D1 audits retirement before deletion and recovers completion failure exactly once',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('local')}}",compatibilityDate:'2026-09-03',d1Databases:{DB:'pop-retirement-audit'},r2Buckets:['EVIDENCE']}));
 try{
  const DB=await mf.getD1Database('DB'),EVIDENCE=await mf.getR2Bucket('EVIDENCE');
  for(const sql of ['CREATE TABLE tenants(id TEXT PRIMARY KEY)','CREATE TABLE payment_orders(id TEXT PRIMARY KEY,tenant_id TEXT,status TEXT)','CREATE TABLE manual_payment_submissions(id TEXT PRIMARY KEY)',readFileSync('cloudflare/schema.sql','utf8').match(/CREATE TABLE IF NOT EXISTS audit_events\([\s\S]*?\);/)[0]])await DB.prepare(sql).run();
  await DB.exec(readFileSync('cloudflare/migrations/004_v56_audit_lineage.sql','utf8').split('CREATE TABLE IF NOT EXISTS audit_integrity_checks')[0].replaceAll('\n',' '));
  await DB.batch(splitSqliteMigrationStatements(readFileSync('docs/proposals/payment-pop-documents-schema.sql','utf8')).map(sql=>DB.prepare(sql)));
  await DB.prepare('INSERT INTO tenants VALUES(?)').bind(id).run();await DB.prepare("INSERT INTO payment_orders VALUES(?,?,'pending')").bind(id,id).run();
  const bytes=new Uint8Array([137,80,78,71,13,10,26,10,1]),key='payment-pop/quarantine/'+id+'/'+id+'/'+id,sha=await popSha256(bytes);
  const object=await EVIDENCE.put(key,bytes,{httpMetadata:{contentType:'application/octet-stream'}});
  await DB.prepare("INSERT INTO payment_pop_documents(id,tenant_id,payment_order_id,source,object_key,display_name,content_type,bytes,scan_status,content_sha256,object_etag) VALUES(?,?,?,'web',?,'receipt.png','image/png',9,'pending',?,?)").bind(id,id,id,key,sha,object.etag).run();
  await DB.prepare("INSERT INTO payment_pop_upload_requests(document_id,tenant_id,payment_order_id,key_hash,request_hash,bytes,state) VALUES(?,?,?,?,?,9,'stored')").bind(id,id,id,'a'.repeat(64),'b'.repeat(64)).run();
  const env={DB,EVIDENCE,APP_ENV:'staging',DEPLOYMENT_PROFILE:'billing-staging-readonly',POP_RETENTION_STAGING_ENABLED:'true',AUDIT_INTEGRITY_SECRET:'local-d1-retirement-secret-'.repeat(3)};
  const options={actor:{platformOwner:true,userId:id},documentId:id,tenantId:id,orderId:id,expectedSha256:sha,expectedEtag:object.etag,reason:'Explicit local test object retirement'};
  await DB.prepare("CREATE TRIGGER refuse_retirement BEFORE INSERT ON audit_events WHEN NEW.event_type='POP_RETIREMENT_REQUESTED' BEGIN SELECT RAISE(ABORT,'retirement audit unavailable'); END").run();
  await assert.rejects(retireStoredPop(env,options),/audit_write_failed/);assert.equal((await DB.prepare('SELECT deleted_at FROM payment_pop_documents').first()).deleted_at,null);assert.ok(await EVIDENCE.head(key));
  await DB.prepare('DROP TRIGGER refuse_retirement').run();
  await DB.prepare("CREATE TRIGGER refuse_completion BEFORE INSERT ON audit_events WHEN NEW.event_type='POP_STORAGE_REMOVED' BEGIN SELECT RAISE(ABORT,'completion audit unavailable'); END").run();
  await assert.rejects(retireStoredPop(env,options),/audit_write_failed/);assert.equal(await EVIDENCE.head(key),null);assert.equal((await DB.prepare('SELECT storage_deleted_at FROM payment_pop_documents').first()).storage_deleted_at,null);
  await DB.prepare('DROP TRIGGER refuse_completion').run();
  const raced=await Promise.all([retireStoredPop(env,options),retireStoredPop(env,options)]);assert.ok(raced.every(r=>r.storageDeleted));
  const events=(await DB.prepare('SELECT event_type,event_hash FROM audit_events ORDER BY tenant_seq').all()).results;assert.deepEqual(events.map(e=>e.event_type),['POP_RETIREMENT_REQUESTED','POP_STORAGE_REMOVED']);assert.ok(events.every(e=>/^[a-f0-9]{64}$/.test(e.event_hash)));
  assert.equal((await DB.prepare('SELECT event_count FROM audit_chain_state').first()).event_count,2);assert.equal((await DB.prepare('SELECT count(*) n FROM payment_pop_upload_requests').first()).n,1);assert.equal((await DB.prepare('SELECT bytes FROM payment_pop_upload_requests').first()).bytes,9);assert.equal((await DB.prepare('SELECT status FROM payment_orders').first()).status,'pending');
 }finally{await mf.dispose()}
});
