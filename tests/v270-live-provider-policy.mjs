import assert from "node:assert/strict";
import {
  resolveThebeVoiceProvider,
  thebeVoiceProviderDiagnostics,
  openAIVoiceSessionEnvelope,
  THEBE_VOICE_PROVIDER_POLICY_VERSION
} from "../cloudflare/src/thebe-voice-provider-policy.js";

const sdp="v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n";
const baseSession={
  type:"realtime",
  model:"legacy-placeholder",
  output_modalities:["audio"],
  audio:{output:{voice:"marin"}}
};

assert.match(THEBE_VOICE_PROVIDER_POLICY_VERSION,/v270-eval$/);

const defaultPolicy=resolveThebeVoiceProvider({});
assert.equal(defaultPolicy.provider,"realtime");
assert.equal(defaultPolicy.model,"gpt-realtime-2.1");
assert.equal(defaultPolicy.endpoint,"https://api.openai.com/v1/realtime/calls");
assert.equal(defaultPolicy.evaluationOnly,false);
assert.deepEqual(defaultPolicy.fallbackChain,["realtime"]);

const blockedLive=resolveThebeVoiceProvider({THEBE_VOICE_PROVIDER:"live"});
assert.equal(blockedLive.requestedProvider,"live");
assert.equal(blockedLive.provider,"realtime");
assert.equal(blockedLive.fallbackApplied,true);
assert.equal(blockedLive.reason,"live_evaluation_disabled");

const livePolicy=resolveThebeVoiceProvider({
  THEBE_VOICE_PROVIDER:"live",
  THEBE_GPT_LIVE_EVAL_ENABLED:"1"
});
assert.equal(livePolicy.provider,"live");
assert.equal(livePolicy.model,"gpt-live-1");
assert.equal(livePolicy.endpoint,"https://api.openai.com/v1/live/sessions");
assert.equal(livePolicy.transport,"webrtc");
assert.equal(livePolicy.evaluationOnly,true);
assert.equal(livePolicy.fallbackApplied,false);
assert.deepEqual(livePolicy.fallbackChain,["live","realtime"]);

const unknownPolicy=resolveThebeVoiceProvider({THEBE_VOICE_PROVIDER:"other-provider"});
assert.equal(unknownPolicy.provider,"realtime");
assert.equal(unknownPolicy.fallbackApplied,true);
assert.equal(unknownPolicy.reason,"unknown_provider_fallback");

const realtimeEnvelope=openAIVoiceSessionEnvelope({provider:"realtime",sdp,session:baseSession});
assert.equal(realtimeEnvelope.provider,"realtime");
assert.equal(realtimeEnvelope.contentType,"multipart/form-data");
assert.equal(realtimeEnvelope.body.sdp,sdp);
const realtimeConfig=JSON.parse(realtimeEnvelope.body.session);
assert.equal(realtimeConfig.type,"realtime");
assert.equal(realtimeConfig.model,"gpt-realtime-2.1");

const liveEnvelope=openAIVoiceSessionEnvelope({provider:"live",sdp,session:baseSession});
assert.equal(liveEnvelope.provider,"live");
assert.equal(liveEnvelope.contentType,"application/json");
assert.equal(liveEnvelope.body.transport.type,"webrtc");
assert.equal(liveEnvelope.body.transport.sdp,sdp);
assert.equal(liveEnvelope.body.session.model,"gpt-live-1");
assert.equal("type" in liveEnvelope.body.session,false);

assert.throws(()=>openAIVoiceSessionEnvelope({provider:"live",sdp:"bad",session:baseSession}),/invalid_webrtc_offer/);
assert.throws(()=>openAIVoiceSessionEnvelope({provider:"live",sdp,session:null}),/invalid_voice_session_config/);

const diagnostics=thebeVoiceProviderDiagnostics({
  THEBE_VOICE_PROVIDER:"live",
  THEBE_GPT_LIVE_EVAL_ENABLED:"true",
  OPENAI_API_KEY:"sk-should-never-appear"
});
assert.equal(diagnostics.provider,"live");
assert.equal(JSON.stringify(diagnostics).includes("sk-should-never-appear"),false);
assert.equal("endpoint" in diagnostics,false,"public diagnostics must not expose upstream routing details");

console.log("V270 live provider policy tests passed");
