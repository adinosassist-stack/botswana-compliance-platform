import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync("public/js/thebe-live-preview-fallback-v272.js","utf8");
assert.match(source,/gpt_live_event_adapter_unavailable/);
assert.match(source,/gptLiveEventCompatibility===true/);
assert.match(source,/supportedRuntimes/);

const calls=[];
let previewMode="success";
const window={
  location:{origin:"https://thebedesk.test"},
  document:{readyState:"complete",addEventListener(){}},
  dispatchEvent(){},
  CustomEvent:class CustomEvent{constructor(name,options){this.type=name;this.detail=options?.detail}},
  setInterval(fn){fn();return 1},
  clearInterval(){},
  ThebeLiveVoice:{status:()=>({state:"idle"})},
  apiJson:async(url,options={})=>{
    calls.push({url,method:String(options?.method||"GET").toUpperCase()});
    if(url==="/api/agentic/live/preview/status")return {sessionCreationAllowed:true,gateCode:"gpt_live_preview_ready"};
    if(url==="/api/agentic/live/preview/session"){
      if(previewMode==="success")return {runtime:"gpt-live"};
      const error=new Error("preview failed");
      error.status=previewMode==="forbidden"?403:502;
      error.data={error:previewMode==="forbidden"?"forbidden":"gpt_live_preview_upstream_failed"};
      throw error;
    }
    if(url==="/api/agentic/live/session")return {runtime:"realtime"};
    return {ok:true};
  }
};
window.window=window;
vm.runInNewContext(source,{window,URL,Date,Math,Promise,console},{filename:"thebe-live-preview-fallback-v272.js"});

assert.equal(window.ThebeLivePreviewFallback.previewClientCompatible(),false);
calls.length=0;
let result=await window.apiJson("/api/agentic/live/session",{method:"POST",body:"{}"});
assert.equal(result.runtime,"realtime");
assert.deepEqual(calls.map(call=>call.url),["/api/agentic/live/session"],"preview status must not even be queried until the browser event adapter declares compatibility");

window.ThebeLiveVoice.status=()=>({
  state:"idle",
  supportedRuntimes:["realtime","gpt-live"],
  gptLiveEventCompatibility:true
});
assert.equal(window.ThebeLivePreviewFallback.previewClientCompatible(),true);
calls.length=0;
result=await window.apiJson("/api/agentic/live/session",{method:"POST",body:"{}"});
assert.equal(result.runtime,"gpt-live");
assert.deepEqual(calls.map(call=>call.url),[
  "/api/agentic/live/preview/status",
  "/api/agentic/live/preview/session"
]);

previewMode="retryable";
calls.length=0;
result=await window.apiJson("/api/agentic/live/session",{method:"POST",body:"{}"});
assert.equal(result.runtime,"realtime");
assert.deepEqual(calls.map(call=>call.url),[
  "/api/agentic/live/preview/session",
  "/api/agentic/live/session"
]);

previewMode="forbidden";
calls.length=0;
await assert.rejects(()=>window.apiJson("/api/agentic/live/session",{method:"POST",body:"{}"}),/preview failed/);
assert.deepEqual(calls.map(call=>call.url),["/api/agentic/live/preview/session"],"authorization/client errors must not be hidden by a fallback retry");

const assetIdentity=fs.readFileSync("cloudflare/src/asset-release-identity.js","utf8");
assert.match(assetIdentity,/thebe-live-preview-fallback-v272\.js/);

const productionClient=fs.readFileSync("public/js/thebe-live-voice.js","utf8");
assert.doesNotMatch(productionClient,/gptLiveEventCompatibility\s*:\s*true/,"current production voice client must not falsely advertise GPT-Live event compatibility");

console.log("PASS: V272 client preview selector remains fail-closed until event compatibility is present and falls back only for retryable preview failures");
