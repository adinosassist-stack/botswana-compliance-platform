import test from "node:test";
import assert from "node:assert/strict";
import {reserveAiBudget} from "../cloudflare/src/ai-budget-reservation.js";
test("invalid and missing budget binding fail closed",async()=>{
 await assert.rejects(()=>reserveAiBudget(null,{tenantId:"a",period:"2026-11",requestId:"r",amountMicroUsd:100}),/unavailable/);
 const db={prepare(){throw Error("DB down")}};
 await assert.rejects(()=>reserveAiBudget(db,{tenantId:"a",period:"2026-11",requestId:"r",amountMicroUsd:100}),/reservation_denied/);
});
test("valid reservation passes tenant, month, unique request and integer amount",async()=>{
 const calls=[];
 const db={prepare(sql){assert.match(sql,/INSERT INTO ai_budget_reservation/);return {bind(...args){calls.push(args);return {run:async()=>({success:true})}}}}};
 assert.deepEqual(await reserveAiBudget(db,{tenantId:"tenant-a",period:"2026-11",requestId:"req-1",amountMicroUsd:500}),{reserved:true});
 assert.deepEqual(calls,[["tenant-a","2026-11","req-1",500]]);
});
test("rejects zero, fractional, negative, unsafe, malformed or cross-tenant IDs",async()=>{
 const db={prepare(){throw Error("should not reach database")}};
 for(const value of [0,-1,1.2,Number.MAX_SAFE_INTEGER+1]){
  await assert.rejects(()=>reserveAiBudget(db,{tenantId:"tenant-a",period:"2026-11",requestId:"req-1",amountMicroUsd:value}),/invalid_request/);
 }
 await assert.rejects(()=>reserveAiBudget(db,{tenantId:"tenant a",period:"2026-11",requestId:"req-1",amountMicroUsd:10}),/invalid_request/);
 await assert.rejects(()=>reserveAiBudget(db,{tenantId:"tenant-a",period:"2026-13",requestId:"req-1",amountMicroUsd:10}),/invalid_request/);
});
