import test from "node:test";
import assert from "node:assert/strict";
import {handleEmployeeWorkflowRequest} from "../cloudflare/src/employee-workflow-api.js";

const session={tenant_id:"tenant-A",user_id:"actor-A"};
async function requestWithRole(roleAllowed) {
 let reads=0;
 const result=await handleEmployeeWorkflowRequest({
  req:{method:"POST"},session,roleAllowed,
  env:{DB:{prepare(){reads++;throw new Error("unexpected DB query")}}},
  readJson:async()=>{reads++;return {workflow:{id:"untrusted"}}}
 });
 return {result,reads};
}
test("role resolver exception denies before parsing or storage",async()=>{
 const {result,reads}=await requestWithRole(()=>{throw new Error("role service unavailable")});
 assert.equal(result.status,403);
 assert.equal(result.headers.get("cache-control"),"no-store");
 assert.equal(reads,0);
});
test("truthy nonboolean role resolver results do not grant access",async()=>{
 for(const value of ["true",1,{},[]]){
  const {result,reads}=await requestWithRole(()=>value);
  assert.equal(result.status,403);
  assert.equal(reads,0);
 }
});
