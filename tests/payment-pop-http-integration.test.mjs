import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {handlePopHttp} from '../cloudflare/src/payment-pop-http.js';
import {readPopBody} from '../cloudflare/src/payment-pop-http-body.js';
import {popServiceFixture,popFixtureId as id} from './helpers/payment-pop-service-fixture.mjs';
const png=new Uint8Array([137,80,78,71,13,10,26,10,1]);
const origin='https://billing-staging.thebedesk.com',foreign='22222222-2222-4222-8222-222222222222';
const upload='/api/payments/manual-bank/pop/upload',platform='/api/platform/billing/pop/';
const auth={user_id:id,tenant_id:id,role:'owner',csrf_token:'local-session-csrf'};
function req(path,{method='GET',body,headers={}}={}){return new Request(origin+path,{method,headers:{origin,'x-csrf-token':auth.csrf_token,...headers},...(body!==undefined?{body}: {})});}
async function fixture(){
 const f=popServiceFixture();
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('local')}}",compatibilityDate:'2026-09-03',r2Buckets:['EVIDENCE']}));
 f.env.EVIDENCE=await mf.getR2Bucket('EVIDENCE');
 Object.assign(f.env,{APP_ENV:'staging',DEPLOYMENT_PROFILE:'billing-staging-readonly',PUBLIC_ORIGIN:origin,
  POP_HTTP_STAGING_ENABLED:'true',POP_SCAN_STAGING_ENABLED:'true',POP_SCAN_TRANSPORT_STAGING_ENABLED:'true',
  POP_OWNER_RETRIEVAL_STAGING_ENABLED:'true',POP_RETENTION_STAGING_ENABLED:'true',POP_RECOVERY_STAGING_ENABLED:'true',
  POP_SCAN_API_URL:'https://scanner.example.com/scan',POP_SCANNER_ID:'local-scanner',
  POP_SCAN_SECRET:'independent-local-scan-secret-'.repeat(2),AUDIT_INTEGRITY_SECRET:'independent-local-audit-secret-'.repeat(2)});
 f.closeAll=async()=>{f.close();await mf.dispose()};return f;
}
async function put(f,options={}){return handlePopHttp(req(upload,{method:'POST',body:png,headers:{'x-pop-order-id':id,'x-pop-filename':'receipt.png','content-type':'image/png','idempotency-key':'local-http-receipt-upload-0001',...options.headers}}),f.env,{auth:options.auth||auth});}
function scanner(f,patch={}){return async(url,options)=>{
 assert.equal(url,'https://scanner.example.com/scan');assert.equal(options.redirect,'error');assert.equal(options.method,'POST');
 const metadata=options.body.get('metadata');
 assert.equal(options.body.get('signature'),createHmac('sha256',f.env.POP_SCAN_SECRET).update('pop-scan-request:v1:'+metadata).digest('hex'));
 assert.deepEqual(new Uint8Array(await options.body.get('file').arrayBuffer()),png);
 const m=JSON.parse(metadata),body=JSON.stringify({version:1,documentId:m.documentId,tenantId:m.tenantId,orderId:m.orderId,requestId:m.requestId,sha256:m.sha256,etag:m.etag,bytes:m.bytes,contentType:m.contentType,verdict:'clean',provider:f.env.POP_SCANNER_ID,scannedAt:Date.now(),...patch});
 return Response.json({body,signature:createHmac('sha256',f.env.POP_SCAN_SECRET).update('pop-scan-response:v1:'+body).digest('hex')});
};}
test('HTTP upload -> signed scan -> clean attachment -> retirement uses real SQLite/R2 without settling funds',async()=>{
 const f=await fixture();try{
  const uploaded=await put(f);assert.equal(uploaded.status,202);const receipt=await uploaded.json();
  assert.notEqual(receipt.documentId,id);assert.equal(receipt.bankFundsConfirmed,false);assert.equal(receipt.subscriptionActivated,false);
  const scope={documentId:receipt.documentId,tenantId:id,orderId:id},query=new URLSearchParams(scope);
  const context={auth,platformOwner:true};
  const download=()=>handlePopHttp(req(platform+'download?'+query),f.env,context);
  assert.equal((await download()).status,404);
  const result=await handlePopHttp(req(platform+'scan',{method:'POST',body:JSON.stringify(scope)}),f.env,{...context,scannerRequest:scanner(f)});
  assert.equal(result.status,200);assert.equal((await result.json()).scanStatus,'clean');
  const file=await download();assert.equal(file.status,200);assert.deepEqual(new Uint8Array(await file.arrayBuffer()),png);
  assert.match(file.headers.get('content-disposition'),/^attachment;/);assert.match(file.headers.get('cache-control'),/no-store/);
  const replay=await put(f);assert.equal(replay.status,202);assert.equal((await replay.json()).documentId,receipt.documentId);
  const row=f.sql.prepare('SELECT * FROM payment_pop_documents').get();
  const retired=await handlePopHttp(req(platform+'retire',{method:'POST',body:JSON.stringify({...scope,expectedSha256:row.content_sha256,expectedEtag:row.object_etag,reason:'Local fixture retention acceptance'})}),f.env,context);
  assert.equal(retired.status,200);assert.equal((await retired.json()).storageDeleted,true);assert.equal((await download()).status,404);
  assert.equal(f.sql.prepare('SELECT status FROM payment_orders').get().status,'pending');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM payment_fulfillments').get().n,0);
  const events=f.sql.prepare('SELECT event_type,event_hash FROM audit_events ORDER BY tenant_seq').all();
  assert.deepEqual(events.map(x=>x.event_type),['POP_SCAN_RESULT','POP_OWNER_DOWNLOAD','POP_RETIREMENT_REQUESTED','POP_STORAGE_REMOVED']);
  assert.ok(events.every(x=>/^[a-f0-9]{64}$/.test(x.event_hash)));
 }finally{await f.closeAll()}
});
test('production/default-off, anonymous, wrong role, origin, CSRF and forged platform role cannot reach dependencies',async()=>{
 const storage=new Proxy({},{get(){throw Error('must_not_touch_storage')}});
 const env={APP_ENV:'staging',DEPLOYMENT_PROFILE:'billing-staging-readonly',POP_HTTP_STAGING_ENABLED:'true',PUBLIC_ORIGIN:origin,DB:storage,EVIDENCE:storage};
 assert.equal((await handlePopHttp(req(upload,{method:'POST',body:png}),{...env,APP_ENV:'production'},{auth})).status,503);
 assert.equal((await handlePopHttp(req(upload),{...env,POP_HTTP_STAGING_ENABLED:'false'},{auth})).status,503);
 assert.equal((await handlePopHttp(req(upload),env,{})).status,401);
 assert.equal((await handlePopHttp(req(upload),env,{auth:{...auth,role:'employee'}})).status,403);
 for(const headers of [{'x-csrf-token':''},{origin:'https://foreign.example.com'}])assert.equal((await handlePopHttp(req(upload,{method:'POST',body:png,headers}),env,{auth})).status,403);
 assert.equal((await handlePopHttp(req(platform+'scan',{method:'POST',body:JSON.stringify({platformOwner:true})}),env,{auth})).status,403);
});
test('foreign tenant cannot upload to another tenant order; a customer owner cannot list/download receipts',async()=>{
 const f=await fixture();try{
  assert.equal((await put(f,{auth:{...auth,tenant_id:foreign}})).status,404);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM payment_pop_documents').get().n,0);
  assert.equal((await handlePopHttp(req(platform+'receipts?orderId='+id),f.env,{auth})).status,403);
 }finally{await f.closeAll()}
});
for(const verdict of ['blocked','failed'])test('signed '+verdict+' is recorded but never permits download',async()=>{
 const f=await fixture();try{
  const receipt=await (await put(f)).json(),scope={documentId:receipt.documentId,tenantId:id,orderId:id};
  const result=await handlePopHttp(req(platform+'scan',{method:'POST',body:JSON.stringify(scope)}),f.env,{auth,platformOwner:true,scannerRequest:scanner(f,{verdict})});
  assert.equal(result.status,200);assert.equal((await result.json()).scanStatus,verdict);
  assert.equal((await handlePopHttp(req(platform+'download?'+new URLSearchParams(scope)),f.env,{auth,platformOwner:true})).status,404);
 }finally{await f.closeAll()}
});
test('transport failure is sanitized, not retried, and cannot mark receipt clean',async()=>{
 const f=await fixture();try{
  const receipt=await (await put(f)).json(),scope={documentId:receipt.documentId,tenantId:id,orderId:id};let calls=0;
  const result=await handlePopHttp(req(platform+'scan',{method:'POST',body:JSON.stringify(scope)}),f.env,{auth,platformOwner:true,scannerRequest:async()=>{calls++;throw Error('sensitive-provider-response')}});
  assert.equal(result.status,503);assert.equal(calls,1);assert.ok(!(await result.text()).includes('sensitive'));
  assert.equal(f.sql.prepare('SELECT scan_status FROM payment_pop_documents').get().scan_status,'pending');
 }finally{await f.closeAll()}
});
test('chunked upload size is bounded even with no Content-Length',async()=>{
 let cancelled=false;
 const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(5));c.enqueue(new Uint8Array(5))},cancel(){cancelled=true}});
 await assert.rejects(readPopBody(new Request(origin,{method:'POST',body,duplex:'half'}),8),/pop_body_too_large/);assert.equal(cancelled,true);
});
test('Worker mounts staging HTTP after authenticated origin/CSRF and mutation authorization',()=>{
 const worker=readFileSync('cloudflare/src/worker.js','utf8');
 const mount=worker.indexOf('const popHttpResponse=await handlePopHttp');
 for(const gate of ['const a=await auth(req,env)','if(!mutationCsrfOk(req,a))','!restrictedWorkspaceMutationAllowed'])assert.ok(worker.indexOf(gate)<mount);
 assert.match(worker,/handlePopHttp\(req,env,\{auth:a,platformOwner:platformBillingAdmin\(a,env\)\}\)/);
});
