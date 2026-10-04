import {evaluateVoiceRuntimeCandidate} from "./voice-runtime-evaluation.js";

export const VOICE_RUNTIME_EVIDENCE_VERSION="2026-10-04.v274";
export const VOICE_RUNTIME_EVIDENCE_MINIMUMS=Object.freeze({
  sessionSamples:20,
  sessionCreateSamples:20,
  interruptionAttempts:20,
  silenceNoiseRecoveryAttempts:20,
  delegatedToolAttempts:20,
  providerFailureCases:5
});

const SOURCES=Object.freeze(new Set(["browser_eval","provider_eval","production_canary"]));
const finite=value=>Number.isFinite(Number(value));
const integer=value=>Number.isInteger(Number(value))&&Number(value)>=0?Number(value):null;
const boundedMs=value=>finite(value)&&Number(value)>=0&&Number(value)<=120000?Number(value):null;
const clean=value=>String(value??"").trim();

function validTimestamp(value){
  const parsed=Date.parse(String(value||""));
  return Number.isFinite(parsed)?new Date(parsed).toISOString():null;
}

function countPair(attempts,passes,name){
  const a=integer(attempts),p=integer(passes);
  if(a===null||p===null||p>a)throw new Error(`invalid_${name}_counts`);
  return [a,p];
}

export function normalizeVoiceRuntimeEvidenceSample(sample={}){
  const id=clean(sample.sampleId);
  if(!id)throw new Error("voice_evidence_sample_id_required");
  const runtime=clean(sample.runtime).toLowerCase();
  if(!["realtime","gpt-live"].includes(runtime))throw new Error("voice_evidence_runtime_invalid");
  const source=clean(sample.source).toLowerCase();
  if(!SOURCES.has(source))throw new Error("voice_evidence_source_invalid");
  const capturedAt=validTimestamp(sample.capturedAt);
  if(!capturedAt)throw new Error("voice_evidence_timestamp_invalid");
  const sessionCreateMs=boundedMs(sample.sessionCreateMs);
  if(sessionCreateMs===null)throw new Error("voice_evidence_session_create_ms_invalid");
  const [interruptionAttempts,interruptionPasses]=countPair(sample.interruptionAttempts,sample.interruptionPasses,"interruption");
  const [silenceNoiseRecoveryAttempts,silenceNoiseRecoveryPasses]=countPair(sample.silenceNoiseRecoveryAttempts,sample.silenceNoiseRecoveryPasses,"silence_noise_recovery");
  const [delegatedToolAttempts,delegatedToolCompletions]=countPair(sample.delegatedToolAttempts,sample.delegatedToolCompletions,"delegated_tool");
  const [providerFailureCases,gracefulProviderFailureCases]=countPair(sample.providerFailureCases,sample.gracefulProviderFailureCases,"provider_failure");
  const authorityEscapeCount=integer(sample.authorityEscapeCount);
  if(authorityEscapeCount===null)throw new Error("voice_evidence_authority_escape_count_invalid");
  return Object.freeze({
    sampleId:id,
    runtime,
    source,
    capturedAt,
    sessionCreateMs,
    interruptionAttempts,
    interruptionPasses,
    silenceNoiseRecoveryAttempts,
    silenceNoiseRecoveryPasses,
    delegatedToolAttempts,
    delegatedToolCompletions,
    providerFailureCases,
    gracefulProviderFailureCases,
    authorityEscapeCount
  });
}

function ratio(numerator,denominator){
  return denominator>0?Number((numerator/denominator).toFixed(6)):null;
}

function percentile95(values){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  const index=Math.max(0,Math.ceil(sorted.length*.95)-1);
  return sorted[index];
}

