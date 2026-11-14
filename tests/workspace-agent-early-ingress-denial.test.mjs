import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import agenticEntry,{logicalRequestPath} from "../cloudflare/src/agentic-entry.js";
import {
  denyUnqualifiedWorkspaceAgentApi,
  workspaceAgentAdvisoryApiAllowed
} from "../cloudflare/src/workspace-agent-api-staging-gate.js";

const STAGING_HOST="agent-staging.thebedesk.com";
const PATHS=["/api/agentic/workspace-identity","/api/agentic/workspace-tasks"];
const protectedEnv={
  APP_ENV:"staging",WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:"true",
  WORKSPACE_AGENT_ADVISORY_STAGING_HOST:STAGING_HOST
};
const ctx={waitUntil(){throw Error("unexpected async side effect")}};
function poisonEnvironment(props={}){
 return new Proxy(props,{get(target,key){
   if(key==="DB" || key==="SESSION_SECRET" || key==="PAYMENT_PROVIDER")
     throw Error("protected ingress must not reach service "+String(key));
   return Reflect.get(target,key);
 }});
}
async function callActualEntry(path,{origin="https://"+STAGING_HOST,env={},method="GET"}={}){
 const request=new Request(origin+path,{method,headers:{
   cookie:"__Host-bw_session=must-not-be-read",
   authorization:"Bearer must-not-be-used",
   "x-csrf-token":"must-not-be-used"
 }});
 return agenticEntry.fetch(request,poisonEnvironment(env),ctx);
}
test("actual Cloudflare Agent wrapper denies production API access BEFORE auth, DB, or other agents",async()=>{
 for(const route of PATHS) {
   for(const method of ["GET","POST","PUT","DELETE","PATCH","OPTIONS","HEAD"]) {
     const response=await callActualEntry(route,{method,env:{
       ...protectedEnv,APP_ENV:"production"
     }});
     assert.equal(response.status,404,route+":"+method);
     assert.deepEqual(await response.json(),{error:"not_found"});
     assert.equal(response.headers.get("cache-control"),"no-store");
     assert.equal(response.headers.get("x-content-type-options"),"nosniff");
   }
 }
});
test("actual entry rejects staging requests lacking explicit opt-in or matching host",async()=>{
 for(const route of PATHS) {
   for(const env of [{...protectedEnv,WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:"false"},
                     {...protectedEnv,WORKSPACE_AGENT_ADVISORY_STAGING_HOST:"other.thebedesk.com"},
                     {APP_ENV:"staging"},{}]) {
      assert.equal((await callActualEntry(route,{env})).status,404);
   }
   assert.equal((await callActualEntry(route,{env:protectedEnv,origin:"https://thebedesk.com"})).status,404);
   assert.equal((await callActualEntry(route,{env:protectedEnv,origin:"http://"+STAGING_HOST})).status,404);
 }
});
test("actual entry rejects alternate logical API tunnels before attachment or other handlers",async()=>{
 for(const route of PATHS) {
   for(const tunneled of [
     "/?__thebe_api_path="+encodeURIComponent(route),
     "/__thebe_api/"+route.slice("/api/".length)
   ]){
     const request=new Request("https://"+STAGING_HOST+tunneled);
     assert.equal(logicalRequestPath(request),route);
     const response=await callActualEntry(tunneled,{env:protectedEnv});
     assert.equal(response.status,404);
     assert.deepEqual(await response.json(),{error:"not_found"});
   }
 }
});
test("early ingress does not itself authorize a staging session or alter unrelated paths",()=>{
 const request=new Request("https://"+STAGING_HOST+PATHS[0]);
 assert.equal(workspaceAgentAdvisoryApiAllowed({request,env:protectedEnv,logicalPath:PATHS[0]}),true);
 assert.equal(denyUnqualifiedWorkspaceAgentApi({request,env:protectedEnv,logicalPath:PATHS[0]}),null);
 const unrelated=new Request("https://thebedesk.com/api/ai/general");
 assert.equal(denyUnqualifiedWorkspaceAgentApi({request:unrelated,env:{APP_ENV:"production"},logicalPath:"/api/ai/general"}),null);
});
test("source proves denial is first operation in outer runtime before paused-write/attachment chain",()=>{
 const entry=readFileSync(new URL("../cloudflare/src/agentic-entry.js",import.meta.url),"utf8");
 const end=entry.lastIndexOf("export default {");
 const outer=entry.slice(end);
 const path=outer.indexOf("const logicalPath=logicalRequestPath(request);");
 const deny=outer.indexOf("const denied=denyUnqualifiedWorkspaceAgentApi({env,request,logicalPath});");
 const guard=outer.indexOf("const paused=await guardPausedWorkspaceWrites(");
 const delegate=outer.indexOf("attachmentRuntime.fetch(");
 assert.ok(path>0&&deny>path&&guard>deny&&delegate>guard);
 assert.match(outer,/if\(denied\)return denied;/);
 assert.match(entry,/if\(!workspaceAgentAdvisoryApiAllowed\(\{env,request,logicalPath\}\)\)/);
});
