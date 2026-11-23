import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const runtime=readFileSync('public/js/workspace-runtime-20261001b.js','utf8');
const extract=(a,b)=>runtime.slice(runtime.indexOf(a),runtime.indexOf(b,runtime.indexOf(a)));
function fixture(){
 const box={safeHTML:'',setAttribute(){},removeAttribute(){},focus(){},scrollIntoView(){}};
 const state={requests:[],hosted:0,messages:[]};
 const ctx=vm.createContext({currentUser:{id:'owner'},currentWorkspaceRole:()=> 'owner',document:{getElementById:()=>box},
 notifyUser:msg=>state.messages.push(msg),escapeHtml:s=>String(s),encodeURIComponent,
 apiJson:async(path,opts)=>{state.requests.push({path,opts});return {paymentOrder:{id:'order-1',amountBwp:59},checkoutMode:'manual_bank_transfer',bankTransfer:{bankName:'Synthetic',accountNumber:'000000',reference:'THEBE-ORDER-1',amountBwp:59}}},
 openHostedCheckout:()=>{state.hosted++},renderPayments:async()=>{}});
 vm.runInContext(extract('let creditCheckoutBusy=','async function renderAiCredits()')+extract('function renderManualBankCheckout(','async function requestPlan('),ctx);
 return {ctx,box,state};
}
test('credit purchase displays bank reference and submission control without hosted checkout',async()=>{
 const f=fixture();await f.ctx.createAiCreditOrder('AI50');
 assert.equal(f.state.requests[0].path,'/api/payments/ai-credit-checkout');assert.equal(f.state.hosted,0);
 assert.match(f.box.safeHTML,/THEBE-ORDER-1/);assert.match(f.box.safeHTML,/I have paid/);
 assert.match(f.box.safeHTML,/Submission does not activate a plan or add AI credits/);
 assert.match(f.box.safeHTML,/manualBankReference_order-1/);
});
test('double-click starts only one credit checkout; stale session cannot show bank instructions',async()=>{
 const f=fixture();let complete;f.ctx.apiJson=()=>new Promise(r=>{complete=r});
 const first=f.ctx.createAiCreditOrder('AI50');await f.ctx.createAiCreditOrder('AI50');
 f.ctx.currentUser={id:'different-owner'};complete({paymentOrder:{id:'order-1'}});await first;
 assert.equal(f.box.safeHTML,'');assert.equal(f.state.messages.length,0);
});
test('invalid manual checkout response produces a visible error',async()=>{
 const f=fixture();f.ctx.apiJson=async()=>({paymentOrder:{id:'order-1'}});await f.ctx.createAiCreditOrder('AI50');
 assert.match(f.state.messages[0],/instructions are unavailable/);assert.equal(f.state.hosted,0);
});
