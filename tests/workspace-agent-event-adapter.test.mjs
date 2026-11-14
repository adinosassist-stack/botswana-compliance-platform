import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceAgentEventAdapter } from "../public/js/workspace-agent-event-adapter.js";
function emitter() {
 const listeners = new Map();
 return {
  addEventListener(name, cb) { if (!listeners.has(name)) listeners.set(name,new Set()); listeners.get(name).add(cb); },
  removeEventListener(name, cb) { listeners.get(name)?.delete(cb); },
  dispatch(name, detail = {}) { for (const cb of listeners.get(name) || []) cb({ detail }); },
  count(name) { return listeners.get(name)?.size || 0; }
 };
}
test("untrusted ready events never activate or fetch identity", async () => {
 const target=emitter(); let calls=0;
 const adapter=createWorkspaceAgentEventAdapter({target,getDock:()=>({id:"thebeAiDock",dataset:{surface:"workspace"}}),fetchImpl:async()=>{calls++;throw Error("unexpected")}});
 target.dispatch("thebe:workspace-agent-shell-state",{reason:"ready",authenticated:true,role:"owner",view:"dashboard"});
 assert.equal(calls,0);
 assert.equal(adapter.isActive(),false);
 assert.deepEqual(await adapter.activateFromTrustedShell({authenticated:false,workspace:"owner"}),{ok:false,code:"authenticated_workspace_required"});
 assert.equal(calls,0);
 adapter.dispose();
});
test("navigation invalidates pending identity requests and disposal removes listeners", async () => {
 const target=emitter(); let resolveFetch;
 const adapter=createWorkspaceAgentEventAdapter({target,getDock:()=>({id:"thebeAiDock",dataset:{surface:"workspace"}}),fetchImpl:()=>new Promise(resolve=>{resolveFetch=resolve})});
 const pending=adapter.activateFromTrustedShell({authenticated:true,workspace:"owner"});
 target.dispatch("thebe:workspace-view-change",{id:"finance"});
 resolveFetch({ok:true,json:async()=>({ok:true,tenantId:"tenant",userId:"user"})});
 const result=await pending;
 assert.equal(result.ok,false);
 assert.equal(adapter.isActive(),false);
 adapter.dispose();
 assert.equal(target.count("thebe:workspace-view-change"),0);
 assert.deepEqual(await adapter.activateFromTrustedShell({authenticated:true,workspace:"owner"}),{ok:false,code:"adapter_disposed"});
});
