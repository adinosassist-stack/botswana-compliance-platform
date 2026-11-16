import test from "node:test";
import assert from "node:assert/strict";
import {runBudgetedAiRequest} from "../cloudflare/src/ai-budgeted-request.js";
const base={tenantId:"tenant-a",period:"2026-11",requestId:"req1",maxCostMicroUsd:500,db:{}};
test("provider never runs if reservation fails",async()=>{
 let called=false;
 await assert.rejects(()=>runBudgetedAiRequest({...base,reserve:async()=>{throw Error("denied")},provider:async()=>{called=true},recordUsage:async()=>{}}),/denied/);
 assert.equal(called,false);
});
test("reservation precedes provider and usage is recorded before success",async()=>{
 const order=[];
 const answer=await runBudgetedAiRequest({...base,
  reserve:async(_db,request)=>{order.push("reserve");assert.equal(request.amountMicroUsd,500)},
  provider:async({onUsage})=>{order.push("provider");await onUsage({provider:"openai",model:"gpt-5-mini",usageKnown:true,inputTokens:5,outputTokens:2,cachedInputTokens:0});return "answer"},
  recordUsage:async(_db,tenant,record)=>{order.push("journal");assert.equal(tenant,"tenant-a");assert.equal(record.requestId,"req1")}
 });
 assert.equal(answer,"answer");assert.deepEqual(order,["reserve","provider","journal"]);
});
test("missing provider accounting never reports success",async()=>{
 await assert.rejects(()=>runBudgetedAiRequest({...base,reserve:async()=>{},provider:async()=>"answer",recordUsage:async()=>{}}),/not_recorded/);
});
test("journal outage fails closed after provider response",async()=>{
 await assert.rejects(()=>runBudgetedAiRequest({...base,reserve:async()=>{},provider:async({onUsage})=>{await onUsage({usageKnown:false});return "answer"},recordUsage:async()=>{throw Error("journal_offline")}}),/journal_offline/);
});
test("missing dependency fails before provider",async()=>{
 await assert.rejects(()=>runBudgetedAiRequest({...base,provider:async()=>{}}),/pipeline_unavailable/);
});

test("usage callback must finish durable write before request can succeed",async()=>{
 let finishWrite;
 const writePending=new Promise(resolve=>{finishWrite=resolve});
 await assert.rejects(()=>runBudgetedAiRequest({...base,
  reserve:async()=>{},
  provider:async({onUsage})=>{void onUsage({usageKnown:false});return "premature answer"},
  recordUsage:async()=>{await writePending}
 }),/not_recorded/);
 finishWrite();
});
test("repeated usage callback is rejected before duplicate journal writes",async()=>{
 let writes=0;
 await assert.rejects(()=>runBudgetedAiRequest({...base,reserve:async()=>{},
  provider:async({onUsage})=>{await onUsage({usageKnown:false});await onUsage({usageKnown:false});return "answer"},
  recordUsage:async()=>{writes++}
 }),/duplicate_callback/);
 assert.equal(writes,1);
});
