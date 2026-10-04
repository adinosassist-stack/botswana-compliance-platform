import assert from "node:assert/strict";
import fs from "node:fs";
import {
  normalizeVoiceEvalEvidence,
  pairVoiceEvalEvidenceRows,
  VOICE_EVIDENCE_EVENT,
  THEBE_LIVE_EVIDENCE_VERSION
} from "../cloudflare/src/agentic-live-evidence-v274.js";
import {evaluateGptLivePromotionReadiness} from "../cloudflare/src/agentic-live-eval-v273.js";

const base={
  scenarioId:"cashflow-check-01",
  sessionId:"session-1",
  connectMs:700,
  firstInputTranscriptMs:900,
  delegationCreatedMs:1400,
  firstUsefulAnswerMs:2500,
  interruptions:1,
  interruptionsHandled:1,
  delegations:1,
  delegationsCompleted:1,
  providerFailures:0,
  sessionSeconds:90,
  transcript:"private words must never be stored",
  audio:"raw audio must never be stored",
  taskText:"sensitive business request must never be stored"
};

const realtime=normalizeVoiceEvalEvidence({...base,runtime:"realtime",sessionId:"rt-1",connectMs:850,firstUsefulAnswerMs:3000});
const live=normalizeVoiceEvalEvidence({...base,runtime:"gpt-live",sessionId:"live-1"});
assert.equal(realtime.version,THEBE_LIVE_EVIDENCE_VERSION);
assert.equal(live.sample.runtime,"gpt-live");
assert.equal(live.sample.scenarioId,"cashflow-check-01");
assert.equal("transcript" in live,false);
assert.equal("audio" in live,false);
assert.equal("taskText" in live,false);
assert.equal("transcript" in live.sample,false);
assert.equal("audio" in live.sample,false);
assert.equal("taskText" in live.sample,false);
assert.equal(VOICE_EVIDENCE_EVENT,"THEBE_LIVE_EVAL_EVIDENCE_RECORDED");

assert.throws(()=>normalizeVoiceEvalEvidence({...base,runtime:"other"}),/invalid_voice_eval_runtime/);
assert.throws(()=>normalizeVoiceEvalEvidence({...base,runtime:"realtime",scenarioId:""}),/voice_eval_scenario_id_required/);
assert.throws(()=>normalizeVoiceEvalEvidence({...base,runtime:"realtime",sessionId:""}),/voice_eval_session_id_required/);
assert.throws(()=>normalizeVoiceEvalEvidence({...base,runtime:"gpt-live",interruptions:1,interruptionsHandled:2}),/voice_eval_interruption_outcomes_exceed_events/);

const rows=[
  {event_data:JSON.stringify(live)},
  {event_data:JSON.stringify(realtime)},
  {event_data:"not-json"},
  {event_data:JSON.stringify({sample:{scenarioId:"unpaired",runtime:"gpt-live"}})}
];
const pairs=pairVoiceEvalEvidenceRows(rows);
assert.equal(pairs.length,1);
assert.equal(pairs[0].scenarioId,"cashflow-check-01");
assert.equal(pairs[0].realtime.runtime,"realtime");
assert.equal(pairs[0].live.runtime,"gpt-live");
const evaluation=evaluateGptLivePromotionReadiness({pairs,policy:{
  minPairedSessions:1,
  minDelegationEvents:1,
  minInterruptionEvents:1,
  maxProviderFailureRate:1,
  maxProviderFailureRateRegression:1,
  minDelegationCompletionRate:0,
  maxDelegationCompletionRateRegression:1,
  minInterruptionRecoveryRate:0,
  maxInterruptionRecoveryRateRegression:1,
  maxMedianFirstUsefulAnswerRegressionMs:10000,
  maxP95ConnectRegressionMs:10000
}});
assert.equal(evaluation.readyForHumanReview,true);
assert.equal(evaluation.productionSwitchAllowed,false);

const preview=fs.readFileSync("cloudflare/src/agentic-live-preview.js","utf8");
assert.match(preview,/\/api\/agentic\/live\/preview\/evidence/);
assert.match(preview,/\/api\/agentic\/live\/preview\/evidence\/summary/);
assert.match(preview,/recordVoiceEvalEvidence/);
assert.match(preview,/readVoiceEvalEvidenceSummary/);
assert.match(preview,/rawAudioStored:false/);
assert.match(preview,/transcriptStored:false/);
assert.match(preview,/taskTextStored:false/);

const browser=fs.readFileSync("public/js/thebe-live-evidence-v274.js","utf8");
assert.match(browser,/ThebeVoiceEval/);
assert.match(browser,/beginScenario/);
assert.match(browser,/sessionStorage/);
assert.match(browser,/thebe-live-state/);
assert.match(browser,/thebe-live-event/);
assert.match(browser,/thebe-live-delegation-result/);
assert.match(browser,/\/api\/agentic\/live\/preview\/evidence/);
assert.doesNotMatch(browser,/localStorage/,"evaluation opt-in must remain session-scoped rather than persistent");

const assets=fs.readFileSync("cloudflare/src/asset-release-identity.js","utf8");
assert.match(assets,/thebe-live-evidence-v274\.js/);
assert.match(assets,/LIVE_EVIDENCE_SRC/);
assert.match(assets,/options\?\.includeVoiceEvidence===true/);
assert.match(assets,/pathname==='\/app'\|\|pathname==='\/app\/'/);
assert.doesNotMatch(assets,/if\(!source\.includes\(LIVE_EVIDENCE_SRC\)\)/,"voice evidence asset must not be injected globally");

const production=fs.readFileSync("cloudflare/src/agentic-live-voice.js","utf8");
assert.match(production,/gpt-realtime-2\.1/);
assert.match(production,/\/v1\/realtime\/calls/);
assert.doesNotMatch(production,/agentic-live-evidence-v274/,"V274 evidence capture must not alter the production voice provider path");

console.log("PASS: V274 sealed voice evidence capture is opt-in, privacy-minimized, workspace-scoped and production-inert");
