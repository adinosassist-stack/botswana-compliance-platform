import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import worker from '../cloudflare/src/worker.js';
import {withPlatformOwnerAdminEnv} from '../cloudflare/src/platform-owner-access.js';

const runtime=fs.readFileSync('public/js/workspace-runtime-20261001b.js','utf8');
function ui({admin=true,role='owner',request=async()=>({items:[]})}={}){
  const elements=new Map(['manualPaymentAdminCard','manualPaymentAdminList','paymentOrderList'].map(id=>[id,{hidden:true,textContent:'',safeHTML:'',style:{}}]));
  const button={hidden:true,style:{display:'none'}};
  const context=vm.createContext({document:{getElementById:id=>elements.get(id)||null,querySelectorAll:()=>[button]},apiJson:request,escapeHtml:value=>String(value).replaceAll('<','&lt;'),currentUser:{platformBillingAdmin:admin,role},roleCanView:()=>role==='owner'});
  const start=runtime.indexOf('function syncPlatformBillingControls(){'),end=runtime.indexOf('async function reviewManualPayment',start);
  assert.ok(start>=0,'owner control entry point must exist');
  vm.runInContext(runtime.slice(start,end),context);
  return {elements,button,context,run:code=>vm.runInContext(code,context)};
}

test('authorized owner has a visible main navigation entry',()=>{
  const u=ui();u.run('syncPlatformBillingControls()');assert.equal(u.button.hidden,false);assert.equal(u.button.style.display,'');
  const html=fs.readFileSync('public/index.html','utf8');
  assert.ok(html.indexOf('class="nav-primary platformBillingControl"')<html.indexOf('class="nav-advanced-index"'),'entry is outside the hidden tool index');
});
for(const [label,options] of [['customer owner',{admin:false}],['non-owner',{admin:true,role:'manager'}]]){
 test(`${label} cannot see platform entry or fetch the cross-client queue`,async()=>{
  let calls=0;const u=ui({...options,request:async()=>{calls++;return {items:[]}}});
  u.run('syncPlatformBillingControls()');await u.run('renderManualPaymentApprovals()');
  assert.equal(u.button.hidden,true);assert.equal(u.elements.get('manualPaymentAdminCard').hidden,true);assert.equal(calls,0);
 });
}
test('queue loads even when the unrelated payment-order endpoint fails',async()=>{
 const calls=[];const u=ui({request:async path=>{calls.push(path);if(path==='/api/payments/orders')throw Error('unavailable');return {items:[{id:'submission',tenant_name:'Client <Ltd>',amount_bwp:149,bank_reference:'BANK-123',submitted_at:'2026-10-25',metadata:{plan:'starter'}}]}}});
 await u.run('renderPayments()');
 assert.ok(calls.includes('/api/platform/billing/manual-payments'));assert.equal(u.elements.get('manualPaymentAdminCard').hidden,false);
 assert.match(u.elements.get('manualPaymentAdminList').safeHTML,/Verify & activate/);assert.match(u.elements.get('manualPaymentAdminList').safeHTML,/Client &lt;Ltd>/);
});
for(const status of [403,503])test(`HTTP ${status} keeps the approval panel visible with recovery instructions`,async()=>{
 const u=ui({request:async()=>{throw Object.assign(Error('private provider diagnostic'),{status})}});await u.run('renderManualPaymentApprovals()');
 assert.equal(u.elements.get('manualPaymentAdminCard').hidden,false);
 assert.match(u.elements.get('manualPaymentAdminList').textContent,status===403?/authorized Thebe Desk admin/:/Refresh approvals/);
 assert.doesNotMatch(u.elements.get('manualPaymentAdminList').textContent,/private provider/);
});
test('an empty queue explicitly reports no pending approvals',async()=>{
 const u=ui();await u.run('renderManualPaymentApprovals()');assert.match(u.elements.get('manualPaymentAdminList').safeHTML,/No manual payments awaiting approval/);
});
test('logout discards a pending cross-client response and clears the panel',async()=>{
 let resolve;const u=ui({request:()=>new Promise(r=>{resolve=r})});const pending=u.run('renderManualPaymentApprovals()');
 u.run('currentUser=null;syncPlatformBillingControls();renderManualPaymentApprovals()');resolve({items:[{tenant_name:'PRIVATE CLIENT'}]});await pending;
 assert.equal(u.button.hidden,true);assert.equal(u.elements.get('manualPaymentAdminCard').hidden,true);assert.equal(u.elements.get('manualPaymentAdminList').textContent,'');assert.doesNotMatch(u.elements.get('manualPaymentAdminList').safeHTML,/PRIVATE CLIENT/);
});

function apiEnv(email){
 const session={user_id:'u1',tenant_id:'t1',email,role:'owner',last_seen_at:new Date().toISOString()};
 const DB={prepare(sql){
   return {bind(){return this},async first(){return sql.includes('FROM sessions s')?session:null},async all(){return {results:[]}},async run(){return {meta:{changes:0}}}};
 }};
 return withPlatformOwnerAdminEnv({SESSION_SECRET:'s'.repeat(48),PUBLIC_ORIGIN:'https://app.example',DB});
}
for(const [email,allowed] of [['thebedesk@gmail.com',true],['customer@example.com',false]])test(`authenticated identity exposes server-derived billing capability for ${email}`,async()=>{
 const response=await worker.fetch(new Request('https://app.example/api/auth/me',{headers:{cookie:'bw_session=test'}}),apiEnv(email),{});
 assert.equal(response.status,200);assert.equal((await response.json()).user.platformBillingAdmin,allowed);
});
test('customer cannot bypass UI to access platform payment submissions',async()=>{
 const response=await worker.fetch(new Request('https://app.example/api/platform/billing/manual-payments',{headers:{cookie:'bw_session=test'}}),apiEnv('customer@example.com'),{});
 assert.equal(response.status,403);assert.equal((await response.json()).error,'platform_billing_forbidden');
});
