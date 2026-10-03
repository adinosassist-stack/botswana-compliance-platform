import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  GPT_LIVE_API_URL,GPT_LIVE_MODEL,GPT_LIVE_DELEGATION_MODE,
  gptLivePreviewEnabled,gptLiveSessionConfig,gptLiveCreateRequest,gptLiveMigrationStatus
} from '../cloudflare/src/agentic-live-voice-v270.js';

assert.equal(GPT_LIVE_API_URL,'https://api.openai.com/v1/live/sessions');
assert.equal(GPT_LIVE_MODEL,'gpt-live-1');
assert.equal(GPT_LIVE_DELEGATION_MODE,'client');
assert.equal(gptLivePreviewEnabled({}),false);
assert.equal(gptLivePreviewEnabled({THEBE_GPT_LIVE_PREVIEW_ENABLED:'1'}),false,'runtime selector is also required');
assert.equal(gptLivePreviewEnabled({THEBE_GPT_LIVE_PREVIEW_ENABLED:'1',THEBE_LIVE_VOICE_RUNTIME:'gpt_live_preview'}),true);

const config=gptLiveSessionConfig({instructions:'You are Thebe. Delegate governed business work to the backend.'});
assert.equal(config.model,'gpt-live-1');
assert.equal(config.delegation.type,'client');
assert.equal(config.audio.output.voice,'marin');
assert.equal(config.store,false);
assert.equal('tools' in config,false,'GPT-Live client delegation keeps governed tools in Thebe backend');

const request=gptLiveCreateRequest({
  sdp:'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n',
  instructions:'You are Thebe.'
});
assert.equal(request.url,'https://api.openai.com/v1/live/sessions');
assert.equal(request.body.transport.type,'webrtc');
assert.match(request.body.transport.sdp,/^v=0/);
assert.equal(request.body.session.model,'gpt-live-1');
assert.throws(()=>gptLiveCreateRequest({sdp:'invalid',instructions:'Thebe'}),/invalid_webrtc_offer/);
assert.throws(()=>gptLiveSessionConfig({instructions:''}),/gpt_live_instructions_required/);

const status=gptLiveMigrationStatus({THEBE_GPT_LIVE_PREVIEW_ENABLED:'1',THEBE_LIVE_VOICE_RUNTIME:'gpt_live_preview'});
assert.equal(status.previewEnabled,true);
assert.equal(status.productionRuntime,'realtime');
assert.equal(status.productionSwitchAllowed,false,'migration foundation must not silently switch production voice');

const production=fs.readFileSync('cloudflare/src/agentic-live-voice.js','utf8');
assert.match(production,/gpt-realtime-2\.1/,'qualified production voice remains on current Realtime model');
assert.match(production,/\/v1\/realtime\/calls/,'qualified production transport remains unchanged');
assert.doesNotMatch(production,/THEBE_GPT_LIVE_PREVIEW_ENABLED/,'preview foundation is not wired into production traffic yet');

console.log('PASS: V270 GPT-Live migration profile is double-opt-in, server-side, client-delegated and production-safe');
