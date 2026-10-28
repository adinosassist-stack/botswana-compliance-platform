import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {popServiceFixture,popFixtureId as id} from './helpers/payment-pop-service-fixture.mjs';
import {stagePopSubmission} from '../cloudflare/src/payment-pop-staging-service.js';
import {preparePopScanRequest,POP_SCAN_WINDOW_MS} from '../cloudflare/src/payment-pop-scan-verification.js';
import {markPopScanResult,readCleanPopForOwner} from '../cloudflare/src/payment-pop-owner-review.js';
const png=new Uint8Array([137,80,78,71,13,10,26,10,1]);
const scope={documentId:id,tenantId:id,orderId:id},actor={platformOwner:true,userId:id};
async function fixture(){
 const f=popServiceFixture();
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('local')}}",compatibilityDate:'2026-09-03',r2Buckets:['EVIDENCE']}));
 f.env.EVIDENCE=await mf.getR2Bucket('EVIDENCE');
 Object.assign(f.env,{APP_ENV:'staging',DEPLOYMENT_PROFILE:'billing-staging-readonly',POP_SCAN_STAGING_ENABLED:'true',POP_OWNER_RETRIEVAL_STAGING_ENABLED:'true',POP_SCAN_SECRET:'independent-local-scanner-secret-'.repeat(2),POP_SCANNER_ID:'local-regression-scanner',AUDIT_INTEGRITY_SECRET:'independent-local-audit-secret-'.repeat(2)});
 await stagePopSubmission(f.env,{session:f.session,orderId:id,documentId:id,requestKey:'signed-scan-upload-request-0001',bytes:png,name:'receipt.png',contentType:'image/png'});
 const close=f.close;f.close=async()=>{close();await mf.dispose()};return f;
}
const signature=(env,body)=>createHmac('sha256',env.POP_SCAN_SECRET).update('pop-scan-response:v1:'+body).digest('hex');
function response(f,request,patch={}){
 const m=JSON.parse(request.metadata);
 const body=JSON.stringify({version:1,documentId:m.documentId,tenantId:m.tenantId,orderId:m.orderId,requestId:m.requestId,sha256:m.sha256,etag:m.etag,bytes:m.bytes,contentType:m.contentType,verdict:'clean',provider:f.env.POP_SCANNER_ID,scannedAt:Date.now(),...patch});
 return {body,signature:signature(f.env,body)};
}
test('signed content-bound verdict and owner attachment commit sealed audit records without payment effects',async()=>{
 const f=await fixture();try{
  await assert.rejects(readCleanPopForOwner(f.env,{actor,...scope}),/pop_not_reviewable/);
  const request=await preparePopScanRequest(f.env,scope),metadata=JSON.parse(request.metadata);
  assert.equal(metadata.expiresAt-metadata.issuedAt,POP_SCAN_WINDOW_MS);assert.deepEqual(request.bytes,png);
  assert.equal(request.signature,createHmac('sha256',f.env.POP_SCAN_SECRET).update('pop-scan-request:v1:'+request.metadata).digest('hex'));
  const signed=response(f,request);const r=await markPopScanResult(f.env,signed);assert.equal(r.scanStatus,'clean');assert.equal(r.bankFundsConfirmed,false);assert.equal(r.subscriptionActivated,false);
  const download=await readCleanPopForOwner(f.env,{actor,...scope});assert.equal(download.status,200);assert.deepEqual(new Uint8Array(await download.arrayBuffer()),png);
  assert.equal(download.headers.get('content-type'),'application/octet-stream');assert.match(download.headers.get('content-disposition'),/^attachment;/);assert.match(download.headers.get('cache-control'),/private, no-store/);assert.equal(download.headers.get('x-content-type-options'),'nosniff');assert.match(download.headers.get('content-security-policy'),/sandbox/);
  const audit=f.sql.prepare("SELECT event_type,event_hash FROM audit_events ORDER BY tenant_seq").all();assert.deepEqual(audit.map(x=>x.event_type),['POP_SCAN_RESULT','POP_OWNER_DOWNLOAD']);assert.ok(audit.every(x=>/^[a-f0-9]{64}$/.test(x.event_hash)));
  assert.equal(f.sql.prepare("SELECT count(*) n FROM payment_orders WHERE status!='pending'").get().n,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM payment_fulfillments').get().n,0);
  await assert.rejects(markPopScanResult(f.env,signed),/pop_scan_transition_failed/);
 }finally{await f.close()}
});
test('unsigned, altered, wrong-scope, wrong-content and expired scanner verdicts cannot mark clean',async()=>{
 const f=await fixture();try{
  const request=await preparePopScanRequest(f.env,scope),valid=response(f,request);
  await assert.rejects(preparePopScanRequest(f.env,scope),/pop_scan_in_progress/);
  for(const signed of [
   {...valid,signature:'0'.repeat(64)}, {...valid,body:valid.body+' '},
   response(f,request,{tenantId:'22222222-2222-4222-8222-222222222222'}),response(f,request,{requestId:crypto.randomUUID()}),
   response(f,request,{sha256:'0'.repeat(64)}),response(f,request,{etag:'wrong-object'}),response(f,request,{bytes:10}),response(f,request,{contentType:'application/pdf'}),
   response(f,request,{provider:'unapproved-scanner'}),response(f,request,{bankFundsConfirmed:true}),response(f,request,{orderId:'22222222-2222-4222-8222-222222222222'}),response(f,request,{scannedAt:Date.now()+3600000})
  ])await assert.rejects(markPopScanResult(f.env,signed),/pop_scanner_forbidden|pop_scan_transition_failed|pop_invalid_scan_result/);
  f.sql.prepare('UPDATE payment_pop_documents SET scan_request_expires_at=?').run(Date.now()-1);
  await assert.rejects(markPopScanResult(f.env,valid),/pop_scan_transition_failed/);
  assert.equal(f.sql.prepare('SELECT scan_status FROM payment_pop_documents').get().scan_status,'pending');assert.equal(f.sql.prepare('SELECT count(*) n FROM audit_events').get().n,0);
 }finally{await f.close()}
});
for(const verdict of ['blocked','failed'])test('signed '+verdict+' verdict stays private and never authorizes owner bytes',async()=>{
 const f=await fixture();try{
  const request=await preparePopScanRequest(f.env,scope);await markPopScanResult(f.env,response(f,request,{verdict}));
  await assert.rejects(readCleanPopForOwner(f.env,{actor,...scope}),/pop_not_reviewable/);
 }finally{await f.close()}
});
test('modified storage and forged clean flags do not permit scan acceptance or retrieval',async()=>{
 const f=await fixture();try{
  const request=await preparePopScanRequest(f.env,scope),signed=response(f,request);
  const row=f.sql.prepare('SELECT * FROM payment_pop_documents').get();
  await f.env.EVIDENCE.put(row.object_key,new Uint8Array([...png.slice(0,-1),2]));
  await assert.rejects(markPopScanResult(f.env,signed),/pop_object_identity_mismatch/);
  const changed=await f.env.EVIDENCE.head(row.object_key);f.sql.prepare('UPDATE payment_pop_documents SET object_etag=?').run(changed.etag);
  await assert.rejects(markPopScanResult(f.env,{...response(f,request,{etag:changed.etag})}),/pop_object_identity_mismatch/);
  f.sql.prepare("UPDATE payment_pop_documents SET scan_status='clean'").run();
  await assert.rejects(readCleanPopForOwner(f.env,{actor,...scope}),/pop_not_reviewable/);
 }finally{await f.close()}
});
test('audit failures roll back clean status and prevent private download',async()=>{
 const f=await fixture();try{
  const request=await preparePopScanRequest(f.env,scope),signed=response(f,request);
  f.sql.exec("CREATE TRIGGER fail_pop_scan_audit BEFORE INSERT ON audit_events WHEN NEW.event_type='POP_SCAN_RESULT' BEGIN SELECT RAISE(ABORT,'scan audit unavailable'); END");
  await assert.rejects(markPopScanResult(f.env,signed),/audit_write_failed/);assert.equal(f.sql.prepare('SELECT scan_status FROM payment_pop_documents').get().scan_status,'pending');
  f.sql.exec('DROP TRIGGER fail_pop_scan_audit');await markPopScanResult(f.env,signed);
  f.sql.exec("CREATE TRIGGER fail_pop_read_audit BEFORE INSERT ON audit_events WHEN NEW.event_type='POP_OWNER_DOWNLOAD' BEGIN SELECT RAISE(ABORT,'read audit unavailable'); END");
  await assert.rejects(readCleanPopForOwner(f.env,{actor,...scope}),/audit_write_failed/);assert.equal(f.sql.prepare('SELECT last_owner_read_at FROM payment_pop_documents').get().last_owner_read_at,null);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM audit_events WHERE event_type='POP_OWNER_DOWNLOAD'").get().n,0);
 }finally{await f.close()}
});
test('default-off and production contexts, revoked owner and deleted records deny private operations',async()=>{
 const f=await fixture();try{
  await assert.rejects(preparePopScanRequest({...f.env,POP_SCAN_STAGING_ENABLED:'false'},scope),/pop_scanner_forbidden/);
  await assert.rejects(preparePopScanRequest({...f.env,APP_ENV:'production'},scope),/pop_scanner_forbidden/);
  for(const secret of ['', ' '.repeat(64), 'weak', f.env.AUDIT_INTEGRITY_SECRET])await assert.rejects(preparePopScanRequest({...f.env,POP_SCAN_SECRET:secret},scope),/pop_scanner_not_configured/);
  await assert.rejects(preparePopScanRequest({...f.env,POP_SCANNER_ID:''},scope),/pop_scanner_not_configured/);
  await assert.rejects(markPopScanResult(f.env,{documentId:id,scanStatus:'clean',scannerAuthenticated:true}),/pop_scanner_forbidden/);
  const request=await preparePopScanRequest(f.env,scope);await markPopScanResult(f.env,response(f,request));
  await assert.rejects(readCleanPopForOwner(f.env,{actor:{platformOwner:false,userId:id},...scope}),/pop_owner_forbidden/);
  await assert.rejects(readCleanPopForOwner({...f.env,POP_OWNER_RETRIEVAL_STAGING_ENABLED:'false'},{actor,...scope}),/pop_owner_review_disabled/);
  await assert.rejects(readCleanPopForOwner(f.env,{actor,...scope,tenantId:'22222222-2222-4222-8222-222222222222'}),/pop_not_reviewable/);
  f.sql.exec('UPDATE payment_pop_documents SET deleted_at=CURRENT_TIMESTAMP');await assert.rejects(readCleanPopForOwner(f.env,{actor,...scope}),/pop_not_reviewable/);
 }finally{await f.close()}
});
test('renewed scan requests reject old signatures and accepted verdicts remain bound to stored bytes',async()=>{
 const f=await fixture();try{
  const old=await preparePopScanRequest(f.env,scope),oldResponse=response(f,old);
  f.sql.prepare('UPDATE payment_pop_documents SET scan_request_expires_at=?').run(Date.now()-1);
  const renewed=await preparePopScanRequest(f.env,scope);assert.notEqual(JSON.parse(old.metadata).requestId,JSON.parse(renewed.metadata).requestId);
  await assert.rejects(markPopScanResult(f.env,oldResponse),/pop_scan_transition_failed/);await markPopScanResult(f.env,response(f,renewed));
  const row=f.sql.prepare('SELECT * FROM payment_pop_documents').get();await f.env.EVIDENCE.put(row.object_key,new Uint8Array([...png.slice(0,-1),2]));
  await assert.rejects(readCleanPopForOwner(f.env,{actor,...scope}),/pop_object_identity_mismatch/);
  f.sql.prepare('UPDATE payment_pop_documents SET scan_result_body=?').run(row.scan_result_body+' ');
  await assert.rejects(readCleanPopForOwner(f.env,{actor,...scope}),/pop_not_reviewable/);
 }finally{await f.close()}
});
test('deletion during private object retrieval prevents the response and its completion audit',async()=>{
 const f=await fixture();try{
  const request=await preparePopScanRequest(f.env,scope);await markPopScanResult(f.env,response(f,request));
  const bucket=f.env.EVIDENCE;f.env.EVIDENCE={async get(key){const object=await bucket.get(key);f.sql.exec('UPDATE payment_pop_documents SET deleted_at=CURRENT_TIMESTAMP');return object}};
  await assert.rejects(readCleanPopForOwner(f.env,{actor,...scope}),/pop_not_reviewable/);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM audit_events WHERE event_type='POP_OWNER_DOWNLOAD'").get().n,0);
 }finally{await f.close()}
});
