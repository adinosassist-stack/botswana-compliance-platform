// Synthetic-only POP 070/071 application boundary qualification.
// All D1 and R2 interfaces are in-memory fakes; no Cloudflare requests or client data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {stagePopSubmission} from '../cloudflare/src/payment-pop-staging-service.js';
import {popServiceFixture,popFixtureId} from './helpers/payment-pop-service-fixture.mjs';

const B={tenant:'22222222-2222-4222-8222-222222222222',
 order:'33333333-3333-4333-8333-333333333333',
 user:'44444444-4444-4444-8444-444444444444',
 document:'55555555-5555-4555-8555-555555555555'};
const bytes=new Uint8Array([137,80,78,71,13,10,26,10,1]);
const options={
 orderId:popFixtureId,documentId:popFixtureId,
 bytes,name:'receipt.png',contentType:'image/png',
 requestKey:'local-pop-tenant-boundary-key-0001'
};
function secondTenant(f){
 f.sql.prepare('INSERT INTO tenants(id,name) VALUES(?,?)').run(B.tenant,'Synthetic second tenant');
 f.sql.prepare('INSERT INTO users(id,email) VALUES(?,?)').run(B.user,'isolated-pop-b@example.invalid');
 f.sql.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'owner','active')").run(B.tenant,B.user);
 f.sql.prepare("INSERT INTO payment_orders(id,tenant_id,order_type,provider,status,amount_bwp,idempotency_key) VALUES(?,?,'subscription','manual_bank','pending',349,?)").run(B.order,B.tenant,'synthetic-b-order');
 return {tenantId:B.tenant,role:'owner',userId:B.user};
}
const count=(f,table)=>f.sql.prepare('SELECT COUNT(*) AS n FROM "'+table+'"').get().n;
test('same idempotency key stays isolated by tenant and order; replay never activates subscriptions',async()=>{
 const f=popServiceFixture();
 try{
  const otherSession=secondTenant(f);
  // Cross-tenant order IDs and caller claims do not confer authorization.
  await assert.rejects(
   stagePopSubmission(f.env,{...options,session:otherSession}),
   /pop_order_not_found/);
  assert.equal(f.counts().puts,0);
  const a=await stagePopSubmission(f.env,{...options,session:f.session});
  const b=await stagePopSubmission(f.env,{
   ...options,orderId:B.order,documentId:B.document,session:otherSession
  });
  for(const r of [a,b]){
   assert.equal(r.scanStatus,'pending');
   assert.equal(r.reviewable,false);
   assert.equal(r.bankFundsConfirmed,false);
   assert.equal(r.subscriptionActivated,false);
  }
  assert.notEqual(a.documentId,b.documentId);
  assert.equal(count(f,'payment_pop_documents'),2);
  assert.equal(count(f,'payment_pop_upload_requests'),2);
  assert.equal(f.objects.size,2);
  assert.deepEqual(f.counts(),{puts:2,deletes:0});
  for(const [tenant,order] of [[popFixtureId,popFixtureId],[B.tenant,B.order]]){
   const row=f.sql.prepare(
    'SELECT object_key,scan_status FROM payment_pop_documents WHERE tenant_id=? AND payment_order_id=?'
   ).get(tenant,order);
   assert.equal(row.scan_status,'pending');
   assert.ok(row.object_key.startsWith('payment-pop/quarantine/'+tenant+'/'+order+'/'));
   assert.ok(f.objects.has(row.object_key));
  }
  const aReplay=await stagePopSubmission(f.env,{
   ...options,documentId:crypto.randomUUID(),session:f.session
  });
  const bReplay=await stagePopSubmission(f.env,{
   ...options,orderId:B.order,documentId:crypto.randomUUID(),session:otherSession
  });
  assert.equal(aReplay.documentId,a.documentId);
  assert.equal(bReplay.documentId,b.documentId);
  assert.equal(aReplay.replayed,true);
  assert.equal(bReplay.replayed,true);
  await assert.rejects(
   stagePopSubmission(f.env,{
    ...options,orderId:B.order,documentId:crypto.randomUUID(),session:otherSession,
    bytes:new Uint8Array([...bytes,2])
   }),/pop_idempotency_conflict/);
  assert.deepEqual(f.counts(),{puts:2,deletes:0});
  assert.equal(count(f,'payment_pop_documents'),2);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM payment_orders WHERE status != 'pending' OR paid_at IS NOT NULL").get().n,0);
  assert.equal(count(f,'payment_fulfillments'),0);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM subscriptions WHERE status != 'inactive'").get().n,0);
 }finally{f.close()}
});
test('revoked/settled or wrong-provider orders fail before storage even when replay key is known',async()=>{
 const f=popServiceFixture();
 try{
  const initial=await stagePopSubmission(f.env,{...options,session:f.session});
  assert.equal(initial.replayed,false);
  f.sql.prepare("UPDATE payment_orders SET status='paid' WHERE id=?").run(popFixtureId);
  await assert.rejects(stagePopSubmission(f.env,{
   ...options,documentId:crypto.randomUUID(),session:f.session
  }),/pop_order_not_submittable/);
  f.sql.prepare("UPDATE payment_orders SET status='pending',provider='dpo' WHERE id=?").run(popFixtureId);
  await assert.rejects(stagePopSubmission(f.env,{
   ...options,documentId:crypto.randomUUID(),session:f.session
  }),/pop_order_not_eligible/);
  assert.deepEqual(f.counts(),{puts:1,deletes:0});
  assert.equal(count(f,'payment_pop_documents'),1);
  assert.equal(count(f,'payment_fulfillments'),0);
 }finally{f.close()}
});
