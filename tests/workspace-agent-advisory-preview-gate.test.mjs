import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workspaceAgentAdvisoryPreviewAllowed as allowed } from "../cloudflare/src/workspace-agent-advisory-preview-gate.js";

const STAGING_HOST = "agent-staging.thebedesk.com";
const identity = {
  user:{id:"session-derived-user-id"},csrfToken:"0123456789abcdef0123456789abcdef"
};
function input({
  env={APP_ENV:"staging",WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:"true",
       WORKSPACE_AGENT_ADVISORY_STAGING_HOST:STAGING_HOST},
  url="https://"+STAGING_HOST+"/app/",
  method="GET",probeRole="owner",initialIdentity=identity
}={}) {
  return {env,request:{url,method},probeRole,initialIdentity};
}
test("private authenticated staging owner and manager on exact HTTPS hostname qualify",()=>{
  assert.equal(allowed(input()),true);
  assert.equal(allowed(input({probeRole:"manager",url:"https://"+STAGING_HOST+"/app"})),true);
});
test("production is denied even with remote preview flag and matching configured hostname",()=>{
  for(const value of ["production","development","test",null,undefined,"STAGING"]) {
    assert.equal(allowed(input({env:{...input().env,APP_ENV:value}})),false);
  }
});
test("feature is explicitly default off; missing or non-string settings fail closed",()=>{
  for(const value of [undefined,false,"false","TRUE",1,null]) {
    assert.equal(allowed(input({env:{...input().env,WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:value}})),false);
  }
  assert.equal(allowed(input({env:null})),false);
});
test("exact, explicit staging hostname required; forwarded Host/header hints grant nothing",()=>{
  for(const value of [undefined,null,"","www.thebedesk.com","thebedesk.com",
    "other-staging.thebedesk.com","agent-staging.thebedesk.com.evil.org",
    "https://agent-staging.thebedesk.com","agent-staging.thebedesk.com:443",
    " agent-staging.thebedesk.com"]) {
    assert.equal(allowed(input({env:{...input().env,WORKSPACE_AGENT_ADVISORY_STAGING_HOST:value}})),false);
  }
  for(const url of [
    "https://thebedesk.com/app/","https://www.thebedesk.com/app/",
    "https://other-staging.thebedesk.com/app/",
    "https://agent-staging.thebedesk.com.evil.org/app/",
    "https://agent-staging.thebedesk.workers.dev/app/",
    "http://"+STAGING_HOST+"/app/",
    "https://"+STAGING_HOST+":8443/app/",
    "https://user:password@"+STAGING_HOST+"/app/",
    "https://"+STAGING_HOST+"/auth/",
    "https://"+STAGING_HOST+"/",
    "https://"+STAGING_HOST+"/app/admin",
    "not-a-url"
  ]) {
    assert.equal(allowed(input({url})),false,url);
  }
});
test("role, initial opaque identity and CSRF bootstrap must all be server-verified",()=>{
  for(const role of [undefined,null,"reviewer","auditor","employee","Owner","platform_admin"]) {
    assert.equal(allowed(input({probeRole:role})),false);
  }
  for(const initialIdentity of [undefined,null,{}, {user:{id:"test"}}, 
    {user:{id:" "},csrfToken:identity.csrfToken},
    {user:{id:124},csrfToken:identity.csrfToken},
    {user:{id:"synthetic"},csrfToken:"short"}
  ])assert.equal(allowed(input({initialIdentity})),false);
});
test("no POST, non-GET or forged event can authorize preview injection",()=>{
  for(const method of ["POST","PUT","PATCH","DELETE","HEAD","OPTIONS",null]) {
    assert.equal(allowed(input({method})),false);
  }
  assert.equal(allowed(),false);
});
test("Cloudflare /app route uses gate, and canonical external runtime remains untouched",()=>{
  const entry=readFileSync(new URL("../cloudflare/src/release-governance-entry.js",import.meta.url),"utf8");
  assert.match(entry,/import \{workspaceAgentAdvisoryPreviewAllowed\} from "\.\/workspace-agent-advisory-preview-gate\.js"/);
  assert.match(entry,/if\(workspaceAgentAdvisoryPreviewAllowed\(\{env,request,probeRole,initialIdentity\}\)\)/);
  assert.equal(entry.match(/injectWorkspaceAgentAdvisoryBoot\(injected\)/g)?.length,1);
  const runtime=readFileSync(new URL("../public/js/workspace-runtime-20261001b.js",import.meta.url),"utf8");
  assert.doesNotMatch(runtime,/workspace-agent-advisory-preview-gate/);
});
