import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isWorkspaceAgentAdvisoryPath,workspaceAgentAdvisoryApiAllowed as allowed}
  from "../cloudflare/src/workspace-agent-api-staging-gate.js";

const STAGING="workspace-agent-staging.thebedesk.com";
const PATHS=["/api/agentic/workspace-identity","/api/agentic/workspace-tasks"];
const env=()=>({APP_ENV:"staging",WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:"true",
  WORKSPACE_AGENT_ADVISORY_STAGING_HOST:STAGING});
const requestFor=(path,{host=STAGING,protocol="https:",method="GET"}={})=>
  new Request(protocol+"//"+host+path,{method});
const input=(path=PATHS[0],options={})=>({
  env:env(),request:requestFor(path),logicalPath:path,...options
});
test("only two exact advisory paths are recognized, never a parent/foreign route",()=>{
 for(const p of PATHS)assert.equal(isWorkspaceAgentAdvisoryPath(p),true);
 for(const p of [null,undefined,"",{},[], "/api/agentic","/api/agentic/","/api/agentic/workspace-identity/",
  "/api/agentic/workspace-tasks/anything","/__thebe_api/agentic/workspace-tasks",
  "/api/agentic/task-execute","/api/ai/general"])
  assert.equal(isWorkspaceAgentAdvisoryPath(p),false);
});
test("authorized private staging host is only a routing candidate; auth remains separate",()=>{
 for(const path of PATHS)assert.equal(allowed(input(path)),true);
 assert.equal(allowed(input(PATHS[1],{request:requestFor(PATHS[1]+"?workspace=finance")})),true);
});
test("production can NEVER expose the API even if flag and hostname are mistakenly set",()=>{
 for(const appEnv of ["production","test","development","STAGING",undefined,null]){
   for(const path of PATHS){
     assert.equal(allowed(input(path,{env:{...env(),APP_ENV:appEnv}})),false);
   }
 }
});
test("disabled/missing flag and missing host deny even in staging",()=>{
 for(const flag of ["false","TRUE",true,false,null,undefined,0]){
   assert.equal(allowed(input(PATHS[1],{env:{...env(),WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:flag}})),false);
 }
 for(const host of ["","workspace-agent-staging.thebedesk.com:443",null,undefined,
   "thebedesk.com","www.thebedesk.com","other.thebedesk.com"," workspace-agent-staging.thebedesk.com"]){
   assert.equal(allowed(input(PATHS[1],{env:{...env(),WORKSPACE_AGENT_ADVISORY_STAGING_HOST:host}})),false);
 }
 assert.equal(allowed(input(PATHS[1],{env:{}})),false);
});
test("invalid hosts, schemes, credentials, ports, method and forged logical paths fail closed",()=>{
 for(const url of [
   "https://thebedesk.com/api/agentic/workspace-tasks",
   "https://www.thebedesk.com/api/agentic/workspace-tasks",
   "https://other.thebedesk.com/api/agentic/workspace-tasks",
   "https://workspace-agent-staging.thebedesk.com.evil.org/api/agentic/workspace-tasks",
   "https://workspace-agent-staging.workers.dev/api/agentic/workspace-tasks",
   "http://"+STAGING+"/api/agentic/workspace-tasks",
   "https://"+STAGING+":8443/api/agentic/workspace-tasks",
   "https://user:password@"+STAGING+"/api/agentic/workspace-tasks",
   "https://"+STAGING+"/__thebe_api/agentic/workspace-tasks",
   "https://"+STAGING+"/?__thebe_api_path=/api/agentic/workspace-tasks",
   "https://"+STAGING+"/api/agentic/workspace-tasks/",
   "not-a-url"
 ]){
   assert.equal(allowed(input(PATHS[1],{request:{url,method:"GET"}})),false,url);
 }
 for(const method of ["POST","PATCH","PUT","DELETE","OPTIONS","HEAD",null]){
   assert.equal(allowed(input(PATHS[0],{request:{url:"https://"+STAGING+PATHS[0],method}})),false);
 }
 assert.equal(allowed(input(PATHS[0],{logicalPath:PATHS[1]})),false);
});
test("production entry routes both private APIs only behind the staging gate",()=>{
 const source=readFileSync(new URL("../cloudflare/src/agentic-entry.js",import.meta.url),"utf8");
 assert.match(source,/import \{isWorkspaceAgentAdvisoryPath,workspaceAgentAdvisoryApiAllowed,denyUnqualifiedWorkspaceAgentApi\} from "\.\/workspace-agent-api-staging-gate\.js"/);
 const start=source.indexOf("if(isWorkspaceAgentAdvisoryPath(logicalPath))");
 const check=source.indexOf("if(!workspaceAgentAdvisoryApiAllowed({env,request,logicalPath}))",start);
 const taskCall=source.indexOf("const workspaceTaskResponse=await handleWorkspaceAgentTasksRequest({request,logicalPath,env})",check);
 assert.ok(start>=0 && check>start && taskCall>check);
 assert.equal(source.match(/handleWorkspaceAgentTasksRequest\(\{request,logicalPath,env\}\)/g)?.length,1);
 const segment=source.slice(start,taskCall);
 assert.match(segment,/status:404/);
 assert.match(segment,/cache-control":"no-store"/);
 assert.doesNotMatch(segment,/APP_ENV\s*===?\s*["']production/);
});
