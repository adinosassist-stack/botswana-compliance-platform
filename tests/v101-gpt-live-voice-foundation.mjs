import assert from "node:assert/strict";
import fs from "node:fs";

const backend=fs.readFileSync("cloudflare/src/agentic-live-voice.js","utf8");
const client=fs.readFileSync("public/js/thebe-live-voice.js","utf8");
const entry=fs.readFileSync("cloudflare/src/agentic-entry.js","utf8");
const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const env=fs.readFileSync(".env.example","utf8");

assert.match(backend,/gpt-live-1/);
assert.match(backend,/https:\/\/api\.openai\.com\/v1\/live\/sessions/);
assert.match(backend,/delegation:\{type:"client"\}/);
assert.match(backend,/THEBE_LIVE_VOICE_ENABLED/);
assert.match(backend,/OPENAI_API_KEY/);
assert.match(backend,/AGENT_RUNTIME_KILL_SWITCH/);
assert.match(backend,/originAllowed\(request,env\)/);
assert.match(backend,/csrfAllowed\(request,auth\)/);
assert.match(backend,/\/api\/agentic\/plan/);
assert.match(backend,/session\.commentary\.append/);
assert.match(backend,/No business action was executed from this voice delegation/);
assert.doesNotMatch(backend,/payment\.execute.*allow/i);

assert.match(client,/RTCPeerConnection/);
assert.match(client,/navigator\.mediaDevices\?\.getUserMedia/);
assert.match(client,/createDataChannel\("oai-events"\)/);
assert.match(client,/session\.input_transcript\.delta/);
assert.match(client,/session\.output_transcript\.delta/);
assert.match(client,/session\.delegation\.created/);
assert.match(client,/session\.commentary\.append/);
assert.match(client,/session\.thinking\.append/);
assert.match(client,/session\.instructions\.append/);
assert.match(client,/\/api\/agentic\/live\/delegation/);
assert.doesNotMatch(client,/api\.openai\.com/);
assert.doesNotMatch(client,/OPENAI_API_KEY/);

assert.match(entry,/handleAgenticLiveVoiceRequest/);
assert.match(entry,/\/api\/agentic\/live/);
assert.match(production,/thebe-live-voice\.js/);
assert.match(env,/THEBE_LIVE_VOICE_ENABLED=0/);
assert.match(env,/THEBE_LIVE_VOICE_MAX_STARTS_PER_HOUR=6/);
assert.match(env,/OPENAI_API_KEY=/);

console.log("v101 GPT-Live-1 voice foundation: PASS");
