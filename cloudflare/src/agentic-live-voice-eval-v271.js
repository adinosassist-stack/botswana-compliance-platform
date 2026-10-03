export const THEBE_VOICE_EVAL_VERSION="2026-10-03.voice-eval-v271";

const finite=value=>Number.isFinite(Number(value))?Number(value):null;
const bool=value=>value===true?1:0;
const round=(value,digits=3)=>Number(Number(value||0).toFixed(digits));

function percentile(values,p){
  const list=values.map(finite).filter(value=>value!==null).sort((a,b)=>a-b);
  if(!list.length)return null;
  const index=Math.min(list.length-1,Math.max(0,Math.ceil((p/100)*list.length)-1));
  return list[index];
}

function rate(rows,key){
  if(!rows.length)return 0;
  return round(rows.reduce((sum,row)=>sum+bool(row?.[key]),0)/rows.length);
}

export function summarizeVoiceRuntime(samples=[],runtime){
  const rows=samples.filter(row=>row?.runtime===runtime);
  const costs=rows.map(row=>finite(row?.estimatedCostUsd)).filter(value=>value!==null&&value>=0);
  return Object.freeze({
    runtime,
    samples:rows.length,
    firstUsefulP50Ms:percentile(rows.map(row=>row?.firstUsefulMs),50),
    firstUsefulP95Ms:percentile(rows.map(row=>row?.firstUsefulMs),95),
    interruptionP95Ms:percentile(rows.map(row=>row?.interruptionStopMs),95),
    taskSuccessRate:rate(rows,"taskSuccess"),
    silenceRecoveryRate:rate(rows,"silenceRecovery"),
    multilingualContinuityRate:rate(rows,"multilingualContinuity"),
    gracefulProviderFailureRate:rate(rows,"gracefulProviderFailure"),
    averageEstimatedCostUsd:costs.length?round(costs.reduce((sum,value)=>sum+value,0)/costs.length,6):null
  });
}

function noWorse(candidate,baseline,key,tolerance=0){
  const a=finite(candidate?.[key]),b=finite(baseline?.[key]);
  if(a===null||b===null)return false;
  return a>=b-tolerance;
}

function latencyNoWorse(candidate,baseline,key,maxRatio){
  const a=finite(candidate?.[key]),b=finite(baseline?.[key]);
  if(a===null||b===null||b<=0)return false;
  return a<=b*maxRatio;
}

export function compareVoiceRuntimes(samples=[],options={}){
  const minimumSamples=Math.max(3,Number(options.minimumSamples)||8);
  const latencyRatio=Math.max(1,Number(options.maxLatencyRegressionRatio)||1.1);
  const interruptionCeilingMs=Math.max(100,Number(options.interruptionCeilingMs)||1200);
  const baseline=summarizeVoiceRuntime(samples,"realtime");
  const candidate=summarizeVoiceRuntime(samples,"gpt_live");
  const checks=Object.freeze({
    enoughSamples:baseline.samples>=minimumSamples&&candidate.samples>=minimumSamples,
    taskSuccess:noWorse(candidate,baseline,"taskSuccessRate"),
    silenceRecovery:noWorse(candidate,baseline,"silenceRecoveryRate"),
    multilingualContinuity:noWorse(candidate,baseline,"multilingualContinuityRate"),
    gracefulProviderFailure:noWorse(candidate,baseline,"gracefulProviderFailureRate"),
    firstUsefulLatency:latencyNoWorse(candidate,baseline,"firstUsefulP50Ms",latencyRatio),
    interruptionLatency:latencyNoWorse(candidate,baseline,"interruptionP95Ms",latencyRatio)&&finite(candidate.interruptionP95Ms)!==null&&candidate.interruptionP95Ms<=interruptionCeilingMs,
    costMeasured:finite(baseline.averageEstimatedCostUsd)!==null&&finite(candidate.averageEstimatedCostUsd)!==null
  });
  const eligibleForReview=Object.values(checks).every(Boolean);
  return Object.freeze({
    version:THEBE_VOICE_EVAL_VERSION,
    baseline,
    candidate,
    checks,
    eligibleForReview,
    productionSwitchAllowed:false,
    note:eligibleForReview
      ?"Measured candidate is eligible for human review; production cutover still requires explicit release approval."
      :"Candidate remains preview-only until every measured evaluation gate passes."
  });
}
