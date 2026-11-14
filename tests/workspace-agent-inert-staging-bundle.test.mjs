import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import inertWorker from "../cloudflare/src/workspace-agent-staging-inert-entry.js";
import {assessWorkspaceAgentNoRoutePlan} from "../scripts/workspace-agent-no-route-staging-plan.mjs";

const config=readFileSync(new URL("../cloudflare/wrangler.workspace-agent-staging.inert.toml",import.meta.url),"utf8");
const source=readFileSync(new URL("../cloudflare/src/workspace-agent-staging-inert-entry.js",import.meta.url),"utf8");
const draft=JSON.parse(readFileSync(new URL("../docs/workspace-agent-no-route-staging-plan.json",import.meta.url),"utf8"));
function parseConfig(text){
  const globals=new Map(),vars=new Map();
  let section=null;
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim();
    if(!line || line.startsWith("#"))continue;
    if(line.startsWith("[")){
      assert.equal(line,"[vars]","only one vars section is allowed");
      assert.equal(section,null,"duplicate configuration section");
      section="vars";continue;
    }
    const match=line.match(/^([A-Z_a-z][A-Z_a-z0-9]*)\s*=\s*("([^"]*)"|true|false)$/);
    assert.ok(match,"unknown configuration syntax: "+line);
    const target=section==="vars"?vars:globals;
    assert.equal(target.has(match[1]),false,"duplicate configuration key: "+match[1]);
    target.set(match[1],match[3] ?? match[2]);
  }
  return {globals,vars};
}
function assertConfigSafe(text){
 const {globals,vars}=parseConfig(text);
 const expectedGlobals={
   name:"bw-workspace-agent-staging",
   main:"src/workspace-agent-staging-inert-entry.js",
   compatibility_date:"2026-09-03",
   workers_dev:"false",
   preview_urls:"false",
   keep_vars:"false"
 };
 const expectedVars={
   APP_ENV:"staging",
   WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:"false",
   THEBE_GENERAL_AI_ENABLED:"false",
   THEBE_INTERNAL_AUTONOMY_ENABLED:"false",
   AGENT_BOUNDED_TASK_EXECUTION_ENABLED:"0",
   THEBE_LIVE_VOICE_ENABLED:"false",
   POP_UPLOAD_STAGING_ENABLED:"false",
   PAYMENT_PROVIDER:"none"
 };
 assert.deepEqual(Object.fromEntries(globals),expectedGlobals);
 assert.deepEqual(Object.fromEntries(vars),expectedVars);
 return true;
}
test("inert Wrangler is exactly pinned to no ingress, no bindings and disabled features",()=>{
 assert.equal(assertConfigSafe(config),true);
 assert.equal(draft.plan.worker.name,"bw-workspace-agent-staging");
 assert.equal(draft.plan.database.databaseId,null);
 assert.equal(assessWorkspaceAgentNoRoutePlan(draft.plan,draft.inventory).staticDraftPassed,true);
});
test("unexpected Worker route, binding, asset, secret or production flag breaks bundle qualification",()=>{
 for(const altered of [
  config+'\n[[routes]]\npattern="agent-staging.thebedesk.com/*"\n',
  config+'\n[[d1_databases]]\nbinding="DB"\n',
  config+'\n[assets]\ndirectory="../public"\n',
  config+'\n[secrets]\nrequired=[]\n',
  config.replace("workers_dev = false","workers_dev = true"),
  config.replace("preview_urls = false","preview_urls = true"),
  config.replace('WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED = "false"',
    'WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED = "true"'),
  config.replace('APP_ENV = "staging"','APP_ENV = "production"'),
  config.replace('PAYMENT_PROVIDER = "none"','PAYMENT_PROVIDER = "manual"'),
  config+'\nWORKSPACE_AGENT_ADVISORY_STAGING_HOST = "agent-staging.thebedesk.com"\n',
  config.replace('name = "bw-workspace-agent-staging"','name = "bw-compliance-os"'),
  config+'\n[vars]\nADDITIONAL=true\n'
 ]) assert.throws(()=>assertConfigSafe(altered));
});
test("every request is an identical 404 response even with malicious paths and roles",async()=>{
 const urls=[
  "https://worker.invalid/",
  "https://worker.invalid/app/",
  "https://worker.invalid/api/auth/me",
  "https://worker.invalid/api/agentic/workspace-tasks?tenant=other",
  "https://worker.invalid/api/agentic/workspace-identity",
  "https://worker.invalid/api/ready",
  "https://worker.invalid/__admin"
 ];
 const all=[];
 for(const method of ["GET","POST","PUT","PATCH","DELETE","OPTIONS","HEAD"]) {
  for(const url of urls) {
   const req=new Request(url,{method,headers:{
    cookie:"__Host-bw_session=fake",
    authorization:"Bearer fake",
    "x-tenant-id":"spoofed",
    "x-forwarded-host":"thebedesk.com"
   }});
   const response=await inertWorker.fetch(req,{
    DB:{prepare(){throw Error("DB must not be accessed")}},
    SESSION_SECRET:"not-used",
    WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED:"true",
    APP_ENV:"production"
   });
   assert.equal(response.status,404);
   assert.equal(response.headers.get("cache-control"),"no-store");
   assert.equal(response.headers.get("x-content-type-options"),"nosniff");
   all.push(await response.text());
  }
 }
 assert.deepEqual([...new Set(all)],['{"error":"not_found"}']);
});
test("inert entry does not import or expose task, scheduled, queue or durable APIs",()=>{
 assert.doesNotMatch(source,/^\s*import\s/m);
 assert.doesNotMatch(source,/\b(?:async\s+scheduled|async\s+queue|async\s+alarm|prepare\s*\(|fetch\s*\(\s*["']https?:)/i);
 assert.doesNotMatch(source,/WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED\s*===?\s*["']true/);
 assert.equal(Object.keys(inertWorker).join(","),"fetch");
});
