import test from "node:test";
import assert from "node:assert/strict";
import {runBudgetedAiRequest} from "../cloudflare/src/ai-budgeted-request.js";
import {reserveAiBudget} from "../cloudflare/src/ai-budget-reservation.js";
import {recordAiUsage,getTenantAiUsage} from "../cloudflare/src/ai-usage-journal.js";
import {recordAiReconciliation} from "../cloudflare/src/ai-budget-reconciliation.js";

/** In-memory D1-contract fake. No Cloudflare calls or production mutations. */
function isolatedDb(limit=1000){
 const state={limit,reserved:0,reservations:new Set(),usage:new Map(),settlements:new Set()};
 return {state,prepare(sql){
  return {bind(...args){return {
   async run(){
    if(sql.includes("INSERT INTO ai_budget_reservation")){
     const [tenant,period,id,amount]=args,key=tenant+":"+period+":"+id;
     if(state.reservations.has(key)||state.reserved+amount>state.limit)throw Error("budget_denied");
     state.reservations.add(key);state.reserved+=amount;
    }else if(sql.includes("INSERT INTO ai_usage_journal")){
     const [tenant,id]=args;const key=tenant+":"+id;
     if(!state.usage.has(key))state.usage.set(key,args);
    }else if(sql.includes("INSERT INTO ai_budget_reconciliation")){
     const [tenant,period,id]=args,key=tenant+":"+period+":"+id;
     if(!state.reservations.has(key)||state.settlements.has(key))throw Error("reconciliation_denied");
     state.settlements.add(key);
    }else throw Error("unexpected_sql");
    return {success:true};
   },
   async first(){
    const tenant=args[0],records=[...state.usage.values()].filter(row=>row[0]===tenant);
    return {requests:records.length,input_tokens:records.reduce((sum,row)=>sum+(row[5]||0),0),
     output_tokens:records.reduce((sum,row)=>sum+(row[6]||0),0),
     unknown_requests:records.filter(row=>row[4]===0).length};
   }
  }}};
 }};
}
const base={tenantId:"tenant-a",period:"2026-11",requestId:"req1",maxCostMicroUsd:600};
test("full isolated pipeline reserves, records provider usage, reconciles without freeing quota",async()=>{
 const db=isolatedDb();
 const result=await runBudgetedAiRequest({...base,db,reserve:reserveAiBudget,recordUsage:recordAiUsage,
  provider:async({onUsage})=>{
   await onUsage({provider:"openai",model:"gpt-5-mini",usageKnown:true,inputTokens:40,outputTokens:12,cachedInputTokens:0});
   return "safe answer";
  }});
 assert.equal(result,"safe answer");
 assert.deepEqual(await getTenantAiUsage(db,"tenant-a"),{requests:1,inputTokens:40,outputTokens:12,unknownRequests:0});
 assert.deepEqual(await recordAiReconciliation(db,{...base,state:"completed",actualMicroUsd:200}),{recorded:true,quotaReleased:false});
 assert.equal(db.state.reserved,600);
});
test("second request is denied before provider when reservation exceeds budget",async()=>{
 const db=isolatedDb(1000);
 await reserveAiBudget(db,{...base,amountMicroUsd:600});
 let providerCalls=0;
 await assert.rejects(()=>runBudgetedAiRequest({...base,requestId:"req2",db,reserve:reserveAiBudget,recordUsage:recordAiUsage,
  provider:async()=>{providerCalls++;return "not allowed"}}),/reservation_denied/);
 assert.equal(providerCalls,0);
 assert.equal(db.state.reserved,600);
});
test("provider uncertainty leaves reservation held and no false success",async()=>{
 const db=isolatedDb();
 await assert.rejects(()=>runBudgetedAiRequest({...base,db,reserve:reserveAiBudget,recordUsage:recordAiUsage,
  provider:async()=>{throw Error("timeout")}}),/timeout/);
 assert.equal(db.state.reserved,600);
 assert.equal(db.state.usage.size,0);
});
