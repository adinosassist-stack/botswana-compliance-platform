import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync("public/js/thebe-live-preview-fallback-v272.js","utf8");
assert.match(source,/LEGACY_BRIDGE_MARKER/);
assert.match(source,/__thebe_gpt_live_legacy_bridge/);
assert.match(source,/session\.delegation\.created/);
assert.match(source,/session\.commentary\.append/);
assert.match(source,/session\.thinking\.append/);

class FakeMessageEvent{
  constructor(type,options={}){this.type=type;this.data=options.data}
}

class FakeChannel{
  constructor(label){this.label=label;this.readyState="open";this.listeners=new Map();this.sent=[]}
  addEventListener(type,fn){
    if(!this.listeners.has(type))this.listeners.set(type,[]);
    this.listeners.get(type).push(fn);
  }
  dispatchEvent(event){
    for(const fn of [...(this.listeners.get(event.type)||[])])fn(event);
    return true;
  }
  send(data){this.sent.push(JSON.parse(String(data)))}
}

class FakeRTCPeerConnection{
  createDataChannel(label){return new FakeChannel(label)}
}

const calls=[];
let previewMode="success";
let delegationMode="verified";
const window={
  location:{origin:"https://thebedesk.test"},
  document:{readyState:"complete",addEventListener(){}},
  dispatchEvent(){},
  CustomEvent:class CustomEvent{constructor(name,options){this.type=name;this.detail=options?.detail}},
  MessageEvent:FakeMessageEvent,
  RTCPeerConnection:FakeRTCPeerConnection,
  setInterval(fn){fn();return 1},
  clearInterval(){},
  setTimeout,
  crypto:{randomUUID:()=>"event-test-id"},
  apiJson:async(url,options={})=>{
    calls.push({url,method:String(options?.method||"GET").toUpperCase(),body:options?.body||null});
    if(url==="/api/agentic/live/preview/status")return {sessionCreationAllowed:true,gateCode:"gpt_live_preview_ready"};
    if(url==="/api/agentic/live/preview/session"){
      if(previewMode==="success")return {runtime:"gpt-live",session:{id:"live-session-1"}};
      const error=new Error("preview failed");
      error.status=previewMode==="forbidden"?403:502;
      error.data={error:previewMode==="forbidden"?"forbidden":"gpt_live_preview_upstream_failed"};
      throw error;
    }
    if(url==="/api/agentic/live/preview/delegation"){
      if(delegationMode==="verified")return {
        ok:true,
        mode:"analyze",
        content:"Verified backend result.",
        verified:true,
        verification:{source:"governed_live_backend"},
        authority:{executionPerformed:false,taskPrepared:false}
      };
      return {
        ok:true,
        mode:"analyze",
        content:"Unverified result.",
        verified:false,
        verification:{source:"governed_live_backend"},
        authority:{executionPerformed:false,taskPrepared:false}
      };
    }
    if(url==="/api/agentic/live/session")return {runtime:"realtime",session:{id:"realtime-session-1"}};
    return {ok:true};
  }
};
window.window=window;

vm.runInNewContext(source,{
  window,URL,Date,Math,Promise,console,setTimeout,clearTimeout,
  CustomEvent:window.CustomEvent,MessageEvent:FakeMessageEvent
},{filename:"thebe-live-preview-fallback-v272.js"});

assert.equal(window.ThebeLivePreviewFallback.previewClientCompatible(),true,"installed data-channel bridge should qualify preview event compatibility");

calls.length=0;
let result=await window.apiJson("/api/agentic/live/session",{method:"POST",body:"{}"});
assert.equal(result.runtime,"gpt-live");
assert.deepEqual(calls.map(call=>call.url),[
  "/api/agentic/live/preview/status",
  "/api/agentic/live/preview/session"
]);
assert.equal(window.ThebeLivePreviewFallback.state().activeRuntime,"gpt-live");

const peer=new window.RTCPeerConnection();
const channel=peer.createDataChannel("oai-events");
const observed=[];
channel.addEventListener("message",event=>{
  try{observed.push(JSON.parse(String(event.data)))}catch{}
});

channel.dispatchEvent(new FakeMessageEvent("message",{data:JSON.stringify({
  type:"session.input_transcript.delta",
  delta:"Check current sales",
  start_ms:100,
  end_ms:300
})}));

