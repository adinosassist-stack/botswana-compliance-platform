import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/src/worker.js';
import {subscriptionDashboard} from '../cloudflare/src/platform-subscription-controls.js';
import {platformBillingAnalytics} from '../cloudflare/src/platform-billing-analytics.js';

function database({badRows,failRead=1,badAggregate,throwRead=false,email='thebedesk@gmail.com'}={}){
 let reads=0;
 const DB={prepare(sql){return {
  bind(){return this},
  async all(){if(throwRead)throw Error('PRIVATE provider diagnostic');return ++reads===failRead?badRows:{success:true,results:[]}},
  async first(){
   if(sql.includes('FROM sessions s'))return {user_id:'admin',tenant_id:'platform',email,role:'owner',last_seen_at:new Date().toISOString()};
   if(badAggregate!==undefined)return badAggregate;
   if(sql.includes('SUM(CASE WHEN s.status'))return {active:null,paused:null};
   if(sql.includes('COUNT(*) total'))return {total:0};
   if(sql.includes('amount_minor'))return {count:0,amount_minor:0,overdue:null};
   return {count:0};
  },
  async run(){throw Error('Read-only dashboard must not write')}
 }},async batch(){throw Error('Read-only dashboard must not write')}};
 return {DB,get reads(){return reads}};
}
const invalid=[null,5,'invalid',[],{}, {success:false,results:[]},{success:false,results:[{id:'untrusted'}]},
 {success:true,results:null},{success:true,results:{}},{success:true,results:[null]},
 {success:true,results:[],error:'PRIVATE provider diagnostic'}];
for(const [i,badRows] of invalid.entries()){
 test(`subscription dashboard refuses malformed/refused collection ${i}`,async()=>{
  await assert.rejects(subscriptionDashboard(database({badRows}).DB),/billing_dashboard_unavailable/);
 });
 test(`analytics refuses malformed/refused collection ${i}`,async()=>{
  await assert.rejects(platformBillingAnalytics(database({badRows}).DB),/billing_dashboard_unavailable/);
 });
}
for(let failRead=1;failRead<=6;failRead++)test(`analytics refuses failure in collection read ${failRead}`,async()=>{
 await assert.rejects(platformBillingAnalytics(database({failRead,badRows:{success:false,results:[]}}).DB),/billing_dashboard_unavailable/);
});
for(const read of [subscriptionDashboard,platformBillingAnalytics])test(`${read.name} refuses absent or malformed aggregate evidence`,async()=>{
 for(const badAggregate of [null,{}, {active:'invalid',paused:0},{count:-1,amount_minor:0,overdue:0}])
  await assert.rejects(read(database({badRows:{success:true,results:[]},badAggregate}).DB),/billing_dashboard_unavailable/);
});
for(const path of ['/api/platform/billing/manual-payments','/api/platform/billing/subscriptions','/api/platform/billing/analytics']){
 const request=()=>new Request('https://app.example'+path,{headers:{cookie:'bw_session=test'}});
 const env=f=>({DB:f.DB,SESSION_SECRET:'s'.repeat(48),PLATFORM_ADMIN_EMAILS:'thebedesk@gmail.com'});
 test(`${path} returns sanitized unavailable rather than false empty success`,async()=>{
  const f=database({badRows:{success:false,results:[],error:'PRIVATE provider diagnostic'}});
  const r=await worker.fetch(request(),env(f),{});
  assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'billing_dashboard_unavailable'});
 });
 test(`${path} preserves valid empty results`,async()=>{
  const f=database({badRows:{success:true,results:[]}});
  const r=await worker.fetch(request(),env(f),{});assert.equal(r.status,200);
  const data=await r.json();
  if(path.endsWith('analytics'))assert.equal(data.totalReceiptsBwp,0);
  else assert.deepEqual(data.items,[]);
 });
 test(`${path} sanitizes thrown read errors and unavailable aggregates`,async()=>{
  for(const options of [{throwRead:true},{badRows:{success:true,results:[]},badAggregate:null}]){
   const r=await worker.fetch(request(),env(database(options)),{});
   assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'billing_dashboard_unavailable'});
  }
 });
 test(`${path} denies customer owners before reading billing collections`,async()=>{
  const f=database({email:'customer@example.com'});
  const r=await worker.fetch(request(),env(f),{});assert.equal(r.status,403);assert.equal(f.reads,0);
 });
}
