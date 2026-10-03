import assert from "node:assert/strict";
import fs from "node:fs";
import {
  normalizeGptLiveServerEvent,
  gptLiveContextAppend,
  gptLiveDelegationUpdate,
  gptLiveEvalSample,
  compareGptLiveEvalSamples,
  gptLiveMigrationStatus,
  GPT_LIVE_APPEND_MAX_CHARS
} from "../cloudflare/src/agentic-live-voice-v270.js";

const input=normalizeGptLiveServerEvent({
  type:"session.input_transcript.delta",
  delta:"hello",
  start_ms:120,
  end_ms:280
});
assert.equal(input.kind,"input_transcript_delta");
assert.equal(input.delta,"hello");
assert.equal(input.startMs,120);

const output=normalizeGptLiveServerEvent({type:"session.output_transcript.delta",delta:"Hi there"});
assert.equal(output.kind,"output_transcript_delta");
assert.equal(output.delta,"Hi there");

const delegation=normalizeGptLiveServerEvent({
  type:"session.delegation.created",
  offset_ms:950,
  delegation:{id:"item_123",target:"client"}
});
assert.equal(delegation.kind,"delegation_created");
assert.equal(delegation.delegationId,"item_123");
assert.equal(delegation.target,"client");
assert.equal(delegation.offsetMs,950);

const usage=normalizeGptLiveServerEvent({type:"session.usage.updated",event_id:"usage_1",usage:{seconds:22.5}});
assert.equal(usage.kind,"usage_updated");
assert.equal(usage.seconds,22.5);

const ack=normalizeGptLiveServerEvent({
  type:"session.commentary.appended",
  client_event_id:"result_1",
  start_ms:1000,
  end_ms:1100
});
assert.equal(ack.kind,"append_acknowledged");
assert.equal(ack.clientEventId,"result_1");

const error=normalizeGptLiveServerEvent({type:"error",error:{code:"provider_error",message:"Upstream failed"}});
assert.equal(error.kind,"error");
assert.equal(error.code,"provider_error");

const progress=gptLiveDelegationUpdate({
  delegationId:"item_123",
  eventId:"progress_1",
  content:"Checking the governed backend. No action has been executed.",
  status:"progress",
  speak:false
});
assert.equal(progress.type,"session.thinking.append");
assert.equal(progress.delegation_id,"item_123");

const result=gptLiveDelegationUpdate({
  delegationId:"item_123",
  eventId:"result_1",
  content:"The verified backend returned the current balance. No payment was executed.",
  status:"completed",
  speak:true,
  verified:true
});
assert.equal(result.type,"session.commentary.append");
assert.equal(result.delegation_id,"item_123");
assert.throws(()=>gptLiveDelegationUpdate({
  delegationId:"item_123",
  eventId:"unsafe_result",
  content:"Done",
  status:"completed",
  speak:true,
  verified:false
}),/verified_terminal_result_required/);

const instruction=gptLiveContextAppend({
  channel:"instructions",
  delegationId:null,
  eventId:"guard_1",
  content:"Do not claim an external action succeeded without a verified backend result."
});
assert.equal(instruction.type,"session.instructions.append");
assert.equal(instruction.delegation_id,null);
assert.throws(()=>gptLiveContextAppend({channel:"other",eventId:"x",content:"x"}),/invalid_gpt_live_append_channel/);
assert.throws(()=>gptLiveContextAppend({channel:"thinking",eventId:"",content:"x"}),/gpt_live_event_id_required/);
assert.ok(GPT_LIVE_APPEND_MAX_CHARS<=2000,"application append bound should remain compact");

const realtime=gptLiveEvalSample({
  runtime:"realtime",
  connectMs:900,
  firstInputTranscriptMs:1200,
  delegationCreatedMs:1800,
  firstUsefulAnswerMs:3200,
  interruptions:2,
  delegations:3,
  providerFailures:1,
  sessionSeconds:90
});
const live=gptLiveEvalSample({
  runtime:"gpt-live",
  connectMs:700,
  firstInputTranscriptMs:900,
  delegationCreatedMs:1400,
  firstUsefulAnswerMs:2500,
  interruptions:3,
  delegations:3,
  providerFailures:0,
  sessionSeconds:90
});
const comparison=compareGptLiveEvalSamples({realtime,live});
assert.equal(comparison.connectMsDelta,-200);
assert.equal(comparison.firstUsefulAnswerMsDelta,-700);
assert.equal(comparison.providerFailureDelta,-1);
assert.equal(comparison.interruptionDelta,1);
assert.throws(()=>gptLiveEvalSample({runtime:"other"}),/invalid_voice_eval_runtime/);

const status=gptLiveMigrationStatus({THEBE_GPT_LIVE_PREVIEW_ENABLED:"1",THEBE_LIVE_VOICE_RUNTIME:"gpt_live_preview"});
assert.equal(status.previewEnabled,true);
assert.equal(status.eventCompatibility,true);
assert.equal(status.comparativeTelemetry,true);
assert.equal(status.productionSwitchAllowed,false);

const production=fs.readFileSync("cloudflare/src/agentic-live-voice.js","utf8");
assert.match(production,/gpt-realtime-2\.1/);
assert.match(production,/\/v1\/realtime\/calls/);
assert.doesNotMatch(production,/THEBE_GPT_LIVE_PREVIEW_ENABLED/,"V271 still must not silently route production voice into preview");

console.log("PASS: V271 GPT-Live event compatibility, governed append events and comparative telemetry qualified");
