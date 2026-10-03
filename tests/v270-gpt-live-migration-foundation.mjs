import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  GPT_LIVE_API_URL,GPT_LIVE_MODEL,GPT_LIVE_DELEGATION_MODE,
  GPT_LIVE_ALLOWED_CLIENT_EVENTS,GPT_LIVE_ALLOWED_SERVER_EVENTS,
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
assert.deepEqual(config.client.data_channel.allowed_client_events,GPT_LIVE_ALLOWED_CLIENT_EVENTS);
assert.deepEqual(config.client.data_channel.allowed_server_events,GPT_LIVE_ALLOWED_SERVER_EVENTS);
for(const type of ['session.close','session.thinking.append','session.commentary.append','session.instructions.append','session.input_audio.mute','session.input_audio.unmute'])assert(GPT_LIVE_ALLOWED_CLIENT_EVENTS.includes(type));
for(const type of ['session.started','session.input_transcript.delta','session.output_transcript.delta','session.delegation.created','session.usage.updated','session.closed','error'])assert(GPT_LIVE_ALLOWED_SERVER_EVENTS.some(event=>event.type===type));
assert.equal(GPT_LIVE_ALLOWED_CLIENT_EVENTS.includes('response.create'),false,'preview frontend cannot start unmanaged Responses work');

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
assert.equal(status.dataChannelRestricted,true);
assert.equal(status.productionSwitchAllowed,false,'migration foundation must not silently switch production voice');

const production=fs.readFileSync('cloudflare/src/agentic-live-voice.js','utf8');
assert.match(production,/gpt-realtime-2\.1/,'qualified production voice remains on current Realtime model');
assert.match(production,/\/v1\/realtime\/calls/,'qualified production transport remains unchanged');
assert.doesNotMatch(production,/THEBE_GPT_LIVE_PREVIEW_ENABLED/,'preview foundation is not wired into production traffic yet');

console.log('PASS: GPT-Live preview remains double-opt-in and production-safe with a least-privilege WebRTC data channel');
