import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('cloudflare/src/worker.js','utf8');
const code=source.slice(source.indexOf('async function claimPaymentSettlement('),source.indexOf('async function verifyAndSettlePaymentOrder('));
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE payment_orders(id TEXT PRIMARY KEY,tenant_id TEXT,status TEXT,provider TEXT,provider_payment_id TEXT,paid_at TEXT,updated_at TEXT,order_type TEXT,metadata_json TEXT);
 CREATE TABLE payment_settlement_claims(payment_order_id TEXT PRIMARY KEY,tenant_id TEXT,status TEXT,claim_token TEXT,claimed_at TEXT DEFAULT CURRENT_TIMESTAMP,applied_at TEXT,last_error TEXT);
 CREATE TABLE payment_fulfillments(payment_order_id TEXT PRIMARY KEY,tenant_id TEXT,order_type TEXT,fulfillment_status TEXT,fulfillment_json TEXT);
 CREATE TABLE subscriptions(tenant_id TEXT PRIMARY KEY,plan TEXT,status TEXT,provider TEXT,current_period_ends_at TEXT);
 INSERT INTO payment_orders VALUES('order','tenant','pending','manual_bank',NULL,NULL,NULL,'subscription','{"plan":"business"}');
 INSERT INTO subscriptions VALUES('tenant','business','trialing','none',NULL);`);
 const DB={
  prepare(sql){return {bind(...values){return {
   sql,values,
   async first(){return db.prepare(sql).get(...values)},
   async run(){return {meta:{changes:db.prepare(sql).run(...values).changes}}}
  }}}},
  async batch(stmts){db.exec('BEGIN');try{for(const s of stmts)db.prepare(s.sql).run(...s.values);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}
 };

 const ctx=vm.createContext({crypto,Date,JSON,safeJson:JSON.parse,recordReconciliation:async()=>{}});
 vm.runInContext(code+'\nthis.settle=applyVerifiedPaymentOrder;this.claim=claimPaymentSettlement;',ctx);
 return {db,env:{DB},ctx,close:()=>db.close()};
}
test('failed settlement can retry against subscriptions without updated_at and replay only once',async()=>{
 const f=fixture();try{
  f.db.exec("CREATE TRIGGER fail_once BEFORE INSERT ON subscriptions BEGIN SELECT RAISE(ABORT,'temporary failure'); END");
  const proof={verified:true,providerPaymentId:'bank-proof'};
  assert.equal((await f.ctx.settle(f.env,'order',proof)).ok,false);
  assert.equal(f.db.prepare('SELECT status FROM payment_settlement_claims').get().status,'failed');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM payment_fulfillments').get().n,0);
  f.db.exec('DROP TRIGGER fail_once');
  assert.equal((await f.ctx.settle(f.env,'order',proof)).ok,true);
  const before=f.db.prepare('SELECT * FROM subscriptions').get();
  assert.equal(before.status,'active');assert.equal(before.provider,'manual_bank');
  assert.equal((await f.ctx.settle(f.env,'order',proof)).alreadySettled,true);
  assert.deepEqual(f.db.prepare('SELECT * FROM subscriptions').get(),before);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM payment_fulfillments').get().n,1);
 }finally{f.close()}
});
test('unverified and foreign-tenant retries cannot claim failed settlement; fresh claim has one winner',async()=>{
 const f=fixture();try{
  f.db.exec("INSERT INTO payment_settlement_claims(payment_order_id,tenant_id,status,claim_token) VALUES('order','tenant','failed','old')");
  assert.equal((await f.ctx.settle(f.env,'order',{verified:false})).ok,false);
  assert.equal((await f.ctx.claim(f.env,{id:'order',tenant_id:'foreign'})).ok,false);
  const results=await Promise.all([f.ctx.claim(f.env,{id:'order',tenant_id:'tenant'}),f.ctx.claim(f.env,{id:'order',tenant_id:'tenant'})]);
  assert.equal(results.filter(r=>r.ok).length,1);
  assert.equal(f.db.prepare('SELECT status FROM subscriptions').get().status,'trialing');
 }finally{f.close()}
});
test('failure after fulfillment does not extend the subscription when retried',async()=>{
 const f=fixture();try{
  f.ctx.recordReconciliation=async()=>{throw Error('reconciliation unavailable')};
  const proof={verified:true,providerPaymentId:'bank-proof'};
  assert.equal((await f.ctx.settle(f.env,'order',proof)).ok,false);
  const before=f.db.prepare('SELECT * FROM subscriptions').get();
  assert.equal(before.status,'active');
  f.ctx.recordReconciliation=async()=>{};
  assert.equal((await f.ctx.settle(f.env,'order',proof)).alreadySettled,true);
  assert.deepEqual(f.db.prepare('SELECT * FROM subscriptions').get(),before);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM payment_fulfillments').get().n,1);
 }finally{f.close()}
});
