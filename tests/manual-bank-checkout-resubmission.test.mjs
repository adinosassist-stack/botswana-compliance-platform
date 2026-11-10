import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute actual production Worker route branches against isolated in-memory
// state. This is NOT a bank API, a live login, or production D1.
const worker=fs.readFileSync('cloudflare/src/worker.js','utf8');
function route(startMarker,endMarker) {
  const start=worker.indexOf(startMarker),end=worker.indexOf(endMarker,start);
  assert.ok(start>=0&&end>start,'production route markers must remain discoverable');
  return '(async()=>{'+worker.slice(start,end)+'return {status:404,body:{error:"unmatched_route"}}})()';
}
const checkout=route(
  'if(url.pathname==="/api/payments/subscription-checkout"&&req.method==="POST")',
  'if(url.pathname==="/api/payments/manual-bank/config"&&req.method==="GET")'
);
const submit=route(
  'if(url.pathname==="/api/payments/manual-bank/submit"&&req.method==="POST")',
  'if(url.pathname==="/api/platform/billing/analytics"&&req.method==="GET")'
);
const orderIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fixture() {
  const state={orders:[],submissions:[],events:[],audits:[],entitlementGrants:0};
  let nextId=0;
  const id=()=> '00000000-0000-4000-8000-'+String(++nextId).padStart(12,'0');
  const findOrder=(oid,tid)=>state.orders.find(o=>o.id===oid&&o.tenant_id===tid);
  const db={prepare(sql){
    let args=[];
    return {
      bind(...values){args=values;return this},
      async all(){
        if(sql.includes('SELECT o.id,o.amount_bwp,o.metadata_json FROM payment_orders o')){
          const eligible=state.orders.filter(o=>
            o.tenant_id===args[0]&&o.order_type==='subscription'&&
            o.provider==='manual_bank'&&['pending','processing'].includes(o.status)&&
            !state.submissions.some(m=>m.payment_order_id===o.id&&['rejected','cancelled','approved'].includes(m.status))
          );
          return {results:eligible.slice(-20).reverse().map(o=>({
            id:o.id,amount_bwp:o.amount_bwp,metadata_json:o.metadata_json
          }))};
        }
        throw Error('Unexpected simulated all()');
      },
      async first(){
        if(sql.includes('SELECT id,tenant_id,order_type,status,amount_bwp,provider FROM payment_orders'))
          return findOrder(args[0],args[1])||null;
        if(sql.includes('SELECT id FROM manual_payment_submissions WHERE payment_order_id=')){
          const m=state.submissions.find(x=>x.payment_order_id===args[0]);
          return m?{id:m.id}:null;
        }
        throw Error('Unexpected simulated first()');
      },
      async run(){
        if(sql.includes("UPDATE payment_orders SET provider='manual_bank'")){
          const order=findOrder(args[0],args[1]);
          if(!order)return {meta:{changes:0}};
          order.provider='manual_bank';
          return {meta:{changes:1}};
        }
        if(sql.includes('INSERT INTO manual_payment_submissions')){
          const [sid,oid,tenantId,bankReference]=args;
          const m=state.submissions.find(x=>x.payment_order_id===oid);
          if(m){
            if(m.status!=='submitted')return {meta:{changes:0}};
            m.bank_reference=bankReference;
            return {meta:{changes:1}};
          }
          if(state.submissions.some(x=>x.bank_reference===bankReference))
            throw Error('UNIQUE constraint failed: manual_payment_submissions.bank_reference');
          state.submissions.push({id:sid,payment_order_id:oid,tenant_id:tenantId,bank_reference:bankReference,status:'submitted'});
          return {meta:{changes:1}};
        }
        if(sql.includes('INSERT INTO manual_payment_events')){
          state.events.push({submissionId:args[1],orderId:args[2],type:args[4],reference:JSON.parse(args[6]).bankReference});
          return {meta:{changes:1}};
        }
        throw Error('Unexpected simulated run()');
      }
    };
  }};
  const env={DB:db,THEBE_POP_WHATSAPP_NUMBER:''};
  const invoke=async(path,body,{tenantId='tenant-a',role='owner'}={})=>{
    const a={tenant_id:tenantId,role,user_id:'test-user'};
    const ctx=vm.createContext({
      url:new URL('https://example.test'+path),req:{method:'POST'},
      a,env,id,roleAllowed:(actor,required)=>actor.role===required,
      readJson:async()=>body,
      json:(payload,status=200)=>({status,body:payload}),
      safeJson:(data,def)=>{try{return JSON.parse(data)}catch{return def}},
      PLAN_PRICE_BWP:{business:149},SELF_SERVE_PLAN_IDS:new Set(['business']),
      manualBankConfig:()=>({configured:true,bankName:'Synthetic test bank'}),
      manualPaymentReference:oid=>'TEST-'+oid.slice(-8),
      createPaymentOrder:async(_env,{tenantId:t,orderType,amountBwp,metadata})=>{
        const o={id:id(),tenant_id:t,order_type:orderType,amount_bwp:amountBwp,
          metadata_json:JSON.stringify(metadata),status:'pending',provider:null};
        state.orders.push(o);
        return {id:o.id,amountBwp};
      },
      idempotentJsonMutation:async(_env,_actor,_req,_kind,_key,operation)=>operation(),
      PAYMENT_ORDER_ID_RE:orderIdPattern,
      normalizeBankReference:value=>String(value||'').trim().toUpperCase(),
      writeAudit:async(_env,_tenant,_actor,event,payload)=>state.audits.push({event,payload})
    });
    return vm.runInContext(path.includes('/subscription-checkout')?checkout:submit,ctx);
  };
  const start=(args={},options={})=>invoke('/api/payments/subscription-checkout',
    {plan:'business',billingCycle:'monthly',...args},options);
  const submitReference=(oid,reference='BANK-NEW-123',options={})=>
    invoke('/api/payments/manual-bank/submit',{paymentOrderId:oid,bankReference:reference},options);
  return {state,start,submitReference};
}

