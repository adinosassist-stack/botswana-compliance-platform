import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { privateNodeAgentAuthIdentityFields } from "../server/workspace-agent-node-private-auth-fields.js";

const owner={role:"owner",user_id:"50d05bd2-06db-44cc-badd-a3ce69ab4cdf",tenant_id:"bdfc34b6-5468-4678-ac3e-7c020416469a"};
const manager={...owner,role:"manager"};
const project=(options={})=>privateNodeAgentAuthIdentityFields({
 appEnv:"test",enabled:true,session:owner,...options
});
test("default-off private test identity never leaks opaque ID to production or development",()=>{
 for(const appEnv of ["production","development",undefined,null]){
  assert.deepEqual(project({appEnv}),{});
 }
 for(const enabled of [false,undefined,null,"true",0]){
  assert.deepEqual(project({enabled}),{});
 }
 assert.deepEqual(privateNodeAgentAuthIdentityFields(),{});
});
test("only authenticated private owner or manager receives opaque session user ID",()=>{
 assert.deepEqual(project(),{id:owner.user_id});
 assert.deepEqual(project({session:manager}),{id:owner.user_id});
 for(const role of ["reviewer","auditor","employee","platform_admin",null]){
  assert.deepEqual(project({session:{...owner,role}}),{});
 }
});
test("rejects malformed, absent, email-derived and client-supplied identity",()=>{
 for(const session of [
   {},null,{...owner,user_id:null},{...owner,user_id:""},
   {...owner,user_id:"user@example.com"},
   {...owner,user_id:"tenant-A"},
   {...owner,user_id:"50d05bd2-06db-44cc-badd-a3ce69ab4cdf'",email:"user@example.com"},
   {...owner,tenant_id:null},{...owner,tenant_id:"tenant-from-query"},
   {...owner,user_id:"bdfc34b6-5468-4678-ac3e-7c020416469a",tenant_id:""}
 ])assert.deepEqual(project({session}),{});
});
test("Node auth-me is private-test-only and includes no-store while preserving established user fields",()=>{
 const source=readFileSync(new URL("../server/server.js",import.meta.url),"utf8");
 assert.match(source,/import \{ privateNodeAgentAuthIdentityFields \} from "\.\/workspace-agent-node-private-auth-fields\.js"/);
 const route=source.match(/app\.get\("\/api\/auth\/me",auth,\(req,res\)=>[^\n]+/);
 assert.ok(route);
 assert.match(route[0],/\.set\("Cache-Control","no-store"\)/);
 assert.match(route[0],/email:req\.auth\.email,role:req\.auth\.role,tenantId:req\.auth\.tenant_id,tenantName:req\.auth\.tenant_name/);
 assert.match(route[0],/privateNodeAgentAuthIdentityFields\(\{appEnv:config\.APP_ENV,enabled:process\.env\.WORKSPACE_AGENT_NODE_PRIVATE_TEST_ENABLED==="true",session:req\.auth\}\)/);
 const client=readFileSync(new URL("../public/js/workspace-agent-app-shell.js",import.meta.url),"utf8");
 assert.match(client,/payload\?\.user\?\.id/);
 const adapter=readFileSync(new URL("../server/workspace-agent-node-private.js",import.meta.url),"utf8");
 assert.match(adapter,/if \(appEnv !== "test" \|\| enabled !== true\) return false/);
});
