import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {splitSqliteMigrationStatements} from '../scripts/sqlite-migration-statements.mjs';
import {popSha256} from '../cloudflare/src/payment-pop-upload-reservations.js';
import {preparePopScanRequest} from '../cloudflare/src/payment-pop-scan-verification.js';
import {markPopScanResult,readCleanPopForOwner} from '../cloudflare/src/payment-pop-owner-review.js';
const id='11111111-1111-4111-8111-111111111111';
test('local D1 commits exactly one scoped scan verdict with sealed audit and blocks downloads on audit failure',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('local')}}",compatibilityDate:'2026-09-03',d1Databases:{DB:'pop-scan-audit'},r2Buckets:['EVIDENCE']}));
 try{
  const DB=await mf.getD1Database('DB'),EVIDENCE=await mf.getR2Bucket('EVIDENCE');
  for(const sql of ['CREATE TABLE tenants(id TEXT PRIMARY KEY)','CREATE TABLE payment_orders(id TEXT PRIMARY KEY,tenant_id TEXT,status TEXT)','CREATE TABLE manual_payment_submissions(id TEXT PRIMARY KEY)',readFileSync('cloudflare/schema.sql','utf8').match(/CREATE TABLE IF NOT EXISTS audit_events\([\s\S]*?\);/)[0]])await DB.prepare(sql).run();
  await DB.exec(readFileSync('cloudflare/migrations/004_v56_audit_lineage.sql','utf8').split('CREATE TABLE IF NOT EXISTS audit_integrity_checks')[0].replaceAll('\n',' '));
  await DB.batch(splitSqliteMigrationStatements(readFileSync('docs/proposals/payment-pop-documents-schema.sql','utf8')).map(sql=>DB.prepare(sql)));
  await DB.prepare('INSERT INTO tenants VALUES(?)').bind(id).run();await DB.prepare("INSERT INTO payment_orders VALUES(?,?,'pending')").bind(id,id).run();
  const bytes=new Uint8Array([137,80,78,71,13,10,26,10,1]),key='payment-pop/quarantine/'+id+'/'+id+'/'+id;
  const object=await EVIDENCE.put(key,bytes,{httpMetadata:{contentType:'application/octet-stream'}}),sha=await popSha256(bytes);
  await DB.prepare("INSERT INTO payment_pop_documents(id,tenant_id,payment_order_id,source,object_key,display_name,content_type,bytes,scan_status,content_sha256,object_etag) VALUES(?,?,?,'web',?,'receipt.png','image/png',9,'pending',?,?)").bind(id,id,id,key,sha,object.etag).run();
  await DB.prepare("INSERT INTO payment_pop_upload_requests(document_id,tenant_id,payment_order_id,key_hash,request_hash,bytes,state) VALUES(?,?,?,?,?,9,'stored')").bind(id,id,id,'a'.repeat(64),'b'.repeat(64)).run();
  const env={DB,EVIDENCE,APP_ENV:'staging',DEPLOYMENT_PROFILE:'billing-staging-readonly',POP_SCAN_STAGING_ENABLED:'true',POP_OWNER_RETRIEVAL_STAGING_ENABLED:'true',POP_SCAN_SECRET:'local-d1-scan-secret-'.repeat(3),POP_SCANNER_ID:'local-d1-scanner',AUDIT_INTEGRITY_SECRET:'local-d1-audit-secret-'.repeat(3)};
  const request=JSON.parse((await preparePopScanRequest(env,{documentId:id,tenantId:id,orderId:id})).metadata);
  const body=JSON.stringify({version:1,documentId:id,tenantId:id,orderId:id,requestId:request.requestId,sha256:sha,etag:object.etag,bytes:9,contentType:'image/png',verdict:'clean',provider:env.POP_SCANNER_ID,scannedAt:Date.now()});
  const signed={body,signature:createHmac('sha256',env.POP_SCAN_SECRET).update('pop-scan-response:v1:'+body).digest('hex')};
  await DB.prepare("CREATE TRIGGER refuse_pop_scan_audit BEFORE INSERT ON audit_events WHEN NEW.event_type='POP_SCAN_RESULT' BEGIN SELECT RAISE(ABORT,'scan audit failure'); END").run();
  await assert.rejects(markPopScanResult(env,signed),/audit_write_failed/);assert.equal((await DB.prepare('SELECT scan_status FROM payment_pop_documents').first()).scan_status,'pending');
  await DB.prepare('DROP TRIGGER refuse_pop_scan_audit').run();
  const raced=await Promise.allSettled([markPopScanResult(env,signed),markPopScanResult(env,signed)]);assert.equal(raced.filter(r=>r.status==='fulfilled').length,1);assert.equal((await DB.prepare("SELECT count(*) n FROM audit_events WHERE event_type='POP_SCAN_RESULT'").first()).n,1);
  await DB.prepare("CREATE TRIGGER refuse_pop_download_audit BEFORE INSERT ON audit_events WHEN NEW.event_type='POP_OWNER_DOWNLOAD' BEGIN SELECT RAISE(ABORT,'download audit failure'); END").run();
  const read={actor:{platformOwner:true,userId:id},documentId:id,tenantId:id,orderId:id};
  await assert.rejects(readCleanPopForOwner(env,read),/audit_write_failed/);assert.equal((await DB.prepare('SELECT last_owner_read_at FROM payment_pop_documents').first()).last_owner_read_at,null);
  await DB.prepare('DROP TRIGGER refuse_pop_download_audit').run();const response=await readCleanPopForOwner(env,read);assert.equal(response.status,200);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
  assert.equal((await DB.prepare('SELECT event_count FROM audit_chain_state').first()).event_count,2);assert.equal((await DB.prepare('SELECT status FROM payment_orders').first()).status,'pending');
 }finally{await mf.dispose()}
});