test('pending checkout reuses same plan without activating a subscription',async()=>{
  const f=fixture(),first=await f.start(),second=await f.start();
  assert.equal(first.status,201);
  assert.equal(second.status,200);
  assert.equal(second.body.reused,true);
  assert.equal(first.body.paymentOrder.id,second.body.paymentOrder.id);
  assert.equal(f.state.orders.length,1);
  assert.equal(f.state.entitlementGrants,0);
});

test('rejected review requires fresh order and preserves rejected evidence',async()=>{
  const f=fixture(),first=await f.start();
  const oldId=first.body.paymentOrder.id;
  assert.equal((await f.submitReference(oldId,'BANK-REJECT-001')).status,201);
  const original=f.state.submissions[0];
  original.status='rejected'; // Simulated independently completed admin rejection.
  const fresh=await f.start();
  assert.equal(fresh.status,201);
  assert.notEqual(fresh.body.paymentOrder.id,oldId);
  const oldRetry=await f.submitReference(oldId,'BANK-REPLACE-001');
  assert.equal(oldRetry.status,409);
  assert.equal(oldRetry.body.error,'manual_payment_review_closed');
  assert.equal(original.status,'rejected');
  assert.equal(original.bank_reference,'BANK-REJECT-001');
  const next=await f.submitReference(fresh.body.paymentOrder.id,'BANK-FRESH-002');
  assert.equal(next.status,201);
  assert.equal(f.state.submissions.length,2);
  assert.equal(f.state.submissions[1].status,'submitted');
  assert.equal(f.state.entitlementGrants,0);
});

test('claimed review cannot be overwritten by new customer reference',async()=>{
  const f=fixture(),oid=(await f.start()).body.paymentOrder.id;
  assert.equal((await f.submitReference(oid,'BANK-CLAIM-001')).status,201);
  f.state.submissions[0].status='reviewing';
  const response=await f.submitReference(oid,'BANK-CHANGED-002');
  assert.equal(response.status,409);
  assert.equal(response.body.error,'manual_payment_review_closed');
  assert.equal(f.state.submissions[0].bank_reference,'BANK-CLAIM-001');
});

test('unclaimed customer reference can be corrected without second submission',async()=>{
  const f=fixture(),oid=(await f.start()).body.paymentOrder.id;
  assert.equal((await f.submitReference(oid,'BANK-OLD-001')).status,201);
  assert.equal((await f.submitReference(oid,'BANK-NEW-002')).status,201);
  assert.equal(f.state.submissions.length,1);
  assert.equal(f.state.submissions[0].bank_reference,'BANK-NEW-002');
  assert.equal(f.state.entitlementGrants,0);
});

