import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import vm from 'node:vm';
import app from '../cloudflare/src/agentic-entry.js';
import worker from '../cloudflare/src/worker.js';
import {subscriptionDashboard,setSubscriptionAccess,guardPausedWorkspaceWrites} from '../cloudflare/src/platform-subscription-controls.js';
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT);CREATE TABLE subscriptions(tenant_id TEXT PRIMARY KEY,plan TEXT,status TEXT,provider TEXT,current_period_ends_at TEXT,updated_at TEXT);CREATE TABLE payment_orders(id TEXT,tenant_id TEXT,order_type TEXT,provider TEXT,status TEXT,metadata_json TEXT);CREATE TABLE payment_fulfillments(payment_order_id TEXT,tenant_id TEXT,fulfillment_status TEXT);
 INSERT INTO tenants VALUES('client','Client One');INSERT INTO subscriptions VALUES('client','business','active','manual_bank','2099-01-01 00:00:00',NULL);
 INSERT INTO payment_orders VALUES('paid-order','client','subscription','manual_bank','paid','{"plan":"business"}');INSERT INTO payment_fulfillments VALUES('paid-order','client','applied');`);
 const DB={prepare(query){let args=[];return {bind(...values){args=values;return this},async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}}}}};
 const audit=[];const auth={tenant_id:'platform-owner',user_id:'admin'};
 const body={tenantId:'client',enabled:false,expectedStatus:'active',expectedPeriod:'2099-01-01 00:00:00',reason:'Owner verified request'};
 const change=(overrides={},writeAudit=async(...args)=>audit.push(args))=>setSubscriptionAccess({env:{DB},auth,body:{...body,...overrides},writeAudit});
 return {sql,DB,audit,auth,body,change};
}
test('pause and resume preserve the verified payment and paid-through date',async()=>{
 const f=fixture();assert.equal((await f.change()).body.status,'paused');
 assert.equal((await f.change({enabled:true,expectedStatus:'paused'})).body.status,'active');
 assert.equal(f.sql.prepare('SELECT current_period_ends_at FROM subscriptions').get().current_period_ends_at,'2099-01-01 00:00:00');
 assert.equal(f.sql.prepare('SELECT status FROM payment_orders').get().status,'paid');assert.equal(f.audit.length,4);
});
for(const [label,sql,overrides,error] of [
 ['unverified payment',"DELETE FROM payment_fulfillments",{},'verified_subscription_payment_required'],
 ['refunded payment',"UPDATE payment_orders SET status='refunded'",{},'verified_subscription_payment_required'],
 ['wrong tenant receipt',"UPDATE payment_fulfillments SET tenant_id='other'",{},'verified_subscription_payment_required'],
 ['provider mismatch',"UPDATE subscriptions SET provider='dpo'",{},'manual_bank_subscription_required'],
 ['stale status',"UPDATE subscriptions SET status='paused'",{},'subscription_changed_refresh_required'],
 ['stale paid period',"UPDATE subscriptions SET current_period_ends_at='2098-01-01'",{},'subscription_changed_refresh_required'],
 ['expired resume',"UPDATE subscriptions SET status='paused',current_period_ends_at='2000-01-01'",{enabled:true,expectedStatus:'paused',expectedPeriod:'2000-01-01'},'paid_period_expired_new_payment_required']
])test(label+' fails closed',async()=>{const f=fixture();f.sql.exec(sql);const before=f.sql.prepare('SELECT * FROM subscriptions').get();const result=await f.change(overrides);assert.equal(result.status,409);assert.equal(result.body.error,error);assert.deepEqual(f.sql.prepare('SELECT * FROM subscriptions').get(),before);assert.equal(f.audit.length,0)});
test('invalid controls and current admin workspace cannot mutate access',async()=>{
 const f=fixture();for(const override of [{enabled:'true'},{reason:'x'},{expectedPeriod:undefined}])assert.equal((await f.change(override)).status,400);
 assert.equal((await f.change({tenantId:'platform-owner'})).body.error,'cannot_change_current_admin_workspace');
});
test('audit unavailability prevents access changes',async()=>{const f=fixture();await assert.rejects(f.change({},async()=>{throw Error('ledger down')}));assert.equal(f.sql.prepare('SELECT status FROM subscriptions').get().status,'active')});
for(const sql of ["UPDATE subscriptions SET plan='pro'","UPDATE subscriptions SET current_period_ends_at='2098-01-01'","UPDATE payment_orders SET status='refunded'"])test('compare-and-set rejects a concurrent change: '+sql,async()=>{
 const f=fixture();const r=await f.change({},async()=>f.sql.exec(sql));assert.equal(r.status,409);assert.equal(f.sql.prepare('SELECT status FROM subscriptions').get().status,'active');
});
test('dashboard paginates all clients and returns aggregate counts',async()=>{
 const f=fixture();for(let i=0;i<55;i++)f.sql.exec(`INSERT INTO tenants VALUES('extra-${String(i).padStart(2,'0')}','Synthetic client');INSERT INTO subscriptions VALUES('extra-${String(i).padStart(2,'0')}','business','paused','manual_bank','2099-01-01',NULL)`);
 const first=await subscriptionDashboard(f.DB);assert.equal(first.items.length,50);assert.equal(first.counts.active,1);assert.equal(first.counts.paused,55);assert.ok(first.nextAfter);
 const second=await subscriptionDashboard(f.DB,{after:first.nextAfter});assert.equal(second.items.length,6);assert.equal(second.nextAfter,null);assert.equal(new Set([...first.items,...second.items].map(x=>x.tenant_id)).size,56);
});
test('paused workspace writes are blocked before agentic and attachment handlers',async()=>{
 const DB={prepare(query){return {bind(){return this},async first(){return query.includes('FROM sessions s')?{user_id:'u',tenant_id:'client',role:'owner',last_seen_at:new Date().toISOString()}:query.includes('FROM subscriptions')?{status:'paused'}:null}}}};
 for(const path of ['/api/state','/api/agentic/tasks','/api/daily-reporting/reports/r1/attachments']){
  const response=await app.fetch(new Request('https://app.example'+path,{method:'POST',headers:{cookie:'bw_session=session'},body:'{}'}),{DB,SESSION_SECRET:'s'.repeat(48)},{});assert.equal(response.status,402);assert.equal((await response.json()).error,'subscription_paused');
 }
});
test('read access, billing, account recovery and anonymous requests remain available',async()=>{
 let lookups=0;const env={DB:{prepare(){lookups++;throw Error('should not query')}}};
 for(const [path,method] of [['/api/state','GET'],['/api/auth/logout','POST'],['/api/payments/manual-bank/submit','POST'],['/api/account/sessions','DELETE'],['/api/platform/billing/subscription-access','POST']]){
  assert.equal(await guardPausedWorkspaceWrites(new Request('https://app.example'+path,{method}),env,{logicalPath:path,authenticate:async()=>{throw Error('should not authenticate')}}),null);
 }
 assert.equal(await guardPausedWorkspaceWrites(new Request('https://app.example/api/state',{method:'POST'}),env,{logicalPath:'/api/state',authenticate:async()=>null}),null);assert.equal(lookups,0);
});
test('customer owners cannot call subscription list or update endpoints',async()=>{
 const DB={prepare(query){return {bind(){return this},async first(){return query.includes('FROM sessions s')?{user_id:'u',tenant_id:'client',email:'client@example.com',role:'owner',csrf_token:'csrf',last_seen_at:new Date().toISOString()}:null}}}};
 for(const [path,method] of [['/api/platform/billing/subscriptions','GET'],['/api/platform/billing/subscription-access','POST']]){
  const response=await worker.fetch(new Request('https://app.example'+path,{method,headers:{cookie:'bw_session=session','x-csrf-token':'csrf',origin:'https://app.example'}}),{DB,SESSION_SECRET:'s'.repeat(48),PUBLIC_ORIGIN:'https://app.example',PLATFORM_ADMIN_EMAILS:'thebedesk@gmail.com'},{});assert.equal(response.status,403);
 }
});
test('platform owner lands on Payments while customer owners keep Home',()=>{
 const source=fs.readFileSync('public/js/workspace-runtime-20261001b.js','utf8');const fn=source.slice(source.indexOf('function roleLandingView('),source.indexOf('function syncMobileRoleNav('));
 const context=vm.createContext({currentUser:{platformBillingAdmin:true},currentWorkspaceRole:()=> 'owner'});vm.runInContext(fn,context);assert.equal(vm.runInContext('roleLandingView()',context),'payments');vm.runInContext('currentUser.platformBillingAdmin=false',context);assert.equal(vm.runInContext('roleLandingView()',context),'dashboard');
});
test('dashboard switches show confirmed server state and cancelled changes do not submit',async()=>{
 const source=fs.readFileSync('public/js/workspace-runtime-20261001b.js','utf8');const elements=new Map(['platformSubscriptionAdminCard','platformSubscriptionList','platformActiveCount','platformPausedCount','platformSubscriptionNext','platformSubscriptionFirst'].map(id=>[id,{hidden:true,textContent:'',safeHTML:'',dataset:{}}]));let mutations=0;
 const context=vm.createContext({window:{BW:{}},document:{getElementById:id=>elements.get(id)||null},currentUser:{platformBillingAdmin:true,tenantId:'platform-owner'},roleCanView:()=>true,escapeHtml:String,notifyUser:()=>{},BW:{dialog:{confirm:async()=>false}},apiJson:async(path,options)=>{if(options?.method==='POST')mutations++;return {items:[{tenant_id:'client',tenant_name:'Client One',plan:'business',status:'active',current_period:1,current_period_ends_at:'2099-01-01'}],counts:{active:1,paused:0},nextAfter:null}}});
 vm.runInContext(source.slice(source.indexOf('function syncPlatformBillingControls(){'),source.indexOf('async function reviewManualPayment')),context);
 await vm.runInContext('loadPlatformSubscriptions()',context);assert.match(elements.get('platformSubscriptionList').safeHTML,/role="switch" aria-checked="true"/);assert.match(elements.get('platformSubscriptionList').safeHTML,/togglePlatformSubscription\(event\)/);
 context.button={disabled:false,dataset:{expectedStatus:'active'}};await vm.runInContext('togglePlatformSubscription({target:{closest:()=>button}})',context);assert.equal(mutations,0);assert.equal(context.button.disabled,false);
});
test('platform subscription endpoints require owner role and CSRF before mutation',async()=>{
 const f=fixture();let role='owner';const DB={prepare(query){if(query.includes('FROM sessions s'))return {bind(){return this},async first(){return {user_id:'admin',tenant_id:'platform-owner',email:'thebedesk@gmail.com',role,csrf_token:'csrf',last_seen_at:new Date().toISOString()}}};return f.DB.prepare(query)}};
 const env={DB,SESSION_SECRET:'s'.repeat(48),PUBLIC_ORIGIN:'https://app.example',PLATFORM_ADMIN_EMAILS:'thebedesk@gmail.com'};
 const get=()=>worker.fetch(new Request('https://app.example/api/platform/billing/subscriptions',{headers:{cookie:'bw_session=session'}}),env,{});
 const allowed=await get();assert.equal(allowed.status,200);assert.equal((await allowed.json()).items[0].tenant_id,'client');
 role='manager';assert.equal((await get()).status,403);role='owner';
 const denied=await worker.fetch(new Request('https://app.example/api/platform/billing/subscription-access',{method:'POST',headers:{cookie:'bw_session=session',origin:'https://app.example'},body:JSON.stringify(f.body)}),env,{});assert.equal(denied.status,403);assert.equal((await denied.json()).error,'csrf_failed');assert.equal(f.sql.prepare('SELECT status FROM subscriptions').get().status,'active');
});
test('scheduled delegate remains available after adding the request guard',()=>{assert.equal(typeof app.scheduled,'function')});
test('client search is literal, paginated and compatible with status filters',async()=>{
 const f=fixture();assert.equal((await subscriptionDashboard(f.DB,{search:'one'})).items.length,1);assert.equal((await subscriptionDashboard(f.DB,{search:'%'})).items.length,0);assert.equal((await subscriptionDashboard(f.DB,{status:'paused'})).items.length,0);
 f.sql.exec("UPDATE subscriptions SET status='paused',current_period_ends_at=datetime('now','+3 days')");assert.equal((await subscriptionDashboard(f.DB,{status:'paused'})).items.length,1);assert.equal((await subscriptionDashboard(f.DB,{status:'active'})).items.length,0);assert.equal((await subscriptionDashboard(f.DB,{status:'renewal'})).items.length,1);await assert.rejects(subscriptionDashboard(f.DB,{status:'unsupported'}),/invalid_subscription_filter/);
});

test('an expired active record can be explicitly paused without extending its period',async()=>{const f=fixture();f.sql.exec("UPDATE subscriptions SET current_period_ends_at='2000-01-01 00:00:00'");const r=await f.change({expectedPeriod:'2000-01-01 00:00:00'});assert.equal(r.body.status,'paused');assert.equal(f.sql.prepare('SELECT current_period_ends_at FROM subscriptions').get().current_period_ends_at,'2000-01-01 00:00:00')});
