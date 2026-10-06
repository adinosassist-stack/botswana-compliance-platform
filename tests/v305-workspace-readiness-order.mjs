import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const entry=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const helper=fs.readFileSync("public/js/workspace-readiness-v305.js","utf8");
const start=entry.indexOf("function externalizeWorkspaceRuntime(");
const end=entry.indexOf("\nfunction externalizeWorkspaceHeadStyles",start);
assert(start>=0&&end>start);
const transform=vm.createContext({WORKSPACE_RUNTIME_ASSET:"/js/workspace-runtime-test.js",WORKSPACE_RUNTIME_RELEASE:"test"});
vm.runInContext(entry.slice(start,end),transform);
const html=transform.externalizeWorkspaceRuntime('<script id="thebe-workspace-runtime-inline">coreRuntime()</script><script>window.whenThebeWorkspaceReady(enhance)</script>');
const tags=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
let enhanced=0;
const events=new EventTarget();
const window={addEventListener:events.addEventListener.bind(events)};
const context=vm.createContext({window,queueMicrotask,enhance:()=>{enhanced++}});
for(const tag of tags){
  const attributes=tag[1];
  if(/\bdefer\b/.test(attributes))continue;
  if(attributes.includes("/js/workspace-readiness-v305.js"))vm.runInContext(helper,context);
  else if(!/\bsrc=/.test(attributes))vm.runInContext(tag[2],context);
}
assert.equal(enhanced,0,"enhancements must remain behind authenticated readiness");
assert.equal(window.__THEBE_WORKSPACE_READY__,false,"loading the hook must not reveal workspace");
window.__THEBE_WORKSPACE_READY__=true;
events.dispatchEvent(new Event("thebe:workspace-ready"));
events.dispatchEvent(new Event("thebe:workspace-ready"));
assert.equal(enhanced,1,"early subscriber runs exactly once after readiness");
window.whenThebeWorkspaceReady(()=>{enhanced++});
await Promise.resolve();
assert.equal(enhanced,2,"late subscriber runs after ready");
window.whenThebeWorkspaceReady(null);
vm.runInContext(helper,context);
assert.equal(window.__THEBE_WORKSPACE_READY__,true,"reloading the helper must not reset readiness");
assert.equal(transform.externalizeWorkspaceRuntime("<p>Public surface</p>"),"<p>Public surface</p>");
console.log("PASS: parser-time enhancements can register before deferred runtime; authenticated readiness remains required.");
