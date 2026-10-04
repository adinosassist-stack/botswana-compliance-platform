import {gptLiveEvalSample} from "./agentic-live-voice-v270.js";

export const THEBE_GPT_LIVE_EVAL_VERSION="2026-10-04.gpt-live-eval-v279";

// These are Thebe rollout criteria, not vendor performance guarantees. Passing them only
// permits a human production review; it never authorizes a runtime switch by itself.
export const DEFAULT_GPT_LIVE_EVAL_POLICY=Object.freeze({
  minPairedSessions:20,
  minDelegationEvents:10,
  minInterruptionEvents:5,
  minLanguageContinuityChecks:6,
  minDistinctLanguageTags:2,
  minUsageSamples:10,
  maxProviderFailureRate:0.05,
  maxProviderFailureRateRegression:0.01,
  minDelegationCompletionRate:0.95,
  maxDelegationCompletionRateRegression:0.02,
  minInterruptionRecoveryRate:0.90,
  maxInterruptionRecoveryRateRegression:0.05,
  minLanguageContinuityRate:0.95,
  maxLanguageContinuityRateRegression:0.05,
  maxMedianFirstUsefulAnswerRegressionMs:150,
  maxP95ConnectRegressionMs:200,
  maxMedianUsageSecondsRegressionRatio:0.25,
  maxMedianUsageSecondsRegressionSeconds:15
});

const cleanText=(value,max=160)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const boundedNumber=(value,{min=0,max=Number.MAX_SAFE_INTEGER,fallback=0}={})=>{
  const parsed=Number(value);
  return Number.isFinite(parsed)&&parsed>=min&&parsed<=max?parsed:fallback;
};
const count=value=>Math.trunc(boundedNumber(value,{max:100000}));
const rate=(ok,total)=>total>0?ok/total:null;
const round=value=>Number(Number(value||0).toFixed(4));
const median=values=>{
  const sorted=values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!sorted.length)return null;
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
};
const percentile=(values,p)=>{
  const sorted=values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!sorted.length)return null;
  const rank=Math.ceil((p/100)*sorted.length)-1;
  return sorted[Math.max(0,Math.min(sorted.length-1,rank))];
};
const normalizeLanguageTag=value=>{
  const raw=cleanText(value,32);
  if(!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(raw))return "";
  return raw.split("-").map((part,index)=>index===0?part.toLowerCase():(/^[A-Za-z]{2}$/.test(part)?part.toUpperCase():part.toLowerCase())).join("-");
};
const normalizeLanguageTags=value=>Object.freeze([...new Set((Array.isArray(value)?value:[]).map(normalizeLanguageTag).filter(Boolean))].slice(0,12));

export function gptLiveEvalReadinessSample({
  scenarioId,
  runtime,
  connectMs=0,
  firstInputTranscriptMs=0,
  delegationCreatedMs=0,
  firstUsefulAnswerMs=0,
  interruptions=0,
  interruptionsHandled=0,
  interruptionsFailed=0,
  delegations=0,
  delegationsCompleted=0,
  delegationsFailed=0,
  providerFailures=0,
  sessionSeconds=0,
  usageSeconds=0,
  languageContinuityChecks=0,
  languageContinuityPasses=0,
  languageTags=[]
}={}){
  const safeScenarioId=cleanText(scenarioId,120);
  if(!safeScenarioId)throw new Error("voice_eval_scenario_id_required");
  const base=gptLiveEvalSample({
    runtime,
    connectMs,
    firstInputTranscriptMs,
    delegationCreatedMs,
    firstUsefulAnswerMs,
    interruptions,
    delegations,
    providerFailures,
    sessionSeconds
  });
  const handled=count(interruptionsHandled);
  const interruptionFailures=count(interruptionsFailed);
  const completed=count(delegationsCompleted);
  const delegationFailures=count(delegationsFailed);
  const continuityChecks=count(languageContinuityChecks);
  const continuityPasses=count(languageContinuityPasses);
  if(handled+interruptionFailures>base.interruptions)throw new Error("voice_eval_interruption_outcomes_exceed_events");
  if(completed+delegationFailures>base.delegations)throw new Error("voice_eval_delegation_outcomes_exceed_events");
  if(continuityPasses>continuityChecks)throw new Error("voice_eval_language_passes_exceed_checks");
  return Object.freeze({
    ...base,
    scenarioId:safeScenarioId,
    interruptionsHandled:handled,
    interruptionsFailed:interruptionFailures,
    delegationsCompleted:completed,
    delegationsFailed:delegationFailures,
    usageSeconds:boundedNumber(usageSeconds,{max:24*60*60}),
    languageContinuityChecks:continuityChecks,
    languageContinuityPasses:continuityPasses,
    languageTags:normalizeLanguageTags(languageTags)
  });
}

