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
  fallbackAttempts:1,
  fallbackRecoveries:1,
  sessionSeconds:90,
  usageSeconds:78,
  languageContinuityChecks:2,
  languageContinuityPasses:2,
  languageTags:["en-bw","tn-BW"],
  acousticRecoveryChecks:2,
  acousticRecoveryPasses:2,
  acousticRecoveryKinds:["silence","noise"],
  pronunciationChecks:2,
  pronunciationPasses:2,
  pronunciationTags:["thebe-brand","setswana-name"],
  transcript:"private words must never be stored",
  audio:"raw audio must never be stored",
  taskText:"sensitive business request must never be stored",
  languageContent:"private language content must never be stored",
  acousticContent:"private environmental sound must never be stored",
  providerPrice:"provider pricing must never be stored"
};

const realtime=normalizeVoiceEvalEvidence({...base,runtime:"realtime",sessionId:"rt-1",connectMs:850,firstUsefulAnswerMs:3000,usageSeconds:80});
const live=normalizeVoiceEvalEvidence({...base,runtime:"gpt-live",sessionId:"live-1"});
assert.equal(realtime.version,THEBE_LIVE_EVIDENCE_VERSION);
assert.equal(live.sample.runtime,"gpt-live");
assert.equal(live.sample.scenarioId,"cashflow-check-01");
assert.equal(live.sample.usageSeconds,78);
assert.equal(live.sample.languageContinuityChecks,2);
assert.equal(live.sample.languageContinuityPasses,2);
assert.deepEqual(live.sample.languageTags,["en-BW","tn-BW"]);
assert.equal(live.sample.acousticRecoveryChecks,2);
assert.equal(live.sample.acousticRecoveryPasses,2);
assert.deepEqual(live.sample.acousticRecoveryKinds,["noise","silence"]);
assert.equal(live.sample.fallbackAttempts,1);
assert.equal(live.sample.fallbackRecoveries,1);
assert.equal(live.pronunciation.checks,2);
assert.equal(live.pronunciation.passes,2);
assert.deepEqual(live.pronunciation.tags,["thebe-brand","setswana-name"]);
for(const key of ["transcript","audio","taskText","languageContent","acousticContent","providerPrice"]){
  assert.equal(key in live,false);
  assert.equal(key in live.sample,false);
}
assert.equal(VOICE_EVIDENCE_EVENT,"THEBE_LIVE_EVAL_EVIDENCE_RECORDED");

