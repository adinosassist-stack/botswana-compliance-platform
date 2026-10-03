import assert from "node:assert/strict";
import fs from "node:fs";
import {
  gptLivePreviewGate,
  gptLivePreviewStatus,
  createGptLivePreviewSession,
  THEBE_GPT_LIVE_PREVIEW_TRANSPORT_VERSION
} from "../cloudflare/src/agentic-live-preview.js";

const enabledEnv={
  THEBE_LIVE_VOICE_ENABLED:"1",
  THEBE_GPT_LIVE_PREVIEW_ENABLED:"1",
  THEBE_LIVE_VOICE_RUNTIME:"gpt_live_preview",
  AGENT_RUNTIME_ENABLED:"1",
  OPENAI_API_KEY:"sk-test-this-is-long-enough-for-config-check"
};
const validOffer="v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n";
const validAnswer="v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n";

assert.match(THEBE_GPT_LIVE_PREVIEW_TRANSPORT_VERSION,/v272$/);

assert.deepEqual(gptLivePreviewGate({}),{allowed:false,code:"live_voice_disabled"});
assert.equal(gptLivePreviewGate({...enabledEnv,THEBE_GPT_LIVE_PREVIEW_ENABLED:"0"}).code,"gpt_live_preview_disabled");
assert.equal(gptLivePreviewGate({...enabledEnv,AGENT_RUNTIME_KILL_SWITCH:"1"}).code,"agent_runtime_kill_switch");
assert.equal(gptLivePreviewGate({...enabledEnv,OPENAI_API_KEY:""}).code,"openai_not_configured");
assert.deepEqual(gptLivePreviewGate(enabledEnv),{allowed:true,code:"gpt_live_preview_ready"});

const status=gptLivePreviewStatus(enabledEnv);
assert.equal(status.sessionCreationAllowed,true);
assert.equal(status.runtime,"gpt-live");
assert.equal(status.model,"gpt-live-1");
assert.equal(status.productionSwitchAllowed,false);
assert.equal(status.fallback.runtime,"realtime");
assert.equal(status.fallback.path,"/api/agentic/live/session");
assert.equal(JSON.stringify(status).includes(enabledEnv.OPENAI_API_KEY),false);

const disabledRequest=new Request("https://thebedesk.test/api/agentic/live/preview/session",{
  method:"POST",
  headers:{"content-type":"application/json"},
  body:JSON.stringify({sdp:validOffer})
});
const disabledResponse=await createGptLivePreviewSession({request:disabledRequest,env:{}});
assert.equal(disabledResponse.status,503);
const disabledBody=await disabledResponse.json();
assert.equal(disabledBody.fallback.path,"/api/agentic/live/session");

const malformedRequest=new Request("https://thebedesk.test/api/agentic/live/preview/session",{
  method:"POST",
  headers:{"content-type":"application/json"},
  body:JSON.stringify({sdp:"not-sdp"})
});
const malformedResponse=await createGptLivePreviewSession({request:malformedRequest,env:enabledEnv});
assert.equal(malformedResponse.status,400);
assert.equal((await malformedResponse.json()).error,"invalid_webrtc_offer");

const originalFetch=globalThis.fetch;
try{
  let captured=null;
  globalThis.fetch=async(url,options)=>{
    captured={url,options};
    return new Response(JSON.stringify({
      id:"live_session_123",
      transport:{type:"webrtc",sdp:validAnswer}
    }),{status:200,headers:{"content-type":"application/json"}});
  };

  const request=new Request("https://thebedesk.test/api/agentic/live/preview/session",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({sdp:validOffer,voice:"marin"})
  });
  const response=await createGptLivePreviewSession({request,env:enabledEnv});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.runtime,"gpt-live");
  assert.equal(body.session.id,"live_session_123");
  assert.equal(body.transport.sdp,validAnswer);
  assert.equal(body.delegation.type,"client");
  assert.equal(body.productionSwitchAllowed,false);
  assert.equal(body.fallback.path,"/api/agentic/live/session");

  assert.equal(captured.url,"https://api.openai.com/v1/live/sessions");
  assert.equal(captured.options.method,"POST");
  assert.equal(captured.options.headers["content-type"],"application/json");
  assert.match(captured.options.headers.authorization,/^Bearer sk-test/);
  const providerBody=JSON.parse(captured.options.body);
  assert.equal(providerBody.session.model,"gpt-live-1");
  assert.equal(providerBody.session.delegation.type,"client");
  assert.equal(providerBody.session.store,false);
  assert.equal(providerBody.transport.type,"webrtc");
  assert.equal(providerBody.transport.sdp,validOffer);

  globalThis.fetch=async()=>new Response(JSON.stringify({error:{code:"billing_not_active",message:"secret provider detail"}}),{
    status:403,
    headers:{"content-type":"application/json"}
  });
  const rejectedRequest=new Request("https://thebedesk.test/api/agentic/live/preview/session",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({sdp:validOffer})
  });
  const rejectedResponse=await createGptLivePreviewSession({request:rejectedRequest,env:enabledEnv});
  assert.equal(rejectedResponse.status,502);
  const rejectedBody=await rejectedResponse.json();
  assert.equal(rejectedBody.error,"gpt_live_preview_upstream_failed");
  assert.equal(rejectedBody.providerCode,"billing_not_active");
  assert.equal(JSON.stringify(rejectedBody).includes("secret provider detail"),false);
  assert.equal(rejectedBody.fallback.path,"/api/agentic/live/session");

  globalThis.fetch=async()=>new Response(JSON.stringify({id:"bad",transport:{sdp:"invalid"}}),{
    status:200,
    headers:{"content-type":"application/json"}
  });
  const invalidProviderRequest=new Request("https://thebedesk.test/api/agentic/live/preview/session",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({sdp:validOffer})
  });
  const invalidProviderResponse=await createGptLivePreviewSession({request:invalidProviderRequest,env:enabledEnv});
  assert.equal(invalidProviderResponse.status,502);
  assert.equal((await invalidProviderResponse.json()).error,"gpt_live_preview_invalid_response");
}finally{
  globalThis.fetch=originalFetch;
}

const entry=fs.readFileSync("cloudflare/src/agentic-entry.js","utf8");
const previewIndex=entry.indexOf("handleAgenticLivePreviewRequest");
const productionIndex=entry.indexOf("handleAgenticLiveVoiceRequest");
assert.ok(previewIndex>=0,"preview handler must be imported/routed");
assert.ok(productionIndex>=0,"production live handler must remain routed");
assert.ok(entry.indexOf("const livePreviewResponse=")<entry.indexOf("const liveVoiceResponse="),"preview route must be checked before production live handler can return its live-prefix 404");

const production=fs.readFileSync("cloudflare/src/agentic-live-voice.js","utf8");
assert.match(production,/gpt-realtime-2\.1/);
assert.match(production,/\/v1\/realtime\/calls/);
assert.doesNotMatch(production,/\/api\/agentic\/live\/preview\/session/);

console.log("PASS: V272 isolated GPT-Live preview transport and Realtime fallback boundary qualified");
