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

assert.match(backend,/gpt-live-1/);
assert.match(backend,/https:\/\/api\.openai\.com\/v1\/live\/sessions/);
assert.match(backend,/delegation:\{type:"client"\}/);
assert.match(backend,/THEBE_LIVE_VOICE_ENABLED/);
assert.match(backend,/OPENAI_API_KEY/);
assert.match(backend,/AGENT_RUNTIME_KILL_SWITCH/);
assert.match(backend,/AbortController/);
assert.match(backend,/live_failure_circuit_open/);
assert.match(backend,/THEBE_LIVE_VOICE_MAX_SESSION_SECONDS/);
assert.match(backend,/originAllowed\(request,env\)/);
assert.match(backend,/csrfAllowed\(request,auth\)/);
assert.match(backend,/\/api\/agentic\/plan/);
assert.match(backend,/session\.commentary\.append/);
assert.match(backend,/No business action was executed from this voice delegation/);
assert.doesNotMatch(backend,/payment\.execute.*allow/i);

assert.equal(liveTest.boundedSessionSeconds(undefined),600);
assert.equal(liveTest.boundedSessionSeconds(30),600);
assert.equal(liveTest.boundedSessionSeconds(1200),1200);
assert.equal(liveTest.boundedUpstreamTimeoutMs(undefined),12000);
assert.equal(liveTest.boundedUserStarts(undefined),4);
assert.equal(liveTest.boundedFailureThreshold(undefined),3);
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
assert.match(client,/session\.input_transcript\.delta/);
assert.match(client,/session\.output_transcript\.delta/);
assert.match(client,/session\.delegation\.created/);
assert.match(client,/transcriptRevision/);
assert.match(client,/inputTranscript\.slice\(-2400\)/);
assert.match(client,/revision!==transcriptRevision/);
assert.match(client,/event\?\.delegation\?\.id/);
assert.match(client,/event\?\.delegation\?\.target!=="client"/);
assert.match(client,/session\.commentary\.append/);
assert.match(client,/session\.thinking\.append/);
assert.match(client,/session\.instructions\.append/);
assert.match(client,/session\.close/);
assert.match(client,/session\.closed/);
assert.match(client,/sessionTimer=setTimeout/);
assert.match(client,/thebe-live-session-limit/);
assert.match(client,/\/api\/agentic\/live\/delegation/);
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
assert.match(wrangler,/THEBE_LIVE_VOICE_ENABLED = "(?:true|false)"/);
assert.match(wrangler,/THEBE_LIVE_VOICE_MAX_SESSION_SECONDS = "600"/);
assert.match(env,/OPENAI_API_KEY=/);
assert.ok(deployWorkflow.includes("OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}"));
assert.ok(deployWorkflow.includes("const optionalNames = [\'GOOGLE_OAUTH_CLIENT_SECRET\',\'FACEBOOK_APP_SECRET\',\'RESEND_API_KEY\',\'OPENAI_API_KEY\'];"));
assert.ok(deployWorkflow.includes("\'GOOGLE_OAUTH_CLIENT_SECRET\',\'FACEBOOK_APP_SECRET\',\'RESEND_API_KEY\',\'OPENAI_API_KEY\'"));

console.log("v101 GPT-Live-1 voice foundation: PASS");
