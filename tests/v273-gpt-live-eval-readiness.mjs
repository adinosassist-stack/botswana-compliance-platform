import assert from "node:assert/strict";
import fs from "node:fs";
import {
  DEFAULT_GPT_LIVE_EVAL_POLICY,
  gptLiveEvalReadinessSample,
  pairGptLiveEvalSamples,
  evaluateGptLivePromotionReadiness
} from "../cloudflare/src/agentic-live-eval-v273.js";
import {GPT_LIVE_MODEL,GPT_LIVE_API_URL,gptLiveMigrationStatus} from "../cloudflare/src/agentic-live-voice-v270.js";

const makePair=(index,{liveFailures=0,liveDelegationCompleted=1,liveInterruptionHandled=1}={})=>{
  const scenarioId=`scenario-${String(index).padStart(2,"0")}`;
  const realtime=gptLiveEvalReadinessSample({
    scenarioId,
    runtime:"realtime",
    connectMs:900+index,
    firstInputTranscriptMs:1200+index,
    delegationCreatedMs:1800+index,
    firstUsefulAnswerMs:3200+index,
    interruptions:1,
    interruptionsHandled:1,
    delegations:1,
    delegationsCompleted:1,
    providerFailures:0,
    sessionSeconds:90
  });
  const live=gptLiveEvalReadinessSample({
    scenarioId,
    runtime:"gpt-live",
    connectMs:700+index,
    firstInputTranscriptMs:900+index,
    delegationCreatedMs:1400+index,
    firstUsefulAnswerMs:2500+index,
    interruptions:1,
    interruptionsHandled:liveInterruptionHandled,
    interruptionsFailed:liveInterruptionHandled?0:1,
    delegations:1,
    delegationsCompleted:liveDelegationCompleted,
    delegationsFailed:liveDelegationCompleted?0:1,
    providerFailures:liveFailures,
    sessionSeconds:90
  });
  return pairGptLiveEvalSamples({scenarioId,realtime,live});
};

const healthyPairs=Array.from({length:DEFAULT_GPT_LIVE_EVAL_POLICY.minPairedSessions},(_,index)=>makePair(index));
const healthy=evaluateGptLivePromotionReadiness({pairs:healthyPairs});
assert.equal(healthy.readyForHumanReview,true);
assert.equal(healthy.decision,"ready_for_human_review");
assert.equal(healthy.productionSwitchAllowed,false,"evaluation evidence must never switch production automatically");
assert.equal(healthy.failedCriteria.length,0);
assert.ok(healthy.live.medianFirstUsefulAnswerMs<healthy.realtime.medianFirstUsefulAnswerMs);
assert.ok(healthy.live.p95ConnectMs<healthy.realtime.p95ConnectMs);
assert.equal(healthy.live.delegationCompletionRate,1);
assert.equal(healthy.live.interruptionRecoveryRate,1);

const insufficient=evaluateGptLivePromotionReadiness({pairs:healthyPairs.slice(0,3)});
assert.equal(insufficient.readyForHumanReview,false);
assert.ok(insufficient.failedCriteria.includes("paired_sessions"));

const providerRegression=evaluateGptLivePromotionReadiness({
  pairs:healthyPairs.map((_,index)=>makePair(index,{liveFailures:index<2?1:0}))
});
assert.equal(providerRegression.readyForHumanReview,false);
assert.ok(providerRegression.failedCriteria.includes("provider_failure_rate"));

const delegationRegression=evaluateGptLivePromotionReadiness({
  pairs:healthyPairs.map((_,index)=>makePair(index,{liveDelegationCompleted:index<2?0:1}))
});
assert.equal(delegationRegression.readyForHumanReview,false);
assert.ok(delegationRegression.failedCriteria.includes("delegation_completion"));

const interruptionRegression=evaluateGptLivePromotionReadiness({
  pairs:healthyPairs.map((_,index)=>makePair(index,{liveInterruptionHandled:index<3?0:1}))
});
assert.equal(interruptionRegression.readyForHumanReview,false);
assert.ok(interruptionRegression.failedCriteria.includes("interruption_recovery"));

assert.throws(()=>gptLiveEvalReadinessSample({
  scenarioId:"bad-interruption-count",
  runtime:"gpt-live",
  interruptions:1,
  interruptionsHandled:1,
  interruptionsFailed:1
}),/voice_eval_interruption_outcomes_exceed_events/);
assert.throws(()=>gptLiveEvalReadinessSample({
  scenarioId:"bad-delegation-count",
  runtime:"gpt-live",
  delegations:1,
  delegationsCompleted:1,
  delegationsFailed:1
}),/voice_eval_delegation_outcomes_exceed_events/);
assert.throws(()=>pairGptLiveEvalSamples({
  scenarioId:"one",
  realtime:gptLiveEvalReadinessSample({scenarioId:"one",runtime:"realtime"}),
  live:gptLiveEvalReadinessSample({scenarioId:"two",runtime:"gpt-live"})
}),/voice_eval_scenario_mismatch/);

assert.equal(GPT_LIVE_MODEL,"gpt-live-1");
assert.equal(GPT_LIVE_API_URL,"https://api.openai.com/v1/live/sessions");
const migration=gptLiveMigrationStatus({THEBE_GPT_LIVE_PREVIEW_ENABLED:"1",THEBE_LIVE_VOICE_RUNTIME:"gpt_live_preview"});
assert.equal(migration.productionSwitchAllowed,false);

const production=fs.readFileSync("cloudflare/src/agentic-live-voice.js","utf8");
assert.match(production,/gpt-realtime-2\.1/);
assert.match(production,/\/v1\/realtime\/calls/);
assert.doesNotMatch(production,/agentic-live-eval-v273/,"V273 must remain evaluation-only and outside the production voice path");

console.log("PASS: V273 GPT-Live paired evaluation readiness holds production behind human review");
