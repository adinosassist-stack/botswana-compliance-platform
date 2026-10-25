import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('public/js/workspace-runtime-20261001b.js','utf8');
function dashboard({admin=true,items=[],paymentItems=[]}={}){
 const ids=['payments','platformBillingOverview','platformSubscriptionAdminCard','platformSubscriptionList','platformActiveCount','platformPausedCount','platformPendingCount','platformSubscriptionNext','platformSubscriptionFirst','platformClientSearch','platformClientFilter','manualPaymentAdminCard','manualPaymentAdminList','paymentOrderList','paymentPending','paymentPaid','paymentFailed','paymentRefunded','paymentVerificationList','paymentRefundList','paymentProviderList','paymentReconciliationList'];
 const elements=new Map(ids.map(id=>[id,{hidden:false,textContent:'',safeHTML:'',value:id==='platformClientFilter'?'all':'',dataset:{},classList:{contains:()=>true,toggle(){}},style:{}}]));
 const calls=[],timers=[];let prompts=0;
 class BrowserDate extends Date{constructor(value){super(typeof value==='string'&&/^\d{4}-\d\d-\d\d /.test(value)?value.replace(' ','T')+'+02:00':value)}toLocaleString(){return this.toISOString()}}
 const context=vm.createContext({window:{BW:{}},Date:BrowserDate,document:{getElementById:id=>elements.get(id)||null,querySelectorAll:()=>[]},currentUser:{platformBillingAdmin:admin,role:'owner',tenantId:'platform-owner'},roleCanView:()=>true,escapeHtml:String,notifyUser:()=>{},renderPayments:()=>{},loadBilling:async()=>{},clearTimeout:()=>{},setTimeout:fn=>{timers.push(fn);return timers.length},BW:{dialog:{confirm:async()=>true,prompt:async()=>{prompts++;return 'Verified owner request'}}},apiJson:async(path,options)=>{
  calls.push({path,options});if(path.includes('manual-payments')&&!options)return {items:paymentItems};
  if(path.includes('/subscriptions'))return {items,counts:{active:1,paused:0},nextAfter:null};return {items:[],providers:[]};
 }});
 vm.runInContext(source.slice(source.indexOf('function syncPlatformBillingControls(){'),source.indexOf('async function renderEntitlements(){')),context);
 return {elements,context,calls,timers,get prompts(){return prompts},run:code=>vm.runInContext(code,context)};
}
test('stored active state remains On after expiry and can be deliberately paused',async()=>{
 const f=dashboard({items:[{tenant_id:'expired-client',tenant_name:'Expired client',plan:'business',status:'active',current_period:0,current_period_ends_at:'2000-01-01 00:00:00'}]});await f.run('loadPlatformSubscriptions()');
 const html=f.elements.get('platformSubscriptionList').safeHTML;assert.match(html,/aria-checked="true"/);assert.doesNotMatch(html,/disabled/);assert.match(html,/Paid period expired/);
});
test('paused expired subscriptions cannot be resumed without a new payment',async()=>{
 const f=dashboard({items:[{tenant_id:'paused-client',tenant_name:'Paused client',plan:'business',status:'paused',current_period:0,current_period_ends_at:'2000-01-01 00:00:00'}]});await f.run('loadPlatformSubscriptions()');const html=f.elements.get('platformSubscriptionList').safeHTML;assert.match(html,/aria-checked="false"/);assert.match(html,/disabled/);assert.match(html,/new verified payment/i);
});
test('owner dashboard does not fetch hidden customer billing panels',async()=>{
 const f=dashboard();await f.run('renderPayments()');await f.run('renderPaymentProviders()');await f.run('renderPaymentReconciliation()');assert.ok(f.calls.some(x=>x.path.includes('manual-payments')));assert.deepEqual(f.calls.filter(x=>x.path.startsWith('/api/payments/')),[]);
});
test('customer owners retain their own billing panels',async()=>{
 const f=dashboard({admin:false});await f.run('renderPayments()');await f.run('renderPaymentProviders()');await f.run('renderPaymentReconciliation()');for(const path of ['/api/payments/orders','/api/payments/providers','/api/payments/reconciliation'])assert.ok(f.calls.some(x=>x.path===path));
});
test('an account change during subscription confirmation prevents submission',async()=>{
 const f=dashboard();f.context.BW.dialog.confirm=async()=>{f.context.currentUser={platformBillingAdmin:true,role:'owner',tenantId:'other-owner'};return true};f.context.button={disabled:false,dataset:{tenantId:'client',expectedStatus:'active',expectedPeriod:'2099-01-01'}};
 await f.run('togglePlatformSubscription({target:{closest:()=>button}})');assert.equal(f.calls.filter(x=>x.options?.method==='POST').length,0);assert.equal(f.prompts,0);
});
test('an account change during payment confirmation cannot approve from the replacement session',async()=>{
 const f=dashboard();f.context.BW.dialog.confirm=async()=>{f.context.currentUser={platformBillingAdmin:true,role:'owner',tenantId:'other-owner'};return true};await f.run('reviewManualPayment("submission","approve")');assert.equal(f.calls.filter(x=>x.options?.method==='POST').length,0);
});
test('a deferred client filter does not fetch after leaving the dashboard',async()=>{
 const f=dashboard();f.run('filterPlatformSubscriptions()');f.elements.get('payments').classList.contains=()=>false;for(const callback of f.timers)callback();assert.equal(f.calls.length,0);
});
test('database UTC submission timestamps are not interpreted in the browser local timezone',async()=>{
 const f=dashboard({paymentItems:[{id:'submission',tenant_name:'Client',amount_bwp:149,metadata:{plan:'starter'},submitted_at:'2026-10-25 12:00:00'}]});await f.run('renderManualPaymentApprovals()');assert.match(f.elements.get('manualPaymentAdminList').safeHTML,/2026-10-25T12:00:00.000Z/);
});

test('account changes during reason entry cannot submit access or rejection changes',async()=>{
 for(const action of ['toggle','reject']){const f=dashboard();f.context.BW.dialog.prompt=async()=>{f.context.currentUser={platformBillingAdmin:true,role:'owner',tenantId:'other-owner'};return 'Different account now'};f.context.button={disabled:false,dataset:{tenantId:'client',expectedStatus:'active',expectedPeriod:'2099-01-01'}};await f.run(action==='toggle'?'togglePlatformSubscription({target:{closest:()=>button}})':'reviewManualPayment("submission","reject")');assert.equal(f.calls.filter(x=>x.options?.method==='POST').length,0)}
});
test('payment approval refreshes platform data without loading the admin workspace own billing',async()=>{const f=dashboard();let ownBillingReads=0;f.context.loadBilling=async()=>{ownBillingReads++};await f.run('reviewManualPayment("submission","approve")');assert.equal(ownBillingReads,0)});
