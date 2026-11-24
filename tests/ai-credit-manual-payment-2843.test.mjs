import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';

const source=readFileSync('cloudflare/src/worker.js','utf8');
const segment=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const routes={
 checkout:segment('if(url.pathname==="/api/payments/ai-credit-checkout"','if(url.pathname==="/api/payments/service-checkout"'),
 submit:segment('if(url.pathname==="/api/payments/manual-bank/submit"','if(url.pathname==="/api/platform/billing/analytics"'),
 review:segment('const manualAdminMatch=url.pathname.match(','if(url.pathname==="/api/payments/ai-credit-checkout"')
};
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync('cloudflare/schema.sql','utf8'));
 db.exec("INSERT INTO tenants(id,name) VALUES('tenant-a','Synthetic'); INSERT INTO users(id,email) VALUES('owner-a','synthetic@example.invalid')");
 const DB={prepare(sql){let values=[];return {sql,get values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)},async all(){return {results:db.prepare(sql).all(...values)}},async run(){return {meta:{changes:db.prepare(sql).run(...values).changes}}}}},async batch(items){db.exec('BEGIN');try{const results=[];for(const item of items)results.push(await item.run());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}};
 const env={DB};
 const context=vm.createContext({crypto,Date,JSON,env,a:{role:'owner',tenant_id:'tenant-a',user_id:'owner-a'},
 roleAllowed:(a,role)=>a.role===role,platformBillingAdmin:()=>true,readJson:async()=>context.body,
 json:(body,status=200)=>({body,status}),safeJson:(s,f)=>{try{return JSON.parse(s)}catch{return f}},
 id:()=>crypto.randomUUID(),PAYMENT_ORDER_ID_RE:/^[0-9a-f-]{36}$/i,normalizeBankReference:s=>String(s).trim().toUpperCase(),
 manualBankConfig:()=>({configured:context.bankConfigured,bankName:'Synthetic bank',accountNumber:'000000'}),manualPaymentReference:id=>'THEBE-'+id,
 idempotentJsonMutation:async(e,a,r,k,p,fn)=>{const x=await fn();return {status:x.status,body:x.body}},
 writeAudit:async()=>{},recordReconciliation:async()=>{},boundedReportText:(v,n)=>String(v).slice(0,n),
 appendSealedAuditEvent:async(e,{mutation,completionReceipt})=>{const result=await e.DB.batch([mutation,completionReceipt]);return {ok:result[0].meta.changes===1}},
 bankConfigured:true});
 vm.runInContext(segment('async function createPaymentOrder(','const DPO_PAID_CODE=')+segment('async function claimPaymentSettlement(','async function verifyAndSettlePaymentOrder('),context);
 // Real wallet storage with no monthly-allowance side effects in this fixture.
 context.aiWallet=async(e,tenant)=>{await e.DB.prepare('INSERT OR IGNORE INTO ai_credit_wallets(tenant_id,balance,monthly_allowance) VALUES(?,0,0)').bind(tenant).run();return e.DB.prepare('SELECT * FROM ai_credit_wallets WHERE tenant_id=?').bind(tenant).first()};
 const run=async(name,body,role='owner')=>{context.body=body;context.a.role=role;context.req={method:'POST'};context.url=new URL('https://example.invalid'+(name==='review'?'/api/platform/billing/manual-payments/'+body.submissionId+'/approve':name==='checkout'?'/api/payments/ai-credit-checkout':'/api/payments/manual-bank/submit'));return vm.runInContext('(async()=>{'+routes[name]+'})()',context)};
 return {db,run,context,close:()=>db.close()};
}
const proof={bankFundsConfirmed:true,bankAmountMatched:true,bankTransactionMatched:true,bankTransactionId:'BANK-SETTLED-2843'};
async function checkout(f){const r=await f.run('checkout',{sku:'AI50'});assert.equal(r.status,201);return r.body}

