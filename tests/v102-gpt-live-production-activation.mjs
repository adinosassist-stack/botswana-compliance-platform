import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";

const wrangler=fs.readFileSync("cloudflare/wrangler.toml","utf8");
const deploy=fs.readFileSync(".github/workflows/deploy-production.yml","utf8");
const postdeploy=fs.readFileSync(".github/workflows/postdeploy-smoke.yml","utf8");
const backend=fs.readFileSync("cloudflare/src/agentic-live-voice.js","utf8");
const client=fs.readFileSync("public/js/thebe-live-voice.js","utf8");

for(const path of ["cloudflare/src/agentic-live-voice.js","public/js/thebe-live-voice.js"]){
  execFileSync(process.execPath,["--check",path],{stdio:"pipe"});
}

assert.match(wrangler,/THEBE_LIVE_VOICE_ENABLED\s*=\s*"true"/);
assert.match(wrangler,/THEBE_LIVE_VOICE_MAX_STARTS_PER_HOUR\s*=\s*"6"/);
assert.match(wrangler,/THEBE_LIVE_VOICE_MAX_USER_STARTS_PER_HOUR\s*=\s*"4"/);
assert.match(wrangler,/THEBE_LIVE_VOICE_MAX_SESSION_SECONDS\s*=\s*"600"/);
assert.match(wrangler,/THEBE_LIVE_VOICE_UPSTREAM_TIMEOUT_MS\s*=\s*"12000"/);
assert.match(wrangler,/THEBE_LIVE_VOICE_FAILURE_CIRCUIT_THRESHOLD\s*=\s*"3"/);

assert.match(deploy,/OPENAI_API_KEY:\s*\$\{\{ secrets\.OPENAI_API_KEY \}\}/);
assert.match(deploy,/OPENAI_API_KEY is required when THEBE_LIVE_VOICE_ENABLED=true/);
assert.match(deploy,/live_voice_enabled=/);
assert.match(deploy,/--secrets-file "\$SECRETS_FILE"/);

assert.match(postdeploy,/\/api\/agentic\/live\/status/);
assert.match(postdeploy,/GPT-Live voice authentication boundary/);
assert.match(postdeploy,/assert\.equal\(liveVoice\.status,401\)/);

assert.match(backend,/recentLiveTelemetry/);
assert.match(backend,/boundedUserStarts/);
assert.match(backend,/boundedSessionSeconds/);
assert.match(backend,/boundedUpstreamTimeoutMs/);
assert.match(backend,/boundedFailureThreshold/);
assert.match(backend,/AbortController/);
assert.match(backend,/live_failure_circuit_open/);
assert.match(client,/sessionTimer/);
assert.match(client,/maxSessionSeconds/);
assert.match(client,/session\.close/);

console.log("v102 GPT-Live production activation: PASS");