export function pairGptLiveEvalSamples({scenarioId,realtime,live}={}){
  const safeScenarioId=cleanText(scenarioId,120);
  if(!safeScenarioId)throw new Error("voice_eval_scenario_id_required");
  if(realtime?.runtime!=="realtime"||live?.runtime!=="gpt-live")throw new Error("voice_eval_runtime_pair_required");
  if(realtime?.scenarioId!==safeScenarioId||live?.scenarioId!==safeScenarioId)throw new Error("voice_eval_scenario_mismatch");
  return Object.freeze({scenarioId:safeScenarioId,realtime,live});
}

function summarizeRuntime(pairs,key){
  const rows=pairs.map(pair=>pair[key]);
  const languageSet=new Set();
  const usageValues=[];
  const totals=rows.reduce((acc,row)=>{
    acc.providerFailures+=row.providerFailures;
    acc.delegations+=row.delegations;
    acc.delegationsCompleted+=row.delegationsCompleted;
    acc.delegationsFailed+=row.delegationsFailed;
    acc.interruptions+=row.interruptions;
    acc.interruptionsHandled+=row.interruptionsHandled;
    acc.interruptionsFailed+=row.interruptionsFailed;
    acc.sessionSeconds+=row.sessionSeconds;
    acc.languageContinuityChecks+=row.languageContinuityChecks||0;
    acc.languageContinuityPasses+=row.languageContinuityPasses||0;
    for(const tag of row.languageTags||[])languageSet.add(tag);
    if(Number(row.usageSeconds)>0)usageValues.push(Number(row.usageSeconds));
    return acc;
  },{
    providerFailures:0,
    delegations:0,
    delegationsCompleted:0,
    delegationsFailed:0,
    interruptions:0,
    interruptionsHandled:0,
    interruptionsFailed:0,
    sessionSeconds:0,
    languageContinuityChecks:0,
    languageContinuityPasses:0
  });
  return Object.freeze({
    sessions:rows.length,
    medianConnectMs:median(rows.map(row=>row.connectMs)),
    p95ConnectMs:percentile(rows.map(row=>row.connectMs),95),
    medianFirstUsefulAnswerMs:median(rows.map(row=>row.firstUsefulAnswerMs)),
    p95FirstUsefulAnswerMs:percentile(rows.map(row=>row.firstUsefulAnswerMs),95),
    providerFailures:totals.providerFailures,
    providerFailureRate:round(rate(totals.providerFailures,rows.length)??0),
    delegations:totals.delegations,
    delegationsCompleted:totals.delegationsCompleted,
    delegationsFailed:totals.delegationsFailed,
    delegationCompletionRate:rate(totals.delegationsCompleted,totals.delegations),
    interruptions:totals.interruptions,
    interruptionsHandled:totals.interruptionsHandled,
    interruptionsFailed:totals.interruptionsFailed,
    interruptionRecoveryRate:rate(totals.interruptionsHandled,totals.interruptions),
    languageContinuityChecks:totals.languageContinuityChecks,
    languageContinuityPasses:totals.languageContinuityPasses,
    languageContinuityRate:rate(totals.languageContinuityPasses,totals.languageContinuityChecks),
    languageTags:Object.freeze([...languageSet].sort()),
    usageSamples:usageValues.length,
    medianUsageSeconds:median(usageValues),
    p95UsageSeconds:percentile(usageValues,95),
    sessionSeconds:totals.sessionSeconds
  });
}