test('credit checkout provides manual bank instructions and never grants credits',async()=>{
 const f=fixture();try{const r=await checkout(f);assert.equal(r.checkoutMode,'manual_bank_transfer');assert.ok(r.bankTransfer.reference);assert.equal(f.db.prepare('SELECT provider FROM payment_orders WHERE id=?').get(r.paymentOrder.id).provider,'manual_bank');assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ai_credit_ledger WHERE entry_type='purchase'").get().n,0)}finally{f.close()}
});
test('unconfigured bank and non-owner fail before creating a credit order',async()=>{
 const f=fixture();try{f.context.bankConfigured=false;assert.equal((await f.run('checkout',{sku:'AI50'})).status,503);assert.equal((await f.run('checkout',{sku:'AI50'},'manager')).status,403);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM payment_orders').get().n,0)}finally{f.close()}
});
test('manual credit submit and bank-confirmed review allocate exactly once across retries',async()=>{
 const f=fixture();try{const r=await checkout(f),paymentOrderId=r.paymentOrder.id;
 const submitted=await f.run('submit',{paymentOrderId,bankReference:'CUSTOMER-2843'});assert.equal(submitted.status,201);
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ai_credit_ledger WHERE entry_type='purchase'").get().n,0);
 const submissionId=submitted.body.submissionId;
 assert.equal((await f.run('review',{...proof,submissionId,bankFundsConfirmed:false})).status,400);
 assert.equal((await f.run('review',{...proof,submissionId})).status,200);
 const wallet=f.db.prepare("SELECT balance,lifetime_purchased FROM ai_credit_wallets WHERE tenant_id='tenant-a'").get();
 assert.equal(wallet.balance,r.pack.credits);assert.equal(wallet.lifetime_purchased,r.pack.credits);
 assert.equal((await f.run('review',{...proof,submissionId})).status,409);
 assert.deepEqual(f.db.prepare("SELECT balance,lifetime_purchased FROM ai_credit_wallets WHERE tenant_id='tenant-a'").get(),wallet);
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ai_credit_ledger WHERE entry_type='purchase'").get().n,1);
 }finally{f.close()}
});

test('pending credit checkout reuses order; rejected review requires a fresh order',async()=>{
 const f=fixture();try{
 const first=await checkout(f),again=await f.run('checkout',{sku:'AI50'});
 assert.equal(again.status,200);assert.equal(again.body.paymentOrder.id,first.paymentOrder.id);
 const submitted=await f.run('submit',{paymentOrderId:first.paymentOrder.id,bankReference:'CUSTOMER-FIRST'});
 f.db.prepare("UPDATE manual_payment_submissions SET status='rejected' WHERE id=?").run(submitted.body.submissionId);
 const fresh=await checkout(f);assert.notEqual(fresh.paymentOrder.id,first.paymentOrder.id);
 assert.equal((await f.run('submit',{paymentOrderId:first.paymentOrder.id,bankReference:'CUSTOMER-RETRY'})).status,409);
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ai_credit_ledger WHERE entry_type='purchase'").get().n,0);
 }finally{f.close()}
});
test('foreign tenant and non-owner cannot submit credit payment evidence',async()=>{
 const f=fixture();try{const r=await checkout(f),body={paymentOrderId:r.paymentOrder.id,bankReference:'CUSTOMER-FOREIGN'};
 assert.equal((await f.run('submit',body,'manager')).status,403);
 f.context.a.tenant_id='foreign';assert.equal((await f.run('submit',body)).status,404);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM manual_payment_submissions').get().n,0);
 }finally{f.close()}
});
test('credit review requires every bank attestation and cannot use customer reference',async()=>{
 const f=fixture();try{const r=await checkout(f),submitted=await f.run('submit',{paymentOrderId:r.paymentOrder.id,bankReference:'CUSTOMER-2843'}),submissionId=submitted.body.submissionId;
 for(const key of ['bankFundsConfirmed','bankAmountMatched','bankTransactionMatched'])assert.equal((await f.run('review',{...proof,submissionId,[key]:false})).status,400);
 assert.equal((await f.run('review',{...proof,submissionId,bankTransactionId:'CUSTOMER-2843'})).status,400);
 assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ai_credit_ledger WHERE entry_type='purchase'").get().n,0);
 }finally{f.close()}
});
test('credit settlement batch rollback retries once; simultaneous claims have one winner',async()=>{
 const f=fixture();try{const r=await checkout(f),order=r.paymentOrder.id;
 f.db.exec("CREATE TRIGGER fail_credit BEFORE INSERT ON ai_credit_ledger BEGIN SELECT RAISE(ABORT,'temporary failure'); END");
 assert.equal((await f.context.applyVerifiedPaymentOrder(f.context.env,order,{verified:true,providerPaymentId:proof.bankTransactionId})).ok,false);
 assert.equal(f.db.prepare('SELECT status FROM payment_orders WHERE id=?').get(order).status,'pending');
 assert.equal(f.db.prepare('SELECT balance FROM ai_credit_wallets').get().balance,0);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM payment_fulfillments').get().n,0);
 f.db.exec('DROP TRIGGER fail_credit');
 const results=await Promise.all([1,2].map(()=>f.context.applyVerifiedPaymentOrder(f.context.env,order,{verified:true,providerPaymentId:proof.bankTransactionId})));
 assert.equal(results.filter(x=>x.ok).length,1);
 assert.equal(f.db.prepare('SELECT balance FROM ai_credit_wallets').get().balance,r.pack.credits);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM ai_credit_ledger').get().n,1);
 }finally{f.close()}
});
test('paid credit order with missing durable purchase ledger cannot finish review',async()=>{
 const f=fixture();try{const r=await checkout(f),submitted=await f.run('submit',{paymentOrderId:r.paymentOrder.id,bankReference:'CUSTOMER-LOST'}),submissionId=submitted.body.submissionId;
 await f.context.applyVerifiedPaymentOrder(f.context.env,r.paymentOrder.id,{verified:true,providerPaymentId:proof.bankTransactionId});
 f.db.exec('DELETE FROM ai_credit_ledger');
 assert.equal((await f.run('review',{...proof,submissionId})).status,409);
 assert.equal(f.db.prepare('SELECT status FROM manual_payment_submissions').get().status,'submitted');
 }finally{f.close()}
});

test('one settled bank transaction cannot fund two credit orders across tenants',async()=>{
 const f=fixture();try{const first=await checkout(f);f.db.exec("INSERT INTO tenants(id,name) VALUES('tenant-b','Synthetic second tenant')");
 f.context.a.tenant_id='tenant-b';const second=await checkout(f);
 const proofInput={verified:true,providerPaymentId:proof.bankTransactionId};
 assert.equal((await f.context.applyVerifiedPaymentOrder(f.context.env,first.paymentOrder.id,proofInput)).ok,true);
 assert.equal((await f.context.applyVerifiedPaymentOrder(f.context.env,second.paymentOrder.id,proofInput)).ok,false);
 assert.equal(f.db.prepare("SELECT balance FROM ai_credit_wallets WHERE tenant_id='tenant-b'").get().balance,0);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM ai_credit_ledger').get().n,1);
 assert.equal(f.db.prepare('SELECT status FROM payment_orders WHERE id=?').get(second.paymentOrder.id).status,'pending');
 }finally{f.close()}
});
test('invalid pack configuration and fractional credits cannot allocate',async()=>{
 const f=fixture();try{f.db.exec("UPDATE ai_credit_packs SET credits=0 WHERE sku='AI50'");
 assert.equal((await f.run('checkout',{sku:'AI50'})).status,503);
 f.db.exec("UPDATE ai_credit_packs SET credits=50 WHERE sku='AI50'");const r=await checkout(f);
 f.db.prepare('UPDATE payment_orders SET metadata_json=? WHERE id=?').run('{"credits":1.5}',r.paymentOrder.id);
 assert.equal((await f.context.applyVerifiedPaymentOrder(f.context.env,r.paymentOrder.id,{verified:true,providerPaymentId:proof.bankTransactionId})).ok,false);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM ai_credit_ledger').get().n,0);
 assert.equal(f.db.prepare('SELECT status FROM payment_orders WHERE id=?').get(r.paymentOrder.id).status,'pending');
 }finally{f.close()}
});
