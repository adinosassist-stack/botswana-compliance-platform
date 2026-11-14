import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createWorkspaceAgentAppShell, workspaceAgentScopeForView } from "../public/js/workspace-agent-app-shell.js";
function fixture(role="owner") {
  const target = new EventTarget(); target.__THEBE_WORKSPACE_READY__=false;
  const nodes = new Map();
  for (const id of ["appShell","marketingGate","authGate","thebeAiDock"]) {
    nodes.set(id,{id,hidden:false,classList:{contains:()=>id!=="appShell"},dataset:{surface:"workspace"}});
  }
  let view="dashboard",calls=0,activations=[],clears=0;
  const documentRef={
    body:{},
    getElementById:(id)=>nodes.get(id)||null,
    querySelector:(selector)=>selector===".view.active"?{id:view}:null
  };
  const makeAdapter=()=>({
    activateFromTrustedShell:async (payload)=>{activations.push(payload);return {ok:true};},
    clear:()=>{clears++;},
    dispose:()=>{},
    isActive:()=>activations.length>0
  });
  const fetchImpl=async (path,options)=>{
    calls++;
    assert.equal(path,"/api/auth/me");assert.equal(options.credentials,"same-origin");
    assert.equal(options.cache,"no-store");
    return {ok:true,json:async()=>({user:{role,id:"u1"},csrfToken:"secret"})};
  };
  const app=createWorkspaceAgentAppShell({target,documentRef,fetchImpl,makeAdapter,MutationObserverImpl:null});
  target.__THEBE_WORKSPACE_READY__=true;
  return {app,target,nodes,setView:(value)=>{view=value},activations,clears:()=>clears,calls:()=>calls};
}
test("only mapped views can select advisory task scope",()=>{
 assert.equal(workspaceAgentScopeForView("dashboard"),"owner");
 assert.equal(workspaceAgentScopeForView("moneyhub"),"finance");
 assert.equal(workspaceAgentScopeForView("peopleops"),"people");
 assert.equal(workspaceAgentScopeForView("payments"),null);
 assert.equal(workspaceAgentScopeForView("__proto__"),null);
});
test("authenticated owner shell activates mapped workspace after no-cache session probe",async()=>{
 const f=fixture();assert.deepEqual(await f.app.refresh(),{ok:true});
 assert.deepEqual(f.activations,[{authenticated:true,workspace:"owner"}]);
 assert.equal(f.calls(),1);f.app.dispose();
});
test("reviewer is denied by server session even after spoofed ready signal",async()=>{
 const f=fixture("reviewer");
 assert.deepEqual(await f.app.refresh(),{ok:false,code:"unauthorized_workspace_role"});
 assert.equal(f.activations.length,0);f.app.dispose();
});
test("unmapped or hidden surfaces never fetch session or activate",async()=>{
 const f=fixture();f.setView("unknown");
 assert.equal((await f.app.refresh()).code,"unmapped_workspace_view");assert.equal(f.calls(),0);
 f.setView("dashboard");f.nodes.get("marketingGate").classList.contains=()=>false;
 assert.equal((await f.app.refresh()).code,"workspace_shell_hidden");assert.equal(f.calls(),0);
 f.app.dispose();
});
test("pagehide invalidates activation and disposal blocks future refresh",async()=>{
 const f=fixture();
 await f.app.refresh();
 const prev=f.clears();f.target.dispatchEvent(new Event("pagehide"));
 assert.ok(f.clears()>prev);
 f.app.dispose();
 assert.equal((await f.app.refresh()).code,"app_shell_disposed");
});
test("Cloudflare app boot stays off by default and restricted to authenticated owner/manager",()=>{
 const server=readFileSync(new URL("../cloudflare/src/release-governance-entry.js",import.meta.url),"utf8");
 assert.match(server,/WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED==="true"/);
 assert.match(server,/initialIdentity &&/);
 assert.match(server,/probeRole==="owner"\|\|probeRole==="manager"/);
 assert.match(server,/type="module" src="\$\{WORKSPACE_AGENT_ADVISORY_BOOT_SCRIPT\}"/);
 const runtime=readFileSync(new URL("../public/js/workspace-runtime-20261001b.js",import.meta.url),"utf8");
 assert.doesNotMatch(runtime,/workspace-agent-app-shell\.js/);
});