function normalizePolicy(policy={}){
  const merged={...DEFAULT_GPT_LIVE_EVAL_POLICY,...(policy&&typeof policy==="object"?policy:{})};
  return Object.freeze({
    minPairedSessions:count(merged.minPairedSessions),
    minDelegationEvents:count(merged.minDelegationEvents),
    minInterruptionEvents:count(merged.minInterruptionEvents),
    minLanguageContinuityChecks:count(merged.minLanguageContinuityChecks),
    minDistinctLanguageTags:count(merged.minDistinctLanguageTags),
    minUsageSamples:count(merged.minUsageSamples),
    maxProviderFailureRate:boundedNumber(merged.maxProviderFailureRate,{max:1,fallback:DEFAULT_GPT_LIVE_EVAL_POLICY.maxProviderFailureRate}),
    maxProviderFailureRateRegression:boundedNumber(merged.maxProviderFailureRateRegression,{max:1,fallback:DEFAULT_GPT_LIVE_EVAL_POLICY.maxProviderFailureRateRegression}),
    minDelegationCompletionRate:boundedNumber(merged.minDelegationCompletionRate,{max:1,fallback:DEFAULT_GPT_LIVE_EVAL_POLICY.minDelegationCompletionRate}),
    maxDelegationCompletionRateRegression:boundedNumber(merged.maxDelegationCompletionRateRegression,{max:1,fallback:DEFAULT_GPT_LIVE_EVAL_POLICY.maxDelegationCompletionRateRegression}),
    minInterruptionRecoveryRate:boundedNumber(merged.minInterruptionRecoveryRate,{max:1,fallback:DEFAULT_GPT_LIVE_EVAL_POLICY.minInterruptionRecoveryRate}),
    maxInterruptionRecoveryRateRegression:boundedNumber(merged.maxInterruptionRecoveryRateRegression,{max:1,fallback:DEFAULT_GPT_LIVE_EVAL_POLICY.maxInterruptionRecoveryRateRegression}),
    minLanguageContinuityRate:boundedNumber(merged.minLanguageContinuityRate,{max:1,fallback:DEFAULT_GPT_LIVE_EVAL_POLICY.minLanguageContinuityRate}),
    maxLanguageContinuityRateRegression:boundedNumber(merged.maxLanguageContinuityRateRegression,{max:1,fallback:DEFAULT_GPT_LIVE_EVAL_POLICY.maxLanguageContinuityRateRegression}),
    maxMedianFirstUsefulAnswerRegressionMs:boundedNumber(merged.maxMedianFirstUsefulAnswerRegressionMs,{max:60000,fallback:DEFAULT_GPT_LIVE_EVAL_POLICY.maxMedianFirstUsefulAnswerRegressionMs}),
    maxP95ConnectRegressionMs:boundedNumber(merged.maxP95ConnectRegressionMs,{max:60000,fallback:DEFAULT_GPT_LIVE_EVAL_POLICY.maxP95ConnectRegressionMs}),
    maxMedianUsageSecondsRegressionRatio:boundedNumber(merged.maxMedianUsageSecondsRegressionRatio,{max:5,fallback:DEFAULT_GPT_LIVE_EVAL_POLICY.maxMedianUsageSecondsRegressionRatio}),
    maxMedianUsageSecondsRegressionSeconds:boundedNumber(merged.maxMedianUsageSecondsRegressionSeconds,{max:3600,fallback:DEFAULT_GPT_LIVE_EVAL_POLICY.maxMedianUsageSecondsRegressionSeconds})
  });
}