assert.ok(observed.some(event=>event.type==="conversation.item.input_audio_transcription.delta"&&event.delta==="Check current sales"));
const bridgedTranscript=observed.find(event=>event.type==="conversation.item.input_audio_transcription.delta");
assert.equal(bridgedTranscript.__thebe_gpt_live_legacy_bridge,"session-v1");
assert.ok(observed.some(event=>event.type==="session.input_transcript.delta"),"original GPT-Live event should still reach normal listeners");

const beforeError=observed.length;
channel.dispatchEvent(new FakeMessageEvent("message",{data:JSON.stringify({type:"error",error:{code:"preview_error",message:"test"}})}));
const errorEvents=observed.slice(beforeError).filter(event=>event.type==="error");
assert.equal(errorEvents.length,2,"error should produce only original plus one legacy bridge event, never recursive redispatch");
assert.equal(errorEvents.filter(event=>event.__thebe_gpt_live_legacy_bridge==="session-v1").length,1);

const beforeClosed=observed.length;
channel.dispatchEvent(new FakeMessageEvent("message",{data:JSON.stringify({type:"session.closed"})}));
const closedEvents=observed.slice(beforeClosed).filter(event=>event.type==="session.closed");
assert.equal(closedEvents.length,2,"session.closed should produce only original plus one legacy bridge event, never recursive redispatch");
assert.equal(closedEvents.filter(event=>event.__thebe_gpt_live_legacy_bridge==="session-v1").length,1);

calls.length=0;
channel.sent.length=0;
channel.dispatchEvent(new FakeMessageEvent("message",{data:JSON.stringify({
  type:"session.delegation.created",
  offset_ms:300,
  delegation:{id:"delegation-1",target:"client"}
})}));
await new Promise(resolve=>setTimeout(resolve,0));

const delegationCall=calls.find(call=>call.url==="/api/agentic/live/preview/delegation");
assert.ok(delegationCall,"client delegation must go through the isolated governed preview delegation route");
const delegationBody=JSON.parse(delegationCall.body);
assert.equal(delegationBody.taskText,"Check current sales");
assert.equal(delegationBody.intent,"analyze");
assert.equal(delegationBody.sessionId,"live-session-1");
assert.ok(channel.sent.some(event=>event.type==="session.thinking.append"&&event.delegation_id==="delegation-1"));
assert.ok(channel.sent.some(event=>event.type==="session.commentary.append"&&event.content==="Verified backend result."));

channel.sent.length=0;
delegationMode="unverified";
channel.dispatchEvent(new FakeMessageEvent("message",{data:JSON.stringify({
  type:"session.delegation.created",
  offset_ms:300,
  delegation:{id:"delegation-2",target:"client"}
})}));
await new Promise(resolve=>setTimeout(resolve,0));
assert.ok(channel.sent.some(event=>event.type==="session.commentary.append"&&/could not verify/i.test(event.content)),"unverified backend output must not be spoken as a verified business result");
assert.equal(channel.sent.some(event=>event.type==="session.commentary.append"&&event.content==="Unverified result."),false);

previewMode="retryable";
calls.length=0;
result=await window.apiJson("/api/agentic/live/session",{method:"POST",body:"{}"});
assert.equal(result.runtime,"realtime");
assert.deepEqual(calls.map(call=>call.url),[
  "/api/agentic/live/preview/session",
  "/api/agentic/live/session"
]);
assert.equal(window.ThebeLivePreviewFallback.state().activeRuntime,"realtime");

previewMode="forbidden";
calls.length=0;
await assert.rejects(()=>window.apiJson("/api/agentic/live/session",{method:"POST",body:"{}"}),/preview failed/);
assert.deepEqual(calls.map(call=>call.url),["/api/agentic/live/preview/session"],"authorization/client errors must not be hidden by a fallback retry");

const assetIdentity=fs.readFileSync("cloudflare/src/asset-release-identity.js","utf8");
assert.match(assetIdentity,/thebe-live-preview-fallback-v272\.js/);

const productionClient=fs.readFileSync("public/js/thebe-live-voice.js","utf8");
assert.match(productionClient,/gpt-realtime-2\.1|ThebeLiveVoice/);

console.log("PASS: V272 browser GPT-Live bridge prevents recursive synthetic events, preserves governed delegation, and falls back only on retryable preview failures");
