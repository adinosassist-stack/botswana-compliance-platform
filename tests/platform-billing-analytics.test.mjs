import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import vm from 'node:vm';
import {platformBillingAnalytics} from '../cloudflare/src/platform-billing-analytics.js';
import worker from '../cloudflare/src/worker.js';
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(`CREATE TABLE tenants(id TEXT,name TEXT);CREATE TABLE subscriptions(tenant_id TEXT,plan TEXT,status TEXT,provider TEXT,current_period_ends_at TEXT);CREATE TABLE payment_orders(id TEXT,tenant_id TEXT,provider TEXT,order_type TEXT,status TEXT,amount_bwp REAL,paid_at TEXT);CREATE TABLE payment_fulfillments(payment_order_id TEXT,tenant_id TEXT,fulfillment_status TEXT);CREATE TABLE manual_payment_submissions(payment_order_id TEXT,tenant_id TEXT,status TEXT,submitted_at TEXT);CREATE TABLE manual_payment_events(id TEXT,tenant_id TEXT,event_type TEXT,created_at TEXT);CREATE TABLE audit_events(id INTEGER,tenant_id TEXT,event_type TEXT,event_data TEXT,occurred_at TEXT);
 INSERT INTO tenants VALUES('a','Client Alpha'),('p','Paused client'),('e','Expired client'),('c','Canceled client');
 INSERT INTO subscriptions VALUES('a','business','active','manual_bank','2026-10-30 12:00:00'),('p','pro','paused','manual_bank','2026-12-01'),('e','starter','active','manual_bank','2026-10-01'),('c','business','canceled','manual_bank','2026-12-01');
 INSERT INTO payment_orders VALUES('may','a','manual_bank','subscription','paid',100.10,'2026-05-01 00:00:00'),('oct','a','manual_bank','subscription','paid',49.90,'2026-10-25 11:00:00'),('refunded','a','manual_bank','subscription','refunded',999,'2026-10-01'),('service','a','manual_bank','service','paid',500,'2026-10-01'),('unfulfilled','a','manual_bank','subscription','paid',777,'2026-10-01'),('future','a','manual_bank','subscription','paid',888,'2026-10-26'),('pending','a','manual_bank','subscription','pending',349,NULL),('old','a','manual_bank','subscription','paid',111,'2026-04-30 23:59:59');
 INSERT INTO payment_fulfillments VALUES('may','a','applied'),('may','a','applied'),('oct','a','applied'),('refunded','a','applied'),('service','a','applied'),('future','a','applied'),('old','a','applied');
 INSERT INTO manual_payment_submissions VALUES('pending','a','submitted','2026-10-22 11:00:00');
 INSERT INTO manual_payment_events VALUES('ev1','a','approved_and_activated','2026-10-25 09:00:00');
 INSERT INTO audit_events VALUES(1,'p','SUBSCRIPTION_ACCESS_CHANGED','{"to":"paused","reason":"PRIVATE REASON"}','2026-10-25 11:00:00');`);
 let reads=0;const DB={prepare(query){assert.match(query.trim(),/^SELECT /,'analytics must remain read only');reads++;let args=[];return {bind(...values){args=values;return this},async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}}}}};
 return {sql,DB,get reads(){return reads}};
}
const now=new Date('2026-10-25T12:00:00Z');
test('receipt graph uses fulfilled subscription orders once and zero-fills calendar months',async()=>{
 const f=fixture(),r=await platformBillingAnalytics(f.DB,{now});assert.deepEqual(r.receipts.map(x=>x.month),['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10']);assert.deepEqual(r.receipts.map(x=>x.amountBwp),[100.10,0,0,0,0,49.90]);assert.equal(r.totalReceiptsBwp,150);assert.equal(r.receipts.reduce((n,x)=>n+x.payments,0),2);assert.equal(r.currency,'BWP');assert.equal(r.scope,'manual_bank_subscriptions');
});
test('status ring, active plan mix and renewal queue use real current subscriptions',async()=>{
 const r=await platformBillingAnalytics(fixture().DB,{now});assert.deepEqual(r.status,{active:1,paused:1,expired:1,inactive:1});assert.equal(r.plans.length,1);assert.equal(r.plans[0].plan,'business');assert.equal(r.plans[0].clients,1);assert.equal(r.renewals.count,1);assert.equal(r.renewals.items[0].tenant_name,'Client Alpha');
});
test('unverified transfers remain separate from receipts and show review aging',async()=>{
 const r=await platformBillingAnalytics(fixture().DB,{now});assert.deepEqual(r.pending,{count:1,amountBwp:349,overdue:1});assert.equal(r.totalReceiptsBwp,150);
});
test('activity is time-ordered without exposing audit reasons',async()=>{
 const r=await platformBillingAnalytics(fixture().DB,{now});assert.equal(r.activity[0].action,'paused');assert.equal(r.activity[1].action,'approved_and_activated');assert.doesNotMatch(JSON.stringify(r),/PRIVATE REASON/);
});
test('date range changes totals and invalid periods are rejected before a query',async()=>{
 const f=fixture();const r=await platformBillingAnalytics(f.DB,{months:3,now});assert.equal(r.receipts.length,3);assert.equal(r.totalReceiptsBwp,49.90);const reads=f.reads;
 for(const months of [0,1,4,13,6.5,'6'])await assert.rejects(platformBillingAnalytics(f.DB,{months,now}),/invalid_analytics_period/);assert.equal(f.reads,reads);
});
test('calendar periods cross years correctly and empty datasets render real zeros',async()=>{
 const f=fixture();for(const table of ['subscriptions','payment_orders','manual_payment_submissions','manual_payment_events','audit_events'])f.sql.exec('DELETE FROM '+table);
 const r=await platformBillingAnalytics(f.DB,{months:3,now:new Date('2026-01-01T00:00:00Z')});assert.deepEqual(r.receipts.map(x=>x.month),['2025-11','2025-12','2026-01']);assert.equal(r.totalReceiptsBwp,0);assert.equal(r.pending.count,0);assert.equal(r.renewals.count,0);assert.deepEqual(r.activity,[]);
});
test('analytics endpoint denies customer owners and validates admin period input',async()=>{
 let email='client@example.com';const DB={prepare(){return {bind(){return this},async first(){return {user_id:'u',tenant_id:'t',email,role:'owner',last_seen_at:new Date().toISOString()}}}}};
 const fetch=()=>worker.fetch(new Request('https://app.example/api/platform/billing/analytics?months=999',{headers:{cookie:'bw_session=test'}}),{DB,SESSION_SECRET:'s'.repeat(48),PLATFORM_ADMIN_EMAILS:'thebedesk@gmail.com'},{});
 assert.equal((await fetch()).status,403);email='thebedesk@gmail.com';assert.equal((await fetch()).status,400);
});
function front(request){
 const els=new Map(['platformBillingInsights','platformBillingChartStatus','platformBillingCharts','platformBillingMonths'].map(id=>[id,{hidden:true,textContent:'',safeHTML:'',value:'6'}]));const user={platformBillingAdmin:true};
 const window={};const context=vm.createContext({window,document:{getElementById:id=>els.get(id)},Intl,Date});vm.runInContext(fs.readFileSync('public/js/platform-billing-insights-v1.js','utf8'),context);
 const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
 return {els,user,refresh:(overrides={})=>window.BW.billingInsights.refresh({user,allowed:true,request,escape,isCurrent:value=>value===user,...overrides})};
}
test('frontend period filter, bars, ring, exact figures and client names render safely',async()=>{
 const data=await platformBillingAnalytics(fixture().DB,{now});data.renewals.items[0].tenant_name='<img src=x onerror=evil>';const paths=[];const f=front(async path=>{paths.push(path);return data});f.els.get('platformBillingMonths').value='3';await f.refresh();assert.equal(paths[0],'/api/platform/billing/analytics?months=3');const html=f.els.get('platformBillingCharts').safeHTML;assert.match(html,/billing-chart-bar/);assert.match(html,/billing-status-ring/);assert.match(html,/View exact figures/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);assert.match(f.els.get('platformBillingChartStatus').textContent,/not bank balance or recognised revenue/);
});
test('analytics failure is explicit while payment controls remain usable',async()=>{
 const f=front(async()=>{throw Error('provider internals')});await f.refresh();assert.match(f.els.get('platformBillingChartStatus').textContent,/Payment controls remain available/);assert.doesNotMatch(f.els.get('platformBillingChartStatus').textContent,/provider internals/);assert.equal(f.els.get('platformBillingCharts').safeHTML,'');
});
test('logout clears insights and discards a late analytics response',async()=>{
 let resolve;const f=front(()=>new Promise(r=>{resolve=r}));const pending=f.refresh();await f.refresh({user:null});resolve({receipts:[]});await pending;assert.equal(f.els.get('platformBillingInsights').hidden,true);assert.equal(f.els.get('platformBillingCharts').safeHTML,'');
});
