import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {__agenticLiveVoiceTest as liveTest} from "../cloudflare/src/agentic-live-voice.js";

const backend=fs.readFileSync("cloudflare/src/agentic-live-voice.js","utf8");
const client=fs.readFileSync("public/js/thebe-live-voice.js","utf8");
const entry=fs.readFileSync("cloudflare/src/agentic-entry.js","utf8");
const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const env=fs.readFileSync(".env.example","utf8");
const wrangler=fs.readFileSync("cloudflare/wrangler.toml","utf8");
const deployWorkflow=fs.readFileSync(".github/workflows/deploy-production.yml","utf8");

for(const path of ["cloudflare/src/agentic-live-voice.js","public/js/thebe-live-voice.js","cloudflare/src/agentic-entry.js","cloudflare/src/production-entry.js"]){
  execFileSync(process.execPath,["--check",path],{stdio:"pipe"});
}

assert.match(backend,/gpt-realtime-1\.5/);
assert.match(backend,/https:\/\/api\.openai\.com\/v1\/realtime\/calls/);
assert.match(backend,/new FormData\(\)/);
assert.match(backend,/OpenAI-Safety-Identifier/);
assert.match(backend,/delegate_to_thebe_backend/);
assert.match(backend,/type:"function"/);
assert.match(backend,/tool_choice:"auto"/);
assert.match(backend,/output_modalities:\["audio"\]/);
assert.match(backend,/THEBE_LIVE_VOICE_ENABLED/);
assert.match(backend,/OPENAI_API_KEY/);
assert.match(backend,/AGENT_RUNTIME_KILL_SWITCH/);
assert.match(backend,/AbortController/);
assert.match(backend,/live_failure_circuit_open/);
assert.match(backend,/THEBE_LIVE_VOICE_MAX_SESSION_SECONDS/);
assert.match(backend,/originAllowed\(request,env\)/);
assert.match(backend,/csrfAllowed\(request,auth\)/);
assert.match(backend,/\/api\/agentic\/plan/);
assert.match(backend,/No business action was executed from this voice delegation/);
assert.doesNotMatch(backend,/\/v1\/live\/sessions/);
assert.doesNotMatch(backend,/gpt-live-1/);
assert.doesNotMatch(backend,/session\.commentary\.append/);
assert.doesNotMatch(backend,/payment\.execute.*allow/i);

assert.equal(liveTest.boundedSessionSeconds(undefined),600);
assert.equal(liveTest.boundedSessionSeconds(30),600);
assert.equal(liveTest.boundedSessionSeconds(1200),1200);
assert.equal(liveTest.boundedUpstreamTimeoutMs(undefined),12000);
assert.equal(liveTest.boundedUserStarts(undefined),4);
assert.equal(liveTest.boundedFailureThreshold(undefined),3);
const config=liveTest.realtimeSessionConfig();
assert.equal(config.type,"realtime");
assert.equal(config.model,"gpt-realtime-1.5");
assert.deepEqual(config.output_modalities,["audio"]);
assert.equal(config.tool_choice,"auto");
assert.equal(config.tools.length,1);
assert.equal(config.tools[0].name,"delegate_to_thebe_backend");
assert.equal(config.tools[0].type,"function");
assert.deepEqual(config.tools[0].parameters.required,["request"]);

const readyEnv={
  THEBE_LIVE_VOICE_ENABLED:"1",
  OPENAI_API_KEY:"sk-proj-test-key-that-is-long-enough-for-config-check",
  AGENT_RUNTIME_ENABLED:"1"
};
assert.equal(liveTest.liveGate(readyEnv,{tenantStarts:0,userStarts:0,recentFailures:0}).code,"live_voice_ready");
assert.equal(liveTest.liveGate(readyEnv,{tenantStarts:6,userStarts:0,recentFailures:0}).code,"tenant_session_rate_limited");
assert.equal(liveTest.liveGate(readyEnv,{tenantStarts:0,userStarts:4,recentFailures:0}).code,"user_session_rate_limited");
assert.equal(liveTest.liveGate(readyEnv,{tenantStarts:0,userStarts:0,recentFailures:3}).code,"live_failure_circuit_open");

assert.match(client,/RTCPeerConnection/);
assert.match(client,/navigator\.mediaDevices\?\.getUserMedia/);
assert.match(client,/createDataChannel\("oai-events"\)/);
assert.match(client,/conversation\.item\.input_audio_transcription\.delta/);
assert.match(client,/response\.output_audio_transcript\.delta/);
assert.match(client,/input_audio_buffer\.speech_started/);
assert.match(client,/response\.done/);
assert.match(client,/item\?\.type==="function_call"/);
assert.match(client,/delegate_to_thebe_backend/);
assert.match(client,/type:"function_call_output"/);
assert.match(client,/type:"conversation\.item\.create"/);
assert.match(client,/type:"response\.create"/);
assert.match(client,/revision!==transcriptRevision/);
assert.match(client,/stale:true/);
assert.match(client,/sessionTimer=setTimeout/);
assert.match(client,/thebe-live-session-limit/);
assert.match(client,/\/api\/agentic\/live\/delegation/);
assert.doesNotMatch(client,/session\.delegation\.created/);
assert.doesNotMatch(client,/session\.commentary\.append/);
assert.doesNotMatch(client,/session\.thinking\.append/);
assert.doesNotMatch(client,/session\.instructions\.append/);
assert.doesNotMatch(client,/session\.close/);
assert.doesNotMatch(client,/api\.openai\.com/);
assert.doesNotMatch(client,/OPENAI_API_KEY/);

assert.match(entry,/handleAgenticLiveVoiceRequest/);
assert.match(entry,/liveVoiceResponse/);
assert.match(production,/thebe-live-voice\.js/);
assert.match(env,/THEBE_LIVE_VOICE_ENABLED=0/);
assert.match(env,/THEBE_LIVE_VOICE_MAX_STARTS_PER_HOUR=6/);
assert.match(env,/THEBE_LIVE_VOICE_MAX_USER_STARTS_PER_HOUR=4/);
assert.match(env,/THEBE_LIVE_VOICE_MAX_SESSION_SECONDS=600/);
assert.match(env,/THEBE_LIVE_VOICE_UPSTREAM_TIMEOUT_MS=12000/);
assert.match(env,/THEBE_LIVE_VOICE_FAILURE_CIRCUIT_THRESHOLD=3/);
assert.match(env,/OPENAI_API_KEY=/);
assert.match(wrangler,/THEBE_LIVE_VOICE_ENABLED = "true"/);
assert.match(wrangler,/THEBE_LIVE_VOICE_MAX_SESSION_SECONDS = "600"/);
assert.match(wrangler,/required = \[[^\]]*"OPENAI_API_KEY"[^\]]*\]/);
assert.ok(deployWorkflow.includes("OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}"));
assert.match(deployWorkflow,/required_secrets=\([\s\S]*OPENAI_API_KEY[\s\S]*\)/);
assert.ok(deployWorkflow.includes("'TURNSTILE_SECRET_KEY','PAYMENT_WEBHOOK_SECRET','BILLING_WEBHOOK_SECRET','OPENAI_API_KEY'"));
assert.ok(deployWorkflow.includes("const optionalNames = ['GOOGLE_OAUTH_CLIENT_SECRET','FACEBOOK_APP_SECRET','RESEND_API_KEY'];"));

console.log("v101 Thebe Live Voice Realtime GA activation: PASS");
