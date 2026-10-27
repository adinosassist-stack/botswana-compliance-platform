import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the actual Worker approval branch, not an independent simulation of
// payment rules. The fake persistence layer never contacts a bank or a live DB.
const worker=fs.readFileSync('cloudflare/src/worker.js','utf8');
const from=worker.indexOf('const manualAdminMatch=url.pathname.match(');
const to=worker.indexOf('if(url.pathname==="/api/payments/ai-credit-checkout"',from);
assert.ok(from>0&&to>from,'manual-bank approval handler still exists');
const route='(async()=>{'+worker.slice(from,to)+'return {status:404,body:{error:"unmatched_route"}};})()';
const sid='11111111-1111-4111-8111-111111111111';
function fixture({action='approve',confirmed=true,role='owner',orderStatus='pending',reviewStatus='submitted',matchingFulfillment=true,settles=true}={}){
  const state={writes:[],settlements:0,audits:0,status:reviewStatus,orderStatus,providerPaymentId:orderStatus==='paid'?'BANK-123':null,matchingFulfillment,settles};
  const db={prepare(sql){
    let args=[];
    return {
      bind(...values){args=values;return this},
      async first(){
        if(sql.includes('SELECT m.*,o.amount_bwp'))return {
          id:sid,payment_order_id:'order-1',tenant_id:'client-1',bank_reference:'BANK-123',
          status:state.status,amount_bwp:149,order_status:state.orderStatus,
          provider_payment_id:state.providerPaymentId,order_type:'subscription',provider:'manual_bank',
          metadata_json:'{"plan":"business"}'
        };
        if(sql.includes('SELECT f.payment_order_id FROM payment_fulfillments'))return state.matchingFulfillment?{payment_order_id:'order-1'}:null;
        if(sql.includes('SELECT o.id FROM payment_orders o'))return (state.matchingFulfillment&&state.orderStatus==='paid'&&state.providerPaymentId==='BANK-123')?{id:'order-1'}:null;
        throw new Error('Unexpected first query: '+sql);
      },
      async run(){
        state.writes.push({sql,args});
        if(sql.includes("status='reviewing'")&&sql.includes("status='submitted'")){state.status='reviewing';return {meta:{changes:1}}}
        if(sql.includes("status='approved'")){state.status='approved';return {meta:{changes:1}}}
        if(sql.includes("status='rejected'")){state.status='rejected';return {meta:{changes:1}}}
        if(sql.includes("status='submitted',reviewed_by_user_id=NULL")){state.status='submitted';return {meta:{changes:1}}}
        return {meta:{changes:1}};
      }
    }
  }};
  const context=vm.createContext({
    url:new URL('https://example.test/api/platform/billing/manual-payments/'+sid+'/'+action),
    req:{method:'POST'},a:{role,user_id:'admin'},
    env:{DB:db},
    roleAllowed:(actor,expected)=>actor.role===expected,
    platformBillingAdmin:()=>true,
    readJson:async()=>({reason:'Not visible in company account',bankFundsConfirmed:confirmed}),
    json:(body,status=200)=>({status,body}),
    boundedReportText:(value,max)=>String(value).slice(0,max),
    safeJson:(value,fallback)=>{try{return JSON.parse(value)}catch{return fallback}},
    applyVerifiedPaymentOrder:async()=>{
      state.settlements++;
      if(!state.settles)return {ok:false,error:'settlement_failure'};
      state.orderStatus='paid';state.providerPaymentId='BANK-123';
      return {ok:true,status:'paid'};
    },
    writeAudit:async()=>{state.audits++},
    id:()=>sid
  });
  return {state,run:()=>vm.runInContext(route,context)};
}
test('approval requires explicit independent company bank-credit confirmation',async()=>{
  const f=fixture({confirmed:false});const r=await f.run();
  assert.equal(r.status,400);assert.equal(r.body.error,'bank_funds_confirmation_required');
  assert.equal(f.state.settlements,0);assert.equal(f.state.writes.length,0);
});
test('confirmed approval records settlement only after persisted matching fulfillment',async()=>{
  const f=fixture();const r=await f.run();
  assert.equal(r.status,200);assert.equal(r.body.activated,true);
  assert.equal(f.state.settlements,1);assert.equal(f.state.status,'approved');
  assert.equal(f.state.audits,1);
});
test('no activation acknowledgment when settlement helper succeeds but persisted fulfillment is missing',async()=>{
  const f=fixture({matchingFulfillment:false});const r=await f.run();
  assert.equal(r.status,503);assert.equal(r.body.error,'manual_payment_settlement_not_confirmed');
  assert.notEqual(f.state.status,'approved');assert.equal(f.state.audits,0);
});
test('a previously paid and fulfilled manual order can finish approval without second settlement',async()=>{
  const f=fixture({orderStatus:'paid'});const r=await f.run();
  assert.equal(r.status,200);assert.equal(r.body.activated,true);
  assert.equal(r.body.settlement.recoveredExistingFulfillment,true);
  assert.equal(f.state.settlements,0);assert.equal(f.state.status,'approved');
});
test('paid order without matching fulfillment is never auto-activated',async()=>{
  const f=fixture({orderStatus:'paid',matchingFulfillment:false});const r=await f.run();
  assert.equal(r.status,409);assert.equal(r.body.error,'paid_order_reconciliation_required');
  assert.equal(f.state.settlements,0);assert.equal(f.state.audits,0);
});
test('refunded order and competing review reject are fail-closed',async()=>{
  const refunded=fixture({orderStatus:'refunded'});const response=await refunded.run();
  assert.equal(response.status,409);assert.equal(refunded.state.settlements,0);
  const reviewing=fixture({action:'reject',reviewStatus:'reviewing'});
  assert.equal((await reviewing.run()).body.error,'manual_payment_review_in_progress');
});
test('manager role cannot approve cross-client bank payments',async()=>{
  const f=fixture({role:'manager'});const r=await f.run();
  assert.equal(r.status,403);assert.equal(r.body.error,'platform_billing_forbidden');assert.equal(f.state.writes.length,0);
});

test('repeated approval cannot settle or acknowledge activation twice',async()=>{
  const f=fixture();
  const first=await f.run();
  assert.equal(first.status,200);
  assert.equal(f.state.settlements,1);
  const second=await f.run();
  assert.notEqual(second.body.activated,true);
  assert.equal(f.state.settlements,1);
  assert.equal(f.state.audits,1);
});
test('failed settlement does not acknowledge activation or record approval',async()=>{
  const f=fixture({settles:false});
  const result=await f.run();
  assert.notEqual(result.body.activated,true);
  assert.notEqual(f.state.status,'approved');
  assert.equal(f.state.audits,0);
});