test('paid order cannot accept new submission or be reused as pending',async()=>{
  const f=fixture(),oid=(await f.start()).body.paymentOrder.id;
  f.state.orders[0].status='paid';
  const denied=await f.submitReference(oid,'BANK-PAID-001');
  assert.equal(denied.status,409);
  assert.equal(denied.body.error,'payment_order_not_submittable');
  const newCheckout=await f.start();
  assert.equal(newCheckout.status,201);
  assert.notEqual(newCheckout.body.paymentOrder.id,oid);
});

test('wrong tenant cannot submit a different company payment order',async()=>{
  const f=fixture(),oid=(await f.start()).body.paymentOrder.id;
  const denied=await f.submitReference(oid,'BANK-OTHER-001',{tenantId:'tenant-b'});
  assert.equal(denied.status,404);
  assert.equal(denied.body.error,'payment_order_not_found');
  assert.equal(f.state.submissions.length,0);
});

test('invalid plan or bank reference fails before payment evidence writes',async()=>{
  const f=fixture();
  assert.equal((await f.start({plan:'invalid-plan'})).status,400);
  assert.equal(f.state.orders.length,0);
  const oid=(await f.start()).body.paymentOrder.id;
  const response=await f.submitReference(oid,'!!');
  assert.equal(response.status,400);
  assert.equal(response.body.error,'invalid_bank_reference');
  assert.equal(f.state.submissions.length,0);
  assert.equal(f.state.audits.length,0);
});

test('non-owner role cannot create checkout or submit reference',async()=>{
  const f=fixture(),oid=(await f.start()).body.paymentOrder.id;
  assert.equal((await f.start({},{role:'member'})).status,403);
  assert.equal((await f.submitReference(oid,'BANK-ROLE-001',{role:'member'})).status,403);
  assert.equal(f.state.orders.length,1);
  assert.equal(f.state.submissions.length,0);
  assert.equal(f.state.entitlementGrants,0);
});


test('processing checkout remains reusable but cannot grant access',async()=>{
  const f=fixture(),initial=await f.start();
  f.state.orders[0].status='processing';
  const second=await f.start();
  assert.equal(second.status,200);
  assert.equal(second.body.reused,true);
  assert.equal(second.body.paymentOrder.id,initial.body.paymentOrder.id);
  assert.equal(f.state.orders.length,1);
  assert.equal(f.state.entitlementGrants,0);
});

test('cancelled manual review cannot be resubmitted on its original order',async()=>{
  const f=fixture(),oid=(await f.start()).body.paymentOrder.id;
  assert.equal((await f.submitReference(oid,'BANK-CANCEL-001')).status,201);
  f.state.submissions[0].status='cancelled';
  const response=await f.submitReference(oid,'BANK-CANCEL-RETRY');
  assert.equal(response.status,409);
  assert.equal(response.body.error,'manual_payment_review_closed');
  assert.equal(f.state.submissions[0].bank_reference,'BANK-CANCEL-001');
  const next=await f.start();
  assert.equal(next.status,201);
  assert.notEqual(next.body.paymentOrder.id,oid);
  assert.equal(f.state.entitlementGrants,0);
});

test('failed bank order can accept a submitted reference without marking paid',async()=>{
  const f=fixture(),oid=(await f.start()).body.paymentOrder.id;
  f.state.orders[0].status='failed';
  const response=await f.submitReference(oid,'BANK-FAIL-001');
  assert.equal(response.status,201);
  assert.equal(f.state.submissions[0].status,'submitted');
  assert.equal(f.state.orders[0].status,'failed');
  assert.equal(f.state.entitlementGrants,0);
});

test('separate tenant cannot reuse another tenant pending checkout',async()=>{
  const f=fixture(),a=await f.start();
  const b=await f.start({},{tenantId:'tenant-b'});
  assert.equal(a.status,201);
  assert.equal(b.status,201);
  assert.notEqual(a.body.paymentOrder.id,b.body.paymentOrder.id);
  assert.equal(f.state.orders.length,2);
  assert.equal(f.state.entitlementGrants,0);
});
