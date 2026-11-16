import test from "node:test";
import assert from "node:assert/strict";
import {projectAgentApprovalHistory as project} from "../cloudflare/src/agent-approval-history-view.js";
const principal={authenticated:true,tenantId:"tenant-a",actorId:"owner-a",actorRole:"owner"};
const row=(id,tenantId="tenant-a",actorId="owner-a")=>({id,tenantId,actorId,workflow:"employee_task_assignment",status:"requested",timestamp:"2026-11-10T00:00:00Z",nonce:"secret",argumentDigest:"secret"});
test("owner receives minimal immutable tenant-scoped history",()=>{
 const result=project({principal,records:[row("one"),row("other","tenant-b"),row("two")]});
 assert.equal(result.ok,true);assert.deepEqual(result.items.map(x=>x.id),["one","two"]);
 assert.equal(result.items[0].nonce,undefined);assert.equal(result.items[0].argumentDigest,undefined);
 assert.equal(Object.isFrozen(result.items),true);assert.equal(Object.isFrozen(result.items[0]),true);
});
test("manager sees only their own records",()=>{
 const result=project({principal:{...principal,actorRole:"manager",actorId:"manager-a"},records:[row("owner"),row("manager","tenant-a","manager-a")]});
 assert.deepEqual(result.items.map(x=>x.id),["manager"]);
});
test("unauthenticated, invalid input and malformed tenant row fail closed",()=>{
 for(const input of [
  {principal:{...principal,authenticated:false},records:[]},
  {principal,records:null},
  {principal,records:[row("one")],limit:51},
  {principal,records:[{...row("one"),status:"executed"}]},
  {principal,records:[{...row("one"),timestamp:"not-a-date"}]}
 ]){const r=project(input);assert.equal(r.ok,false);assert.equal(r.items.length,0);}
});
test("history projection never authorizes execution",()=>{
 const r=project({principal,records:[row("one")]});assert.equal(r.readOnly,true);assert.equal("executionAllowed" in r,false);
});