assert.throws(()=>normalizeVoiceEvalEvidence({...base,runtime:"other"}),/invalid_voice_eval_runtime/);
assert.throws(()=>normalizeVoiceEvalEvidence({...base,runtime:"realtime",scenarioId:""}),/voice_eval_scenario_id_required/);
assert.throws(()=>normalizeVoiceEvalEvidence({...base,runtime:"realtime",sessionId:""}),/voice_eval_session_id_required/);
assert.throws(()=>normalizeVoiceEvalEvidence({...base,runtime:"gpt-live",interruptions:1,interruptionsHandled:2}),/voice_eval_interruption_outcomes_exceed_events/);
assert.throws(()=>normalizeVoiceEvalEvidence({...base,runtime:"gpt-live",languageContinuityChecks:1,languageContinuityPasses:2}),/voice_eval_language_passes_exceed_checks/);
assert.throws(()=>normalizeVoiceEvalEvidence({...base,runtime:"gpt-live",acousticRecoveryChecks:1,acousticRecoveryPasses:2}),/voice_eval_acoustic_passes_exceed_checks/);
assert.throws(()=>normalizeVoiceEvalEvidence({...base,runtime:"gpt-live",fallbackAttempts:1,fallbackRecoveries:2}),/voice_eval_fallback_recoveries_exceed_attempts/);

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
  minLanguageContinuityChecks:1,
  minDistinctLanguageTags:1,
  minUsageSamples:1,
  minAcousticRecoveryChecks:1,
  minAcousticRecoveryKinds:1,
  maxProviderFailureRate:1,
  maxProviderFailureRateRegression:1,
  minGracefulFallbackRate:1,
  minDelegationCompletionRate:0,
  maxDelegationCompletionRateRegression:1,
  minInterruptionRecoveryRate:0,
  maxInterruptionRecoveryRateRegression:1,
  minLanguageContinuityRate:0,
  maxLanguageContinuityRateRegression:1,
  minAcousticRecoveryRate:0,
  maxAcousticRecoveryRateRegression:1,
  maxMedianFirstUsefulAnswerRegressionMs:10000,
  maxP95ConnectRegressionMs:10000,
  maxMedianUsageSecondsRegressionRatio:10,
  maxMedianUsageSecondsRegressionSeconds:3600
}});
assert.equal(evaluation.readyForHumanReview,true);
assert.equal(evaluation.productionSwitchAllowed,false);
assert.equal(evaluation.live.gracefulFallbackRate,1);
assert.equal(evaluation.criteria.find(item=>item.id==="graceful_fallback")?.pass,true);
const failedFallback=evaluateGptLivePromotionReadiness({pairs:[{scenarioId:"cashflow-check-01",realtime:pairs[0].realtime,live:{...pairs[0].live,fallbackAttempts:1,fallbackRecoveries:0}}],policy:{...evaluation.policy,minPairedSessions:1,minDelegationEvents:1,minInterruptionEvents:1,minLanguageContinuityChecks:1,minDistinctLanguageTags:1,minUsageSamples:1,minAcousticRecoveryChecks:1,minAcousticRecoveryKinds:1,maxProviderFailureRate:1,maxProviderFailureRateRegression:1,minGracefulFallbackRate:1,minDelegationCompletionRate:0,maxDelegationCompletionRateRegression:1,minInterruptionRecoveryRate:0,maxInterruptionRecoveryRateRegression:1,minLanguageContinuityRate:0,maxLanguageContinuityRateRegression:1,minAcousticRecoveryRate:0,maxAcousticRecoveryRateRegression:1,maxMedianFirstUsefulAnswerRegressionMs:10000,maxP95ConnectRegressionMs:10000,maxMedianUsageSecondsRegressionRatio:5,maxMedianUsageSecondsRegressionSeconds:3600}});
assert.equal(failedFallback.criteria.find(item=>item.id==="graceful_fallback")?.pass,false);
assert.equal(failedFallback.readyForHumanReview,false);

const preview=fs.readFileSync("cloudflare/src/agentic-live-preview.js","utf8");
assert.match(preview,/\/api\/agentic\/live\/preview\/evidence/);
assert.match(preview,/\/api\/agentic\/live\/preview\/evidence\/summary/);
assert.match(preview,/recordVoiceEvalEvidence/);
assert.match(preview,/readVoiceEvalEvidenceSummary/);
assert.match(preview,/rawAudioStored:false/);
assert.match(preview,/transcriptStored:false/);
assert.match(preview,/taskTextStored:false/);

const evidenceSource=fs.readFileSync("cloudflare/src/agentic-live-evidence-v274.js","utf8");
assert.match(evidenceSource,/acousticContentStored:false/);
assert.match(evidenceSource,/pronunciationChecks/);
assert.match(evidenceSource,/pronunciationPasses/);
assert.match(evidenceSource,/pronunciationTags/);

const browser=fs.readFileSync("public/js/thebe-live-evidence-v274.js","utf8");
assert.match(browser,/ThebeVoiceEval/);
assert.match(browser,/beginScenario/);
assert.match(browser,/markLanguageContinuity/);
assert.match(browser,/markAcousticRecovery/);
assert.match(browser,/sessionStorage/);
assert.match(browser,/thebe-live-state/);
assert.match(browser,/thebe-live-event/);
assert.match(browser,/thebe-live-language-continuity/);
assert.match(browser,/thebe-live-acoustic-recovery/);
assert.match(browser,/thebe-live-delegation-result/);
assert.match(browser,/session\.usage\.updated/);
assert.match(browser,/usageSeconds/);
assert.match(browser,/acousticRecoveryChecks/);
assert.match(browser,/acousticRecoveryPasses/);
assert.match(browser,/acousticRecoveryKinds/);
assert.match(browser,/fallbackAttempts/);
assert.match(browser,/fallbackRecoveries/);
assert.match(browser,/thebe-live-provider-fallback/);
assert.match(browser,/stage==="attempt"/);
assert.match(browser,/stage==="recovered"/);
assert.match(browser,/kind==="silence"\|\|kind==="noise"/);
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
assert.doesNotMatch(production,/agentic-live-evidence-v274/,"V281 evidence capture must not alter the production voice provider path");

console.log("PASS: V281 sealed voice evidence adds controlled silence/noise recovery checks without storing acoustic content");
