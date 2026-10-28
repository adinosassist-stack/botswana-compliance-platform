import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import worker from '../cloudflare/src/worker.js';
import staging from '../cloudflare/src/billing-staging-entry.js';
import {renderBillingStagingConfig,billingStagingMarkerSql} from '../scripts/render-billing-staging-config.mjs';
import {prepareBillingStagingOwner} from '../scripts/prepare-billing-staging-owner.mjs';
import {prepareBillingStagingCustomers} from '../scripts/prepare-billing-staging-customers.mjs';
import {prepareBillingStagingPayments} from '../scripts/prepare-billing-staging-payments.mjs';

const inputs={BILLING_STAGING_D1_ID:'11111111-1111-4111-8111-111111111111',PRODUCTION_D1_DATABASE_ID:'22222222-2222-4222-8222-222222222222',BILLING_STAGING_SOURCE_SHA:'a'.repeat(40),BILLING_STAGING_ADMIN_EMAILS:'billing-owner@example.invalid'};
const config=renderBillingStagingConfig(inputs),origin=config.vars.PUBLIC_ORIGIN;
const authority={config,expectedDatabaseId:inputs.BILLING_STAGING_D1_ID,productionDatabaseId:inputs.PRODUCTION_D1_DATABASE_ID,sourceSha:inputs.BILLING_STAGING_SOURCE_SHA,ownerEmail:inputs.BILLING_STAGING_ADMIN_EMAILS};
const passwords={alpha:'Alpha-local-POP-password!',beta:'Beta-local-POP-password!'};
const png=new Uint8Array([137,80,78,71,13,10,26,10,1]);
async function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync('cloudflare/schema.sql','utf8'));db.exec(billingStagingMarkerSql(inputs));
 db.exec(prepareBillingStagingOwner({...authority,email:authority.ownerEmail,password:'Owner-local-POP-password!'}).sql);
 const customers=prepareBillingStagingCustomers({...authority,alphaPassword:passwords.alpha,betaPassword:passwords.beta});db.exec(customers.sql);
 const payments=prepareBillingStagingPayments(authority);db.exec(payments.sql);
 // Candidate schema exists only in this local fixture, not in a release migration.
 db.exec(readFileSync('docs/proposals/payment-pop-documents-schema.sql','utf8'));
 const DB={prepare(sql){let values=[];return {bind(...p){values=p;return this},async first(){return db.prepare(sql).get(...values)||null},async all(){return {results:db.prepare(sql).all(...values)}},async run(){return {success:true,meta:{changes:Number(db.prepare(sql).run(...values).changes)}}}}}};
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('local')}}",compatibilityDate:'2026-09-03',r2Buckets:['EVIDENCE']}));
 const EVIDENCE=await mf.getR2Bucket('EVIDENCE');
 const env={...config.vars,DB,EVIDENCE,SESSION_SECRET:'local-pop-http-session-secret-'.repeat(3)};
 async function login(key){
  const r=await worker.fetch(new Request(origin+'/api/auth/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:key+'.billing-staging@example.invalid',password:passwords[key]})}),env,{});
  assert.equal(r.status,200);const body=await r.json();return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:body.csrfToken};
 }
 const sessions={alpha:await login('alpha'),beta:await login('beta')};
 const send=({key='alpha',orderId=payments.fixtures[0].orderId,clientId,bytes=png,csrf=true,enabled=true,entry=worker,extraHeaders={}}={})=>{
  const headers={origin,cookie:sessions[key].cookie,'x-pop-order-id':orderId,'x-pop-filename':'receipt.png','content-type':'image/png',...extraHeaders};
  if(csrf)headers['x-csrf-token']=sessions[key].csrf;
  if(clientId!==undefined)headers['x-pop-document-id']=clientId;
  return entry.fetch(new Request(origin+'/api/payments/manual-bank/pop/stage',{method:'POST',headers,body:bytes}),{...env,POP_UPLOAD_STAGING_ENABLED:enabled?'true':'false'},{});
 };
 return {db,EVIDENCE,env,customers:customers.customers,payments:payments.fixtures,sessions,send,close:async()=>{db.close();await mf.dispose()}};
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test('real POP HTTP handler generates fresh IDs and ignores caller-selected document IDs',async()=>{
 const f=await fixture();try{
  const ids=[];
  for(const clientId of [undefined,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','../../forged-document']){
   const response=await f.send({clientId});assert.equal(response.status,202);const body=await response.json();
   assert.match(body.documentId,uuid);assert.notEqual(body.documentId,clientId);assert.equal(body.scanStatus,'pending');assert.equal(body.reviewable,false);ids.push(body.documentId);
   const row=f.db.prepare('SELECT * FROM payment_pop_documents WHERE id=?').get(body.documentId);
   assert.equal(row.tenant_id,f.customers[0].tenantId);assert.equal(row.payment_order_id,f.payments[0].orderId);assert.equal(row.received_by_user_id,f.customers[0].userId);
   assert.equal(row.object_key,'payment-pop/quarantine/'+row.tenant_id+'/'+row.payment_order_id+'/'+body.documentId);
   const object=await f.EVIDENCE.get(row.object_key);assert.ok(object);assert.equal(object.httpMetadata.contentType,'application/octet-stream');assert.equal(object.customMetadata.scanStatus,'pending');assert.deepEqual(new Uint8Array(await object.arrayBuffer()),png);
  }
  assert.equal(new Set(ids).size,3);assert.equal((await f.EVIDENCE.list()).objects.length,3);
  assert.equal(f.db.prepare("SELECT count(*) n FROM payment_orders WHERE status!='pending' OR paid_at IS NOT NULL").get().n,0);
  assert.equal(f.db.prepare("SELECT count(*) n FROM subscriptions WHERE status!='inactive'").get().n,0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM payment_fulfillments').get().n,0);
 }finally{await f.close()}
});

test('POP server identity change keeps session, CSRF, tenant and signature gates ahead of writes',async()=>{
 const f=await fixture();try{
  for(const [options,status,error] of [
   [{key:'beta'},404,'pop_order_not_found'],
   [{csrf:false},403,'csrf_failed'],
   [{orderId:'invalid-order'},400,'invalid_pop_id'],
   [{bytes:new Uint8Array([1,2,3,4,5,6,7,8,9])},400,'pop_signature_mismatch']
  ]){const r=await f.send(options);assert.equal(r.status,status);assert.equal((await r.json()).error,error)}
  assert.equal(f.db.prepare('SELECT count(*) n FROM payment_pop_documents').get().n,0);assert.equal((await f.EVIDENCE.list()).objects.length,0);
 }finally{await f.close()}
});

test('default-off worker and read-only billing staging still reject POP uploads without storage writes',async()=>{
 const f=await fixture();try{
  const off=await f.send({enabled:false});assert.equal(off.status,503);assert.equal((await off.json()).error,'pop_upload_disabled');
  const defaultOff=await worker.fetch(new Request(origin+'/api/payments/manual-bank/pop/stage',{method:'POST',headers:{origin,cookie:f.sessions.alpha.cookie,'x-csrf-token':f.sessions.alpha.csrf}}),f.env,{});assert.equal(defaultOff.status,503);
  const boundary=await f.send({entry:staging});assert.equal(boundary.status,403);assert.equal((await boundary.json()).error,'billing_staging_mutations_disabled');
  assert.equal(f.db.prepare('SELECT count(*) n FROM payment_pop_documents').get().n,0);assert.equal((await f.EVIDENCE.list()).objects.length,0);
 }finally{await f.close()}
});

test('metadata failure cleans only the newly allocated object and preserves an existing receipt',async()=>{
 const f=await fixture();try{
  const first=await f.send();assert.equal(first.status,202);const documentId=(await first.json()).documentId;
  const key=f.db.prepare('SELECT object_key FROM payment_pop_documents WHERE id=?').get(documentId).object_key;
  f.db.exec("CREATE TRIGGER refuse_pop_metadata BEFORE INSERT ON payment_pop_documents BEGIN SELECT RAISE(ABORT,'local metadata failure'); END");
  const failed=await f.send({clientId:documentId});assert.equal(failed.status,503);assert.equal((await failed.json()).error,'pop_staging_unavailable');
  assert.equal((await f.EVIDENCE.list()).objects.length,1);assert.ok(await f.EVIDENCE.get(key));
  assert.equal(f.db.prepare('SELECT count(*) n FROM payment_pop_documents').get().n,1);
  assert.equal(f.db.prepare("SELECT count(*) n FROM payment_orders WHERE status!='pending'").get().n,0);
 }finally{await f.close()}
});
