import test from "node:test";
import assert from "node:assert/strict";
import {handleEmployeeWorkflowRequest} from "../cloudflare/src/employee-workflow-api.js";

test("malformed employee workflow POST returns noncacheable 400 without writing",async()=>{
 let writes=0;
 const response=await handleEmployeeWorkflowRequest({
  req:{method:"POST"},
  env:{DB:{prepare(){writes++;throw Error("unexpected database access")}}},
  session:{tenant_id:"tenant-A",user_id:"actor-A"},
  roleAllowed:()=>true,
  readJson:async()=>{throw new SyntaxError("invalid JSON")}
 });
 assert.equal(response.status,400);
 assert.equal(response.headers.get("cache-control"),"no-store");
 assert.deepEqual(await response.json(),{error:"invalid_json"});
 assert.equal(writes,0);
});
