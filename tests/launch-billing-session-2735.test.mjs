import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('public/js/workspace-runtime-20261001b.js','utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function fixture(){
 const nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',safeHTML:'',value:'BANK-REFERENCE',dataset:{}});return nodes.get(id)};
 const requests=[],state={refreshes:0};
 const ctx=vm.createContext({currentUser:{id:'owner',tenantId:'alpha'},currentWorkspaceRole:()=> 'owner',document:{getElementById:node},escapeHtml:String,Date,Map,
 apiJson:(path,opts)=>new Promise((resolve,reject)=>requests.push({path,opts,resolve,reject})),renderPayments:async()=>{state.refreshes++}});
 vm.runInContext(section('let creditWalletLoad=','function setAiAdvisorPrompt(')+section('async function submitManualBankPayment(','function renderManualBankCheckout('),ctx);
 return {ctx,node,requests,state};
}
const wallet=balance=>({wallet:{balance},packs:[],ledger:[]});
test('late wallet response cannot render after account change',async()=>{
 const f=fixture(),pending=f.ctx.renderAiCredits();f.ctx.currentUser={id:'other',tenantId:'beta'};
 f.requests[0].resolve(wallet(900));await pending;assert.equal(f.node('aiCreditBalance').textContent,'');
});
test('latest wallet refresh wins when network responses arrive in reverse order',async()=>{
 const f=fixture(),older=f.ctx.renderAiCredits(),newer=f.ctx.renderAiCredits();
 f.requests[1].resolve(wallet(100));await newer;f.requests[0].resolve(wallet(5));await older;
 assert.equal(String(f.node('aiCreditBalance').textContent),'100');
});
test('stale wallet error cannot replace another workspace wallet',async()=>{
 const f=fixture(),pending=f.ctx.renderAiCredits();f.ctx.currentUser.tenantId='beta';
 f.requests[0].reject(new Error('Private alpha error'));await pending;assert.equal(f.node('aiCreditWalletBox').safeHTML,'');
});
test('double payment submission sends one request and permits retry after failure',async()=>{
 const f=fixture(),first=f.ctx.submitManualBankPayment('order');const duplicate=f.ctx.submitManualBankPayment('order');
 assert.equal(f.requests.length,1);f.requests[0].reject(new Error('Network interrupted'));await first;assert.equal(f.node('manualBankSubmitResult_order').textContent,'Network interrupted');
 const retry=f.ctx.submitManualBankPayment('order');assert.equal(f.requests.length,2);
 f.requests[1].resolve({message:'Awaiting bank verification'});await retry;assert.equal(f.state.refreshes,1);
});
test('late submission cannot show a success or refresh payments after sign-out',async()=>{
 const f=fixture(),pending=f.ctx.submitManualBankPayment('order');f.ctx.currentUser=null;
 f.requests[0].resolve({message:'Private payment details'});await pending;
 assert.equal(f.node('manualBankSubmitResult_order').textContent,'');assert.equal(f.state.refreshes,0);
});

test('manager cannot submit owner payment references',async()=>{
 const f=fixture();f.ctx.currentWorkspaceRole=()=> 'manager';await f.ctx.submitManualBankPayment('order');
 assert.equal(f.requests.length,0);
});
test('late payment error cannot cross an in-place workspace change',async()=>{
 const f=fixture(),pending=f.ctx.submitManualBankPayment('order');f.ctx.currentUser.tenantId='beta';
 f.requests[0].reject(new Error('Private alpha failure'));await pending;
 assert.equal(f.node('manualBankSubmitResult_order').textContent,'');
});
