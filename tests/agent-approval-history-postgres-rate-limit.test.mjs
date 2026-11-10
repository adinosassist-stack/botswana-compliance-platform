import test from "node:test";
import assert from "node:assert/strict";
import {createAgentHistoryPostgresRateLimiter as create} from "../server/agent-approval-history-postgres-rate-limit.js";
test("requires a database and bounded config",()=>{
 assert.throws(()=>create(),/dependencies_required/);
 assert.throws(()=>create({pool:{query(){}},limit:0}),/dependencies_required/);
});
test("atomic counter is parameterized and bounded",async()=>{
 let sql,args;
 const fn=create({pool:{async query(q,p){sql=q;args=p;return {rows:[{request_count:1}]}}},limit:2,windowSeconds:60,clock:()=>new Date(120000)});
 assert.equal(await fn({tenantId:"t",actorId:"u"}),true);
 assert.deepEqual(args,["t","u",2,2]);
 assert.match(sql,/on conflict/);
 assert.match(sql,/returning request_count/);
});
test("denies exhausted buckets and database failures",async()=>{
 const exhausted=create({pool:{query:async()=>({rows:[]})}});
 assert.equal(await exhausted({tenantId:"t",actorId:"u"}),false);
 const down=create({pool:{query:async()=>{throw Error("offline")}}});
 assert.equal(await down({tenantId:"t",actorId:"u"}),false);
 assert.equal(await down({tenantId:"",actorId:"u"}),false);
});
