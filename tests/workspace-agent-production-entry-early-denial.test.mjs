import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import releaseEntry,{logicalRequestPath} from "../cloudflare/src/release-governance-entry.js";
import {denyUnqualifiedWorkspaceAgentApi} from "../cloudflare/src/workspace-agent-api-staging-gate.js";

const HOST="workspace-agent-staging.thebedesk.com";
const PATHS=["/api/agentic/workspace-identity","/api/agentic/workspace-tasks"];
const staging={
  APP_ENV:"staging",WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:"true",
  WORKSPACE_AGENT_ADVISORY_STAGING_HOST:HOST
};
function poisonousEnv(overrides={}){
  const source={...overrides};
  return new Proxy(source,{get(target,prop){
    if(["DB","SESSION_SECRET","PAYMENT_PROVIDER","AUDIT_INTEGRITY_SECRET","REGISTRATION_MODE"].includes(prop)) {
      throw Error("EARLY_GATE_MUST_NOT_TOUCH_"+String(prop));
    }
    return Reflect.get(target,prop);
  }});
}
const ctx={waitUntil(){throw Error("UNEXPECTED_BACKGROUND_WORK")}};
async function dispatch(path,{env={},method="GET",host="https://"+HOST}={}){
  return releaseEntry.fetch(new Request(host+path,{
    method,headers:{cookie:"__Host-bw_session=synthetic",
      authorization:"Bearer forged",origin:"https://attacker.invalid"}
  }),poisonousEnv(env),ctx);
}
test("real release-governance Worker entry denies both advisory APIs before all app services",async()=>{
  for(const path of PATHS){
    for(const method of ["GET","POST","PUT","PATCH","DELETE","OPTIONS","HEAD"]){
      const response=await dispatch(path,{method,env:{...staging,APP_ENV:"production"}});
      assert.equal(response.status,404,method+":"+path);
      assert.deepEqual(await response.json(),{error:"not_found"});
      assert.equal(response.headers.get("cache-control"),"no-store");
      assert.equal(response.headers.get("x-content-type-options"),"nosniff");
      assert.equal(response.headers.get("location"),null);
    }
  }
});
test("real release entry denies missing and incorrect staging configuration",async()=>{
  for(const path of PATHS){
    for(const env of [
      {},{APP_ENV:"staging"},
      {...staging,WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:"false"},
      {...staging,WORKSPACE_AGENT_ADVISORY_STAGING_HOST:"wrong.thebedesk.com"},
      {...staging,APP_ENV:"development"}
    ]) assert.equal((await dispatch(path,{env})).status,404);
    for(const host of [
      "https://thebedesk.com","https://www.thebedesk.com",
      "http://"+HOST,"https://not-staging.thebedesk.com",
      "https://workspace-agent-staging.workers.dev"
    ]) assert.equal((await dispatch(path,{env:staging,host})).status,404);
  }
});
test("real release entry disallows rewritten logical API path tunnels",async()=>{
  for(const path of PATHS){
    for(const route of [
      "/?__thebe_api_path="+encodeURIComponent(path),
      "/__thebe_api/"+path.slice("/api/".length)
    ]){
      const req=new Request("https://"+HOST+route);
      assert.equal(logicalRequestPath(req),path);
      const response=await dispatch(route,{env:staging});
      assert.equal(response.status,404);
      assert.deepEqual(await response.json(),{error:"not_found"});
    }
  }
});
test("approved staging flag/host is only ingress candidate; does not prove auth or activation",()=>{
  for(const path of PATHS){
    const req=new Request("https://"+HOST+path);
    assert.equal(denyUnqualifiedWorkspaceAgentApi({request:req,env:staging,logicalPath:path}),null);
  }
  const unrelated=new Request("https://thebedesk.com/api/version");
  assert.equal(denyUnqualifiedWorkspaceAgentApi({request:unrelated,env:{APP_ENV:"production"},logicalPath:"/api/version"}),null);
});
test("production entry source places denial before conversion, registration and downstream base",()=>{
  const source=readFileSync(new URL("../cloudflare/src/release-governance-entry.js",import.meta.url),"utf8");
  const outer=source.slice(source.lastIndexOf("export default {"));
  const route=outer.indexOf("const path=logicalRequestPath(request),method=request.method;");
  const deny=outer.indexOf("const denied=denyUnqualifiedWorkspaceAgentApi({env,request,logicalPath:path});");
  const denialReturn=outer.indexOf("if(denied)return denied;");
  const conversion=outer.indexOf("await handleConversionEvent({request,path,env,ctx})");
  const downstream=outer.indexOf("await base.fetch(request,downstreamEnv,ctx)");
  assert.ok(route>=0&&deny>route&&denialReturn>deny&&conversion>denialReturn&&downstream>conversion);
  assert.match(source,/import \{denyUnqualifiedWorkspaceAgentApi\} from "\.\/workspace-agent-api-staging-gate\.js"/);
});
