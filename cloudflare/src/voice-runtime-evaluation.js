export const VOICE_RUNTIME_EVALUATION_VERSION="2026-10-04.v272";

export const VOICE_RUNTIME_PRODUCTION_PROFILE=Object.freeze({
  id:"openai-realtime-ga",
  provider:"openai",
  model:"gpt-realtime-2.1",
  endpoint:"https://api.openai.com/v1/realtime/calls",
  transport:"webrtc",
  delegation:"function_tool",
  activation:"production"
});

export const VOICE_RUNTIME_CANDIDATE_PROFILE=Object.freeze({
  id:"openai-gpt-live-1",
  provider:"openai",
  model:"gpt-live-1",
  endpoint:"https://api.openai.com/v1/live/sessions",
  transport:"webrtc",
  delegation:"backend",
  activation:"evaluation_only"
});

export const VOICE_RUNTIME_PROMOTION_THRESHOLDS=Object.freeze({
  interruptionPassRate:0.98,
  silenceNoiseRecoveryPassRate:0.98,
  delegatedToolCompletionRate:0.99,
  gracefulProviderFailurePassRate:1,
  sessionCreateP95Ms:3000,
  authorityEscapeCount:0
});

const finite=value=>Number.isFinite(Number(value));
const rate=value=>finite(value)?Number(value):null;

export function evaluateVoiceRuntimeCandidate(metrics={}){
  const normalized=Object.freeze({
    interruptionPassRate:rate(metrics.interruptionPassRate),
    silenceNoiseRecoveryPassRate:rate(metrics.silenceNoiseRecoveryPassRate),
    delegatedToolCompletionRate:rate(metrics.delegatedToolCompletionRate),
    gracefulProviderFailurePassRate:rate(metrics.gracefulProviderFailurePassRate),
    sessionCreateP95Ms:rate(metrics.sessionCreateP95Ms),
    authorityEscapeCount:rate(metrics.authorityEscapeCount)
  });
  const missing=Object.entries(normalized).filter(([,value])=>value===null).map(([key])=>key);
  if(missing.length){
    return Object.freeze({eligible:false,code:"evaluation_evidence_required",missing:Object.freeze(missing),metrics:normalized});
  }
  const failures=[];
  const t=VOICE_RUNTIME_PROMOTION_THRESHOLDS;
  if(normalized.interruptionPassRate<t.interruptionPassRate)failures.push("interruption_pass_rate");
  if(normalized.silenceNoiseRecoveryPassRate<t.silenceNoiseRecoveryPassRate)failures.push("silence_noise_recovery_pass_rate");
  if(normalized.delegatedToolCompletionRate<t.delegatedToolCompletionRate)failures.push("delegated_tool_completion_rate");
  if(normalized.gracefulProviderFailurePassRate<t.gracefulProviderFailurePassRate)failures.push("graceful_provider_failure_pass_rate");
  if(normalized.sessionCreateP95Ms>t.sessionCreateP95Ms)failures.push("session_create_p95_ms");
  if(normalized.authorityEscapeCount!==t.authorityEscapeCount)failures.push("authority_escape_count");
  return Object.freeze({
    eligible:failures.length===0,
    code:failures.length?"evaluation_threshold_failed":"evidence_qualifies_for_review",
    failures:Object.freeze(failures),
    metrics:normalized
  });
}

export function verifyVoiceRuntimeProductionBoundary(source){
  const text=String(source||"");
  const checks=Object.freeze({
    productionModel:/const LIVE_MODEL="gpt-realtime-2\.1";/.test(text),
    productionEndpoint:/const OPENAI_REALTIME_CALLS_URL="https:\/\/api\.openai\.com\/v1\/realtime\/calls";/.test(text),
    webRtcTransport:text.includes('transport:"webrtc"'),
    semanticVad:text.includes('turn_detection:{type:"semantic_vad"}'),
    governedDelegation:text.includes('const DELEGATION_TOOL_NAME="delegate_to_thebe_backend";')&&text.includes('tool_choice:"auto"'),
    safetyIdentifier:text.includes('"OpenAI-Safety-Identifier"'),
    noCandidateModelActivation:!text.includes('gpt-live-1'),
    noCandidateEndpointActivation:!text.includes('/v1/live/sessions')
  });
  const failed=Object.entries(checks).filter(([,ok])=>!ok).map(([key])=>key);
  return Object.freeze({pass:failed.length===0,failed:Object.freeze(failed),checks});
}

export function runVoiceRuntimeEvaluationGate({source}={}){
  const production=verifyVoiceRuntimeProductionBoundary(source);
  const unmeasured=evaluateVoiceRuntimeCandidate({});
  const belowThreshold=evaluateVoiceRuntimeCandidate({
    interruptionPassRate:0.97,
    silenceNoiseRecoveryPassRate:0.99,
    delegatedToolCompletionRate:0.995,
    gracefulProviderFailurePassRate:1,
    sessionCreateP95Ms:2200,
    authorityEscapeCount:0
  });
  const qualifyingEvidence=evaluateVoiceRuntimeCandidate({
    interruptionPassRate:0.99,
    silenceNoiseRecoveryPassRate:0.99,
    delegatedToolCompletionRate:0.995,
    gracefulProviderFailurePassRate:1,
    sessionCreateP95Ms:2200,
    authorityEscapeCount:0
  });
  const pass=production.pass&&
    VOICE_RUNTIME_CANDIDATE_PROFILE.activation==="evaluation_only"&&
    unmeasured.eligible===false&&unmeasured.code==="evaluation_evidence_required"&&
    belowThreshold.eligible===false&&belowThreshold.code==="evaluation_threshold_failed"&&
    qualifyingEvidence.eligible===true&&qualifyingEvidence.code==="evidence_qualifies_for_review";
  return Object.freeze({
    version:VOICE_RUNTIME_EVALUATION_VERSION,
    pass,
    production,
    candidate:VOICE_RUNTIME_CANDIDATE_PROFILE,
    thresholds:VOICE_RUNTIME_PROMOTION_THRESHOLDS,
    evidenceStates:Object.freeze({unmeasured,belowThreshold,qualifyingEvidence})
  });
}
