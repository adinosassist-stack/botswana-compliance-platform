import test from "node:test";
import assert from "node:assert/strict";
import {readAuthenticatedAgentApprovalHistory as read} from "../cloudflare/src/agent-approval-history-service.js";
const principal={authenticated:true,tenantId:"tenant-a",actorId:"owner-a",actorRole:"owner"};
const record=(id,tenantId="tenant-a")=>({id,tenantId,actorId:"owner-a",workflow:"employee_task_assignment",status:"requested",timestamp:"2026-11-10T00:00:00Z",nonce:"secret"});
test("disabled by default without touching storage",async()=>{
 let called=false;const store={async listTenantApprovals(){called=true;return [];}};
 const r=await read({principal,store});assert.equal(r.ok,false);assert.equal(called,false);
});
test("reads tenant-scoped records and strips secret fields",async()=>{
 let query;const store={async listTenantApprovals(args){query=args;return [record("one"),record("other","tenant-b")];}};
 const r=await read({principal,store,featureEnabled:true,limit:10});
 assert.deepEqual(query,{tenantId:"tenant-a",limit:10,actorId:undefined});
 assert.equal(r.ok,true);assert.deepEqual(r.items.map(x=>x.id),["one"]);
 assert.equal(r.items[0].nonce,undefined);assert.equal(r.readOnly,true);
});
test("manager queries own records only",async()=>{
 let query;const store={async listTenantApprovals(args){query=args;return [];}};
 const r=await read({principal:{...principal,actorId:"manager-a",actorRole:"manager"},store,featureEnabled:true});
 assert.equal(r.ok,true);assert.equal(query.actorId,"manager-a");
});
test("unauthenticated, killed and storage errors fail closed",async()=>{
 const store={async listTenantApprovals(){throw Error("database down");}};
 for(const args of [
  {principal,store,featureEnabled:true,killSwitch:true},
  {principal:{...principal,authenticated:false},store,featureEnabled:true},
  {principal,store,featureEnabled:true},
  {principal,store,featureEnabled:true,limit:51}
 ]){const r=await read(args);assert.equal(r.ok,false);assert.equal(r.items.length,0);}
});
