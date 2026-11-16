import test from "node:test";
import assert from "node:assert/strict";
import {createAgentHistoryRateLimitCleanup as create} from "../server/agent-approval-history-rate-limit-cleanup.js";
test("requires valid database and retention interval",()=>{
 assert.throws(()=>create(),/dependencies_required/);
 assert.throws(()=>create({pool:{query(){}},retentionSeconds:30}),/dependencies_required/);
});
test("deletes only buckets older than cutoff using parameters",async()=>{
 let sql,args;
 const cleanup=create({pool:{async query(q,p){sql=q;args=p;return {rowCount:4}}},
 windowSeconds:60,retentionSeconds:3600,clock:()=>new Date(7200000)});
 assert.equal(await cleanup(),4);
 assert.match(sql,/where bucket_id<\$1/);
 assert.deepEqual(args,[60]);
});
test("invalid clock and database errors do not silently pass",async()=>{
 const invalid=create({pool:{query:async()=>({rowCount:0})},clock:()=>new Date(NaN)});
 await assert.rejects(invalid(),/invalid_clock/);
 const down=create({pool:{query:async()=>{throw Error("offline")}}});
 await assert.rejects(down(),/offline/);
});
