import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

// Real disposable local D1, exercising the checked-in production payment
// settlement helper and the already-shipped unique provider/id index.
// No bank API, production credentials, customer records or live entitlements.
const source=readFileSync('cloudflare/src/worker.js','utf8');
const from=source.indexOf('async function claimPaymentSettlement(');
const to=source.indexOf('async function verifyAndSettlePaymentOrder(',from);
assert.ok(from>0&&to>from,'production settlement helper exists');
const code=source.slice(from,to);
const txnId='BANK-SETTLED-9001';

async function fixture(){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,
  script:"export default {fetch(){return new Response('isolated')}}",
  compatibilityDate:'2026-09-03',d1Databases:{DB:'manual-bank-unique-identity-isolated'}
 }));
 try{
  const DB=await mf.getD1Database('DB');
  for(const sql of [
   'CREATE TABLE payment_orders(id TEXT PRIMARY KEY,tenant_id TEXT,status TEXT,provider TEXT,provider_payment_id TEXT,paid_at TEXT,updated_at TEXT,order_type TEXT,metadata_json TEXT)',
   'CREATE UNIQUE INDEX payment_order_provider_payment_unique ON payment_orders(provider,provider_payment_id) WHERE provider_payment_id IS NOT NULL',
   'CREATE TABLE payment_settlement_claims(payment_order_id TEXT PRIMARY KEY,tenant_id TEXT,status TEXT,claim_token TEXT,claimed_at TEXT DEFAULT CURRENT_TIMESTAMP,applied_at TEXT,last_error TEXT)',
   'CREATE TABLE payment_fulfillments(payment_order_id TEXT PRIMARY KEY,tenant_id TEXT,order_type TEXT,fulfillment_status TEXT,fulfillment_json TEXT)',
   'CREATE TABLE subscriptions(tenant_id TEXT PRIMARY KEY,plan TEXT,status TEXT,provider TEXT,current_period_ends_at TEXT)'
  ])await DB.prepare(sql).run();
  for(const [order,tenant] of [['order-a','tenant-a'],['order-b','tenant-b']]){
   await DB.batch([
    DB.prepare("INSERT INTO payment_orders(id,tenant_id,status,provider,order_type,metadata_json) VALUES(?,?,'pending','manual_bank','subscription',?)")
      .bind(order,tenant,JSON.stringify({plan:'monitor',periodMonths:1})),
    DB.prepare("INSERT INTO subscriptions(tenant_id,plan,status,provider) VALUES(?,'monitor','trialing','none')").bind(tenant)
   ]);
  }
  const ctx=vm.createContext({crypto,Date,JSON,safeJson:JSON.parse,recordReconciliation:async()=>{}});
  vm.runInContext(code+'\nthis.settle=applyVerifiedPaymentOrder;',ctx);
  return {mf,DB,settle:(order,id)=>ctx.settle({DB},order,{verified:true,status:'verified_paid',providerPaymentId:id,resultCode:'MANUAL_APPROVED'})};
 }catch(e){await mf.dispose();throw e}
}

test('one real D1 bank transaction ID never activates two different tenant invoices',async()=>{
 const f=await fixture();
 try{
  const first=await f.settle('order-a',txnId);
  assert.equal(first.ok,true);
  const second=await f.settle('order-b',txnId);
  assert.equal(second.ok,false,'same bank credit must fail');
  const orders=(await f.DB.prepare('SELECT id,status,provider_payment_id FROM payment_orders ORDER BY id').all()).results;
  assert.equal(orders[0].status,'paid');
  assert.equal(orders[0].provider_payment_id,txnId);
  assert.equal(orders[1].status,'pending');
  assert.equal(orders[1].provider_payment_id,null);
  const subscriptions=(await f.DB.prepare('SELECT tenant_id,status FROM subscriptions ORDER BY tenant_id').all()).results;
  assert.equal(subscriptions[0].status,'active');
  assert.equal(subscriptions[1].status,'trialing');
  assert.equal((await f.DB.prepare('SELECT count(*) n FROM payment_fulfillments').first()).n,1);
  const retry=await f.settle('order-b','BANK-SETTLED-9002');
  assert.equal(retry.ok,true,'new distinct settled bank identity can be recorded');
  assert.equal((await f.DB.prepare('SELECT count(*) n FROM payment_fulfillments').first()).n,2);
 }finally{await f.mf.dispose()}
});

test('parallel different-invoice claims with same bank transaction ID have only one paid winner',async()=>{
 const f=await fixture();
 try{
  const results=await Promise.all([f.settle('order-a',txnId),f.settle('order-b',txnId)]);
  assert.equal(results.filter(r=>r.ok).length,1);
  assert.equal((await f.DB.prepare("SELECT count(*) n FROM payment_orders WHERE status='paid' AND provider_payment_id=?").bind(txnId).first()).n,1);
  assert.equal((await f.DB.prepare("SELECT count(*) n FROM payment_fulfillments").first()).n,1);
  assert.equal((await f.DB.prepare("SELECT count(*) n FROM subscriptions WHERE status='active'").first()).n,1);
 }finally{await f.mf.dispose()}
});