export function aggregateVoiceRuntimeEvidence(samples=[],{runtime="gpt-live"}={}){
  if(!Array.isArray(samples))throw new Error("voice_evidence_samples_array_required");
  const target=clean(runtime).toLowerCase();
  if(!["realtime","gpt-live"].includes(target))throw new Error("voice_evidence_target_runtime_invalid");
  const normalized=samples.map(normalizeVoiceRuntimeEvidenceSample).filter(sample=>sample.runtime===target);
  const ids=new Set();
  for(const sample of normalized){
    if(ids.has(sample.sampleId))throw new Error("voice_evidence_duplicate_sample_id");
    ids.add(sample.sampleId);
  }
  const totals=normalized.reduce((sum,sample)=>({
    interruptionAttempts:sum.interruptionAttempts+sample.interruptionAttempts,
    interruptionPasses:sum.interruptionPasses+sample.interruptionPasses,
    silenceNoiseRecoveryAttempts:sum.silenceNoiseRecoveryAttempts+sample.silenceNoiseRecoveryAttempts,
    silenceNoiseRecoveryPasses:sum.silenceNoiseRecoveryPasses+sample.silenceNoiseRecoveryPasses,
    delegatedToolAttempts:sum.delegatedToolAttempts+sample.delegatedToolAttempts,
    delegatedToolCompletions:sum.delegatedToolCompletions+sample.delegatedToolCompletions,
    providerFailureCases:sum.providerFailureCases+sample.providerFailureCases,
    gracefulProviderFailureCases:sum.gracefulProviderFailureCases+sample.gracefulProviderFailureCases,
    authorityEscapeCount:sum.authorityEscapeCount+sample.authorityEscapeCount
  }),{
    interruptionAttempts:0,interruptionPasses:0,
    silenceNoiseRecoveryAttempts:0,silenceNoiseRecoveryPasses:0,
    delegatedToolAttempts:0,delegatedToolCompletions:0,
    providerFailureCases:0,gracefulProviderFailureCases:0,
    authorityEscapeCount:0
  });
  const minima=VOICE_RUNTIME_EVIDENCE_MINIMUMS;
  const missing=[];
  if(normalized.length<minima.sessionSamples)missing.push("session_samples");
  if(normalized.length<minima.sessionCreateSamples)missing.push("session_create_samples");
  if(totals.interruptionAttempts<minima.interruptionAttempts)missing.push("interruption_attempts");
  if(totals.silenceNoiseRecoveryAttempts<minima.silenceNoiseRecoveryAttempts)missing.push("silence_noise_recovery_attempts");
  if(totals.delegatedToolAttempts<minima.delegatedToolAttempts)missing.push("delegated_tool_attempts");
  if(totals.providerFailureCases<minima.providerFailureCases)missing.push("provider_failure_cases");
  const metrics=Object.freeze({
    interruptionPassRate:ratio(totals.interruptionPasses,totals.interruptionAttempts),
    silenceNoiseRecoveryPassRate:ratio(totals.silenceNoiseRecoveryPasses,totals.silenceNoiseRecoveryAttempts),
    delegatedToolCompletionRate:ratio(totals.delegatedToolCompletions,totals.delegatedToolAttempts),
    gracefulProviderFailurePassRate:ratio(totals.gracefulProviderFailureCases,totals.providerFailureCases),
    sessionCreateP95Ms:percentile95(normalized.map(sample=>sample.sessionCreateMs)),
    authorityEscapeCount:totals.authorityEscapeCount
  });
  return Object.freeze({
    version:VOICE_RUNTIME_EVIDENCE_VERSION,
    runtime:target,
    ready:missing.length===0,
    sampleCount:normalized.length,
    sources:Object.freeze([...new Set(normalized.map(sample=>sample.source))].sort()),
    missing:Object.freeze(missing),
    totals:Object.freeze(totals),
    metrics
  });
}

export function qualifyVoiceRuntimeEvidence(samples=[],options={}){
  const aggregate=aggregateVoiceRuntimeEvidence(samples,options);
  if(!aggregate.ready){
    return Object.freeze({
      eligible:false,
      code:"evaluation_evidence_volume_required",
      aggregate,
      decision:null
    });
  }
  const decision=evaluateVoiceRuntimeCandidate(aggregate.metrics);
  return Object.freeze({
    eligible:decision.eligible===true,
    code:decision.code,
    aggregate,
    decision
  });
}

export function verifyVoiceRuntimeEvidencePolicy(){
  const base=(index,overrides={})=>({
    sampleId:`sample-${index}`,
    runtime:"gpt-live",
    source:"browser_eval",
    capturedAt:new Date(Date.UTC(2026,9,4,12,0,index)).toISOString(),
    sessionCreateMs:1800+index*10,
    interruptionAttempts:1,
    interruptionPasses:1,
    silenceNoiseRecoveryAttempts:1,
    silenceNoiseRecoveryPasses:1,
    delegatedToolAttempts:1,
    delegatedToolCompletions:1,
    providerFailureCases:index<5?1:0,
    gracefulProviderFailureCases:index<5?1:0,
    authorityEscapeCount:0,
    ...overrides
  });
  const insufficient=qualifyVoiceRuntimeEvidence([base(0)]);
  const failing=qualifyVoiceRuntimeEvidence(Array.from({length:20},(_,index)=>base(index,index===0?{interruptionPasses:0}:{})));
  const qualifying=qualifyVoiceRuntimeEvidence(Array.from({length:20},(_,index)=>base(index)));
  const pass=insufficient.code==="evaluation_evidence_volume_required"&&
    insufficient.eligible===false&&
    failing.code==="evaluation_threshold_failed"&&failing.eligible===false&&
    qualifying.code==="evidence_qualifies_for_review"&&qualifying.eligible===true&&
    qualifying.aggregate.sampleCount===20&&
    qualifying.aggregate.metrics.sessionCreateP95Ms===1990&&
    qualifying.aggregate.metrics.authorityEscapeCount===0;
  return Object.freeze({
    version:VOICE_RUNTIME_EVIDENCE_VERSION,
    pass,
    minimums:VOICE_RUNTIME_EVIDENCE_MINIMUMS,
    cases:Object.freeze({insufficient,failing,qualifying})
  });
}