export function evaluateGptLivePromotionReadiness({pairs=[],policy={}}={}){
  const safePairs=Array.isArray(pairs)?pairs:[];
  for(const pair of safePairs){
    if(!pair?.scenarioId||pair?.realtime?.runtime!=="realtime"||pair?.live?.runtime!=="gpt-live")throw new Error("invalid_voice_eval_pair");
  }
  const resolvedPolicy=normalizePolicy(policy);
  const realtime=summarizeRuntime(safePairs,"realtime");
  const live=summarizeRuntime(safePairs,"live");
  const rtDelegationRate=realtime.delegationCompletionRate??0;
  const liveDelegationRate=live.delegationCompletionRate??0;
  const rtInterruptionRate=realtime.interruptionRecoveryRate??0;
  const liveInterruptionRate=live.interruptionRecoveryRate??0;
  const rtLanguageRate=realtime.languageContinuityRate??0;
  const liveLanguageRate=live.languageContinuityRate??0;
  const usageBaseline=realtime.medianUsageSeconds;
  const usageCandidate=live.medianUsageSeconds;
  const usageBudget=usageBaseline==null?null:usageBaseline*(1+resolvedPolicy.maxMedianUsageSecondsRegressionRatio)+resolvedPolicy.maxMedianUsageSecondsRegressionSeconds;
  const criteria=Object.freeze([
    Object.freeze({id:"paired_sessions",pass:safePairs.length>=resolvedPolicy.minPairedSessions,actual:safePairs.length,required:resolvedPolicy.minPairedSessions}),
    Object.freeze({id:"delegation_evidence",pass:live.delegations>=resolvedPolicy.minDelegationEvents,actual:live.delegations,required:resolvedPolicy.minDelegationEvents}),
    Object.freeze({id:"interruption_evidence",pass:live.interruptions>=resolvedPolicy.minInterruptionEvents,actual:live.interruptions,required:resolvedPolicy.minInterruptionEvents}),
    Object.freeze({id:"language_continuity_evidence",pass:realtime.languageContinuityChecks>=resolvedPolicy.minLanguageContinuityChecks&&live.languageContinuityChecks>=resolvedPolicy.minLanguageContinuityChecks&&realtime.languageTags.length>=resolvedPolicy.minDistinctLanguageTags&&live.languageTags.length>=resolvedPolicy.minDistinctLanguageTags,actual:live.languageContinuityChecks,baseline:realtime.languageContinuityChecks,required:resolvedPolicy.minLanguageContinuityChecks,distinctTags:live.languageTags.length}),
    Object.freeze({id:"usage_evidence",pass:realtime.usageSamples>=resolvedPolicy.minUsageSamples&&live.usageSamples>=resolvedPolicy.minUsageSamples,actual:live.usageSamples,baseline:realtime.usageSamples,required:resolvedPolicy.minUsageSamples}),
    Object.freeze({id:"provider_failure_rate",pass:live.providerFailureRate<=resolvedPolicy.maxProviderFailureRate&&live.providerFailureRate<=realtime.providerFailureRate+resolvedPolicy.maxProviderFailureRateRegression,actual:live.providerFailureRate,baseline:realtime.providerFailureRate}),
    Object.freeze({id:"delegation_completion",pass:liveDelegationRate>=resolvedPolicy.minDelegationCompletionRate&&liveDelegationRate>=rtDelegationRate-resolvedPolicy.maxDelegationCompletionRateRegression,actual:round(liveDelegationRate),baseline:round(rtDelegationRate)}),
    Object.freeze({id:"interruption_recovery",pass:liveInterruptionRate>=resolvedPolicy.minInterruptionRecoveryRate&&liveInterruptionRate>=rtInterruptionRate-resolvedPolicy.maxInterruptionRecoveryRateRegression,actual:round(liveInterruptionRate),baseline:round(rtInterruptionRate)}),
    Object.freeze({id:"language_continuity",pass:liveLanguageRate>=resolvedPolicy.minLanguageContinuityRate&&liveLanguageRate>=rtLanguageRate-resolvedPolicy.maxLanguageContinuityRateRegression,actual:round(liveLanguageRate),baseline:round(rtLanguageRate)}),
    Object.freeze({id:"median_first_useful_answer",pass:(live.medianFirstUsefulAnswerMs??Infinity)-(realtime.medianFirstUsefulAnswerMs??0)<=resolvedPolicy.maxMedianFirstUsefulAnswerRegressionMs,actual:live.medianFirstUsefulAnswerMs,baseline:realtime.medianFirstUsefulAnswerMs}),
    Object.freeze({id:"p95_connect",pass:(live.p95ConnectMs??Infinity)-(realtime.p95ConnectMs??0)<=resolvedPolicy.maxP95ConnectRegressionMs,actual:live.p95ConnectMs,baseline:realtime.p95ConnectMs}),
    Object.freeze({id:"usage_efficiency",pass:usageBaseline!=null&&usageCandidate!=null&&usageCandidate<=usageBudget,actual:usageCandidate,baseline:usageBaseline,maximum:usageBudget})
  ]);
  const failedCriteria=criteria.filter(item=>!item.pass).map(item=>item.id);
  return Object.freeze({
    version:THEBE_GPT_LIVE_EVAL_VERSION,
    policy:resolvedPolicy,
    pairedSessions:safePairs.length,
    realtime,
    live,
    criteria,
    failedCriteria:Object.freeze(failedCriteria),
    readyForHumanReview:failedCriteria.length===0,
    productionSwitchAllowed:false,
    decision:failedCriteria.length===0?"ready_for_human_review":"hold"
  });
}
