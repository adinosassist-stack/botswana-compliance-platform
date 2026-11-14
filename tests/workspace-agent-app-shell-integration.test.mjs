import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createWorkspaceAgentAppShell, workspaceAgentScopeForView } from "../public/js/workspace-agent-app-shell.js";
function fixture(role="owner", { observe=false, fetchResponse=null } = {}) {
  const target = new EventTarget(); target.__THEBE_WORKSPACE_READY__=false;
  const nodes = new Map();
  for (const id of ["appShell","marketingGate","authGate","thebeAiDock"]) {
    nodes.set(id,{id,hidden:false,classList:{contains:()=>id!=="appShell"},dataset:{surface:"workspace"},style:{display:"",visibility:""}});
  }
  let view="dashboard",calls=0,activations=[],clears=0;
  const observers=[];
  class Observer {
    constructor(callback) { this.callback=callback; this.disconnected=false; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected=true; }
    notify() { this.callback([]); }
  }
  const documentListeners = new Map();
  const documentRef={
    body:{},
    addEventListener:(name,cb)=>documentListeners.set(name,cb),
    removeEventListener:(name,cb)=>{if(documentListeners.get(name)===cb)documentListeners.delete(name)},
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
    if (typeof fetchResponse === "function") return fetchResponse(path,options);
    return {ok:true,json:async()=>({user:{role,id:"u1"},csrfToken:"secret"})};
  };
  const app=createWorkspaceAgentAppShell({target,documentRef,fetchImpl,makeAdapter,MutationObserverImpl:observe?Observer:null});
  target.__THEBE_WORKSPACE_READY__=true;
  return {app,target,nodes,observers,setView:(value)=>{view=value},activations,clears:()=>clears,calls:()=>calls,
    dispatchDocumentEvent:(name,id)=>documentListeners.get(name)?.({target:{id}}),
    hasDocumentListener:(name)=>documentListeners.has(name),
    setVisibility:(state)=>{documentRef.visibilityState=state}};
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
 assert.match(server,/workspaceAgentAdvisoryPreviewAllowed\(\{env,request,probeRole,initialIdentity\}\)/);
 const gate=readFileSync(new URL("../cloudflare/src/workspace-agent-advisory-preview-gate.js",import.meta.url),"utf8");
 assert.match(gate,/env\?\.APP_ENV !== "staging"/);
 assert.match(gate,/WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED !== "true"/);
 assert.match(gate,/WORKSPACE_AGENT_ADVISORY_STAGING_HOST/);
 assert.match(gate,/initialIdentity &&/);
 assert.match(gate,/probeRole==="owner"\|\|probeRole==="manager"/);
 assert.match(server,/type="module" src="\$\{WORKSPACE_AGENT_ADVISORY_BOOT_SCRIPT\}"/);
 const runtime=readFileSync(new URL("../public/js/workspace-runtime-20261001b.js",import.meta.url),"utf8");
 assert.doesNotMatch(runtime,/workspace-agent-app-shell\.js/);
});

test("stale session probe cannot activate after navigation into unmapped view",async()=>{
 let resolveProbe;
 const f=fixture("owner",{fetchResponse:()=>new Promise(resolve=>{resolveProbe=resolve})});
 const pending=f.app.refresh();
 f.setView("payments");
 f.target.dispatchEvent(new Event("thebe:workspace-view-change"));
 resolveProbe({ok:true,json:async()=>({user:{role:"owner",id:"u1"},csrfToken:"secret"})});
 assert.equal((await pending).code,"identity_changed");
 assert.equal(f.activations.length,0);
 f.app.dispose();
});
test("CSS-concealed workspace clears tasks before any further activation",async()=>{
 const f=fixture("owner",{observe:true});
 await f.app.refresh();
 const calls=f.calls(), cleared=f.clears();
 f.nodes.get("appShell").style.display="none";
 f.observers[0].notify();
 assert.ok(f.clears()>cleared);
 assert.equal((await f.app.refresh()).code,"workspace_shell_hidden");
 assert.equal(f.calls(),calls);
 f.app.dispose();
 assert.ok(f.observers.every(observer=>observer.disconnected));
});
test("a remounted dock clears previous scope and refreshes against same-origin session",async()=>{
 const f=fixture("owner",{observe:true});
 await f.app.refresh();
 const cleared=f.clears();
 f.nodes.set("thebeAiDock",{id:"thebeAiDock",hidden:false,classList:{contains:()=>false},dataset:{surface:"workspace"}});
 f.observers[1].notify();
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.ok(f.clears()>cleared);
 assert.equal(f.calls(),2);
 assert.equal(f.activations.length,2);
 f.app.dispose();
});
test("missing Workspace dock never probes session",async()=>{
 const f=fixture();f.nodes.delete("thebeAiDock");
 assert.equal((await f.app.refresh()).code,"workspace_dock_required");
 assert.equal(f.calls(),0);
 f.app.dispose();
});

test("company selector change invalidates old advisory tasks without view navigation",async()=>{
 const f=fixture("owner");
 await f.app.refresh();
 const cleared=f.clears();
 f.dispatchDocumentEvent("change","companySelect");
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.ok(f.clears()>cleared);
 assert.equal(f.calls(),2);
 assert.equal(f.activations.length,2);
 f.app.dispose();
 assert.equal(f.hasDocumentListener("change"),false);
});

test("hidden tab discards advisory scope and visible return rechecks session",async()=>{
 const f=fixture("owner");
 await f.app.refresh();
 const cleared=f.clears();
 f.setVisibility("hidden");
 f.dispatchDocumentEvent("visibilitychange");
 assert.ok(f.clears()>cleared);
 f.setVisibility("visible");
 f.dispatchDocumentEvent("visibilitychange");
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(f.calls(),2);
 assert.equal(f.activations.length,2);
 f.app.dispose();
 assert.equal(f.hasDocumentListener("visibilitychange"),false);
});
test("pageshow revalidates session after navigation cache restore",async()=>{
 const f=fixture("owner");
 await f.app.refresh();
 f.target.dispatchEvent(new Event("pagehide"));
 f.target.dispatchEvent(new Event("pageshow"));
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(f.calls(),2);
 assert.equal(f.activations.length,2);
 f.app.dispose();
});
