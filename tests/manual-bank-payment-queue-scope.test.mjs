import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';

// Run the actual Worker GET handler against a local SQLite fixture, with no bank,
// customer records, Cloudflare credentials, or writable production resources.
const worker=fs.readFileSync('cloudflare/src/worker.js','utf8');
const start=worker.indexOf('if(url.pathname==="/api/platform/billing/manual-payments"&&req.method==="GET")');
const end=worker.indexOf('const manualAdminMatch=url.pathname.match(',start);
assert.ok(start>0&&end>start,'canonical platform billing queue branch must exist');
const handler='(async()=>{'+worker.slice(start,end)+'return null;})()';

function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`
 CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT NOT NULL);
 CREATE TABLE payment_orders(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,amount_bwp REAL NOT NULL,
   metadata_json TEXT,status TEXT NOT NULL,provider TEXT NOT NULL,order_type TEXT NOT NULL,
   provider_payment_id TEXT);
 CREATE TABLE manual_payment_submissions(id TEXT PRIMARY KEY,payment_order_id TEXT NOT NULL,
   tenant_id TEXT NOT NULL,bank_reference TEXT,status TEXT NOT NULL,submitted_at TEXT,
   reviewed_at TEXT,rejection_reason TEXT,reviewed_by_user_id TEXT);
 INSERT INTO tenants VALUES('alpha','Alpha Client'),('beta','Beta Client');
 `);
 const add=(id,{orderTenant='alpha',submissionTenant=orderTenant,provider='manual_bank',type='subscription',
   orderStatus='pending',reviewStatus='submitted'}={})=>{
   db.prepare('INSERT INTO payment_orders VALUES(?,?,?,?,?,?,?,NULL)')
     .run(id,orderTenant,149,'{"plan":"business"}',orderStatus,provider,type);
   db.prepare('INSERT INTO manual_payment_submissions VALUES(?,?,?,?,?,?,NULL,NULL,NULL)')
     .run('submission-'+id,id,submissionTenant,'CUSTOMER-REF',reviewStatus,'2026-11-07 12:00:00');
 };
 add('valid');
 add('recover',{orderStatus:'paid',reviewStatus:'reviewing'});
 add('other-provider',{provider:'dpo'});
 add('credit-order',{type:'ai_credits'});
 add('canceled',{orderStatus:'canceled'});
 add('cross-tenant',{submissionTenant:'beta'});
 add('closed-review',{reviewStatus:'approved'});
 add('unknown-tenant',{orderTenant:'absent'});
 const env={DB:{prepare(sql){
   const statement=db.prepare(sql);
   return {async all(){return {results:statement.all()}},async first(){return statement.get()}};
 }}};
 const run=({admin=true,role='owner',dbOverride=env.DB}={})=>vm.runInNewContext(handler,{
   url:new URL('https://example.invalid/api/platform/billing/manual-payments'),req:{method:'GET'},
   env:{DB:dbOverride},a:{role},roleAllowed:(_,wanted)=>role===wanted,platformBillingAdmin:()=>admin,
   billingDashboardRows:value=>{if(!Array.isArray(value?.results))throw Error('invalid_rows');return value.results},
   billingDashboardAggregate:(value,keys)=>{for(const key of keys)if(!Number.isSafeInteger(value?.[key]))throw Error('invalid_count')},
   safeJson:(value,fallback)=>{try{return JSON.parse(value)}catch{return fallback}},
   json:(body,status=200)=>({status,body})
 });
 return {db,run};
}

test('owner queue and counter show only same-tenant actionable manual-bank subscriptions',async()=>{
 const {db,run}=fixture();
 try{
   const result=await run();
   assert.equal(result.status,200);
   assert.equal(result.body.total,2);
   assert.deepEqual(Array.from(result.body.items,row=>row.payment_order_id).sort(),['recover','valid']);
   assert.equal(result.body.items.find(row=>row.payment_order_id==='recover').order_status,'paid');
   assert.equal(result.body.items[0].metadata.plan,'business');
 }finally{db.close()}
});

test('approval lookup rejects a cross-tenant submission/order even if ids match',()=>{
 const {db}=fixture();
 try{
   const query=worker.match(/`SELECT m\.\*,o\.amount_bwp[\s\S]*?LIMIT 1`/);
   assert.ok(query,'payment approval SELECT must exist');
   const sql=query[0].slice(1,-1);
   assert.equal(db.prepare(sql).get('submission-cross-tenant'),undefined);
   assert.equal(db.prepare(sql).get('submission-valid').tenant_id,'alpha');
 }finally{db.close()}
});

test('queue denies unauthorized administrators before reading cross-client evidence',async()=>{
 const {db,run}=fixture();
 try{
   for(const options of [{admin:false},{role:'manager'}]){
     const result=await run({...options,dbOverride:{prepare(){throw Error('must not read DB')}}});
     assert.equal(result.status,403);
     assert.equal(result.body.error,'platform_billing_forbidden');
   }
 }finally{db.close()}
});

test('database failure is a visible 503, never an empty success queue',async()=>{
 const {db,run}=fixture();
 try{
   const result=await run({dbOverride:{prepare(){throw Error('unavailable')}}});
   assert.equal(result.status,503);
   assert.equal(result.body.error,'billing_dashboard_unavailable');
 }finally{db.close()}
});
