import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

// Execute the real checkout and submission route SQL against isolated D1.
// Stub only external helpers; no bank, live DB, billing activation, or production API is contacted.
const worker=fs.readFileSync(new URL('../cloudflare/src/worker.js',import.meta.url),'utf8');
const checkoutStart=worker.indexOf('if(url.pathname==="/api/payments/subscription-checkout"&&req.method==="POST")');
const checkoutEnd=worker.indexOf('if(url.pathname==="/api/payments/manual-bank/config"',checkoutStart);
const submitStart=worker.indexOf('if(url.pathname==="/api/payments/manual-bank/submit"&&req.method==="POST")');
const submitEnd=worker.indexOf('if(url.pathname==="/api/platform/billing/analytics"',submitStart);
assert.ok(checkoutStart>=0&&checkoutEnd>checkoutStart&&submitStart>=0&&submitEnd>submitStart);
const checkoutRoute='(async()=>{'+worker.slice(checkoutStart,checkoutEnd)+'})()';
const submissionRoute='(async()=>{'+worker.slice(submitStart,submitEnd)+'})()';
const paymentIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test('rejected manual-bank attempt remains sealed while a new order accepts a fresh submission',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('local')}}",compatibilityDate:'2026-09-03',d1Databases:{DB:'manual-bank-resubmission-isolated'}}));
 try{
  const DB=await mf.getD1Database('DB');
  await DB.prepare('CREATE TABLE tenants(id TEXT PRIMARY KEY)').run();
  await DB.prepare(`CREATE TABLE payment_orders(
   id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,order_type TEXT NOT NULL,provider TEXT,
   amount_bwp REAL NOT NULL,status TEXT NOT NULL,idempotency_key TEXT,metadata_json TEXT,
   created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`).run();
  await DB.prepare("INSERT INTO tenants(id) VALUES('client')").run();
  const migration=fs.readFileSync(new URL('../cloudflare/migrations/050_v115_manual_bank_subscriptions.sql',import.meta.url),'utf8');
  // The migration contains only schema statements and indexes.
  for(const sql of migration.match(/CREATE TABLE IF NOT EXISTS \w+\([\s\S]*?\);|CREATE INDEX IF NOT EXISTS [^;]+;/g)||[])await DB.prepare(sql).run();
  let audits=0;
  const actor={role:'owner',tenant_id:'client',user_id:'customer-owner'};
  const insertOrder=async(id,metadata={plan:'business',billingCycle:'monthly'})=>{
   await DB.prepare(`INSERT INTO payment_orders(id,tenant_id,order_type,provider,amount_bwp,status,metadata_json)
    VALUES(?,'client','subscription','manual_bank',349,'pending',?)`).bind(id,JSON.stringify(metadata)).run();
  };
  const invoke=(route,url,body)=>vm.runInNewContext(route,{
   url:new URL('https://example.invalid'+url),req:{method:'POST',body},a:actor,env:{DB},
   roleAllowed:(a,role)=>a.role===role,readJson:async req=>req.body,
   idempotentJsonMutation:async(_env,_a,_req,_operation,_payload,callback)=>callback(),
   PLAN_PRICE_BWP:{business:349},SELF_SERVE_PLAN_IDS:new Set(['business']),
   manualBankConfig:()=>({configured:true,bankName:'local test bank'}),
   safeJson:(s,other)=>{try{return JSON.parse(s)}catch{return other}},
   createPaymentOrder:async(_env,{amountBwp,metadata})=>{
    const id=crypto.randomUUID();await insertOrder(id,metadata);return {id,amountBwp};
   },
   manualPaymentReference:id=>'TEST-'+id,
   normalizeBankReference:v=>String(v||'').trim().replace(/\s+/g,' ').toUpperCase(),
   PAYMENT_ORDER_ID_RE:paymentIdPattern,id:()=>crypto.randomUUID(),
   json:(body,status=200)=>({status,body}),
   writeAudit:async()=>{audits++}
  });
  const checkout=()=>invoke(checkoutRoute,'/api/payments/subscription-checkout',{plan:'business',billingCycle:'monthly'});
  const submit=(orderId,bankReference)=>invoke(submissionRoute,'/api/payments/manual-bank/submit',{paymentOrderId:orderId,bankReference});
  const count=async table=>(await DB.prepare('SELECT COUNT(*) n FROM '+table).first()).n;

  const firstCheckout=await checkout();assert.equal(firstCheckout.status,201);
  const oldOrder=firstCheckout.body.paymentOrder.id;
  assert.equal((await submit(oldOrder,'BANK-ONE-123')).status,201);
  const old=await DB.prepare('SELECT id FROM manual_payment_submissions WHERE payment_order_id=?').bind(oldOrder).first();
  await DB.prepare(`UPDATE manual_payment_submissions SET status='rejected',reviewed_by_user_id='billing-admin',
   rejection_reason='Bank settlement not found',reviewed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(old.id).run();
  const beforeEvents=await count('manual_payment_events'),beforeAudits=audits;
  const retries=await Promise.all([submit(oldOrder,'BANK-TWO-123'),submit(oldOrder,'BANK-THREE-123')]);
  assert.deepEqual(retries.map(x=>x.status).sort(),[409,409]);
  assert.ok(retries.every(x=>x.body.error==='manual_payment_review_closed'));
  const unchanged=await DB.prepare('SELECT * FROM manual_payment_submissions WHERE id=?').bind(old.id).first();
  assert.equal(unchanged.status,'rejected');
  assert.equal(unchanged.bank_reference,'BANK-ONE-123');
  assert.equal(unchanged.reviewed_by_user_id,'billing-admin');
  assert.equal(unchanged.rejection_reason,'Bank settlement not found');
  assert.equal(await count('manual_payment_events'),beforeEvents);
  assert.equal(audits,beforeAudits);

  const replacement=await checkout();
  assert.equal(replacement.status,201,'checkout must not recycle rejected review order');
  const newOrder=replacement.body.paymentOrder.id;assert.notEqual(newOrder,oldOrder);
  assert.equal((await submit(newOrder,'BANK-NEW-456')).status,201);
  const fresh=await DB.prepare('SELECT * FROM manual_payment_submissions WHERE payment_order_id=?').bind(newOrder).first();
  assert.equal(fresh.status,'submitted');
  assert.notEqual(fresh.id,old.id);
  assert.equal((await DB.prepare('SELECT status FROM manual_payment_submissions WHERE id=?').bind(old.id).first()).status,'rejected');
  assert.equal(await count('manual_payment_events'),beforeEvents+1);
  assert.equal(audits,beforeAudits+1);
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM payment_orders WHERE status='paid'").first()).n,0);

  // A review claimed by an administrator cannot be rewritten by a customer mid-review.
  await DB.prepare("UPDATE manual_payment_submissions SET status='reviewing',reviewed_by_user_id='billing-admin' WHERE id=?").bind(fresh.id).run();
  assert.equal((await submit(newOrder,'BANK-CHANGED-999')).status,409);
  assert.equal((await DB.prepare('SELECT bank_reference FROM manual_payment_submissions WHERE id=?').bind(fresh.id).first()).bank_reference,'BANK-NEW-456');
 }finally{await mf.dispose()}
});
