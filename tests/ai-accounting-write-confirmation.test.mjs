import test from "node:test";
import assert from "node:assert/strict";
import {recordAiUsage} from "../cloudflare/src/ai-usage-journal.js";
import {reserveAiBudget} from "../cloudflare/src/ai-budget-reservation.js";
import {recordAiReconciliation} from "../cloudflare/src/ai-budget-reconciliation.js";

const dbWithResult=result=>({prepare:()=>({bind:()=>({run:async()=>result})})});
const usage={requestId:"r1",provider:"openai",model:"gpt-5-mini",usageKnown:true,inputTokens:10,outputTokens:2,cachedInputTokens:0};
const budget={tenantId:"tenant-a",period:"2026-11",requestId:"r1",amountMicroUsd:500};
const reconciliation={tenantId:"tenant-a",period:"2026-11",requestId:"r1",state:"completed",actualMicroUsd:200};

test("usage accounting rejects unconfirmed database write",async()=>{
 for(const result of [undefined,{success:false}])
  await assert.rejects(()=>recordAiUsage(dbWithResult(result),"tenant-a",usage),/write_unconfirmed/);
});
test("budget reservation rejects unconfirmed database write",async()=>{
 for(const result of [undefined,{success:false}])
  await assert.rejects(()=>reserveAiBudget(dbWithResult(result),budget),/reservation_denied/);
});
test("reconciliation rejects unconfirmed database write",async()=>{
 for(const result of [undefined,{success:false}])
  await assert.rejects(()=>recordAiReconciliation(dbWithResult(result),reconciliation),/write_failed/);
});
test("confirmed database writes are accepted",async()=>{
 const db=dbWithResult({success:true});
 assert.equal((await recordAiUsage(db,"tenant-a",usage)).recorded,true);
 assert.equal((await reserveAiBudget(db,budget)).reserved,true);
 assert.equal((await recordAiReconciliation(db,reconciliation)).recorded,true);
});
