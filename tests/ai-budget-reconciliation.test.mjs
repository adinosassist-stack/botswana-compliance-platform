import test from "node:test";
import assert from "node:assert/strict";
import {recordAiReconciliation} from "../cloudflare/src/ai-budget-reconciliation.js";
const base={tenantId:"tenant-a",period:"2026-11",requestId:"req-1"};
test("completed reconciliation records billed cost but does not release quota",async()=>{
 let sql="",params=[];
 const db={prepare(statement){sql=statement;return {bind(...values){params=values;return {run:async()=>({success:true})}}}}};
 assert.deepEqual(await recordAiReconciliation(db,{...base,state:"completed",actualMicroUsd:250}),{recorded:true,quotaReleased:false});
 assert.match(sql,/INSERT INTO ai_budget_reconciliation/);
 assert.doesNotMatch(sql,/UPDATE ai_monthly_budget/);
 assert.deepEqual(params,["tenant-a","2026-11","req-1","completed",250]);
});
test("uncertain billing is never treated as zero",async()=>{
 const db={prepare(){return {bind(...values){assert.equal(values[4],null);return {run:async()=>{}}}}}};
 assert.deepEqual(await recordAiReconciliation(db,{...base,state:"uncertain"}),{recorded:true,quotaReleased:false});
 await assert.rejects(()=>recordAiReconciliation(db,{...base,state:"uncertain",actualMicroUsd:0}),/invalid/);
});
test("invalid costs and database failures fail closed",async()=>{
 const db={prepare(){throw Error("database offline")}};
 await assert.rejects(()=>recordAiReconciliation(db,{...base,state:"completed",actualMicroUsd:-1}),/invalid/);
 await assert.rejects(()=>recordAiReconciliation(db,{...base,state:"completed",actualMicroUsd:0.5}),/invalid/);
 await assert.rejects(()=>recordAiReconciliation(db,{...base,state:"completed",actualMicroUsd:1}),/write_failed/);
});
