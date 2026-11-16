import test from "node:test";
import assert from "node:assert/strict";
import {getAgentApprovalHistoryForPrincipal as get} from "../server/agent-approval-history-controller.js";
const principal={authenticated:true,tenantId:"tenant-a",actorId:"owner-a",actorRole:"owner"};
const row={id:"abc",tenant_id:"tenant-a",actor_id:"owner-a",action:"draft_internal_task",status:"pending",consumed_at:null,created_at:"2026-11-10T00:00:00Z"};
test("controller composes scoped query and minimal result",async()=>{
 let args;const pool={async query(sql,params){args=params;return {rows:[row]};}};
 const result=await get({principal,pool,featureEnabled:true,limit:5});
 assert.equal(result.ok,true);assert.equal(result.readOnly,true);
 assert.deepEqual(result.items.map(x=>x.workflow),["employee_task_assignment"]);
 assert.deepEqual(args.slice(0,2),["tenant-a",null]);assert.equal(args[3],5);
});
test("manager scope passes actor ID into parameterized query",async()=>{
 let args;const pool={async query(sql,params){args=params;return {rows:[]};}};
 const result=await get({principal:{...principal,actorId:"manager-a",actorRole:"manager"},pool,featureEnabled:true});
 assert.equal(result.ok,true);assert.equal(args[1],"manager-a");
});
test("feature disabled, unauthenticated and invalid limit never query",async()=>{
 let called=false;const pool={async query(){called=true;return {rows:[]};}};
 for(const opts of [
  {principal,pool},
  {principal:{...principal,authenticated:false},pool,featureEnabled:true},
  {principal,pool,featureEnabled:true,killSwitch:true},
  {principal,pool,featureEnabled:true,limit:51}
 ])assert.equal((await get(opts)).ok,false);
 assert.equal(called,false);
});
test("DB failure and cross-tenant rows fail closed or filter",async()=>{
 const broken={async query(){throw Error("offline");}};
 assert.equal((await get({principal,pool:broken,featureEnabled:true})).ok,false);
 const mixed={async query(){return {rows:[row,{...row,id:"cross",tenant_id:"tenant-b"}]};}};
 const r=await get({principal,pool:mixed,featureEnabled:true});
 assert.deepEqual(r.items.map(x=>x.id),["abc"]);
});
