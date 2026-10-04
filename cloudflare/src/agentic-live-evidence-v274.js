import {appendSealedAuditEvent} from "./audit-lineage-writer.js";
import {
  gptLiveEvalReadinessSample,
  pairGptLiveEvalSamples,
  evaluateGptLivePromotionReadiness,
  THEBE_GPT_LIVE_EVAL_VERSION
} from "./agentic-live-eval-v273.js";
import {VOICE_RUNTIME_EVIDENCE_MINIMUMS} from "./voice-runtime-evidence.js";
import {VOICE_RUNTIME_PROMOTION_THRESHOLDS} from "./voice-runtime-evaluation.js";

export const THEBE_LIVE_EVIDENCE_VERSION="2026-10-04.voice-evidence-v277";
export const VOICE_EVIDENCE_EVENT="THEBE_LIVE_EVAL_EVIDENCE_RECORDED";
export const VOICE_EVIDENCE_MAX_ROWS=200;
export const VOICE_PROMOTION_QUALIFICATION_VERSION="2026-10-04.voice-promotion-hold-v277";

const cleanText=(value,max=160)=>String(value??"")
  .replace(/[\u0000-\u001f\u007f]/g," ")
  .replace(/\s+/g," ")
  .trim()
  .slice(0,max);
const cleanId=(value,max=160)=>cleanText(value,max).replace(/[^A-Za-z0-9._:-]/g,"_");
const toInt=(value,max=100000)=>{
  const parsed=Number(value);
  return Number.isFinite(parsed)&&parsed>=0?Math.min(max,Math.trunc(parsed)):0;
};
const toMetric=(value,max=60*60*1000)=>{
  const parsed=Number(value);
  return Number.isFinite(parsed)&&parsed>=0?Math.min(max,parsed):0;
};

export function normalizeVoiceEvalEvidence(body={}){
  if(!body||typeof body!=="object"||Array.isArray(body))throw new Error("voice_eval_evidence_object_required");
  const scenarioId=cleanId(body.scenarioId,120);
  const sessionId=cleanId(body.sessionId,240);
  const runtime=String(body.runtime||"").trim().toLowerCase();
  if(!scenarioId)throw new Error("voice_eval_scenario_id_required");
  if(!sessionId)throw new Error("voice_eval_session_id_required");
  if(!["realtime","gpt-live"].includes(runtime))throw new Error("invalid_voice_eval_runtime");

  const sample=gptLiveEvalReadinessSample({
    scenarioId,
    runtime,
    connectMs:toMetric(body.connectMs),
    firstInputTranscriptMs:toMetric(body.firstInputTranscriptMs),
    delegationCreatedMs:toMetric(body.delegationCreatedMs),
    firstUsefulAnswerMs:toMetric(body.firstUsefulAnswerMs),
    interruptions:toInt(body.interruptions),
    interruptionsHandled:toInt(body.interruptionsHandled),
    interruptionsFailed:toInt(body.interruptionsFailed),
    delegations:toInt(body.delegations),
    delegationsCompleted:toInt(body.delegationsCompleted),
    delegationsFailed:toInt(body.delegationsFailed),
    providerFailures:toInt(body.providerFailures),
    sessionSeconds:toMetric(body.sessionSeconds,24*60*60)
  });

  return Object.freeze({
    version:THEBE_LIVE_EVIDENCE_VERSION,
    evalVersion:THEBE_GPT_LIVE_EVAL_VERSION,
    sessionId,
    recordedAt:new Date().toISOString(),
    sample
  });
}

export async function recordVoiceEvalEvidence({env,auth,body}={}){
  if(!env?.DB)throw new Error("voice_eval_database_unavailable");
  if(!auth?.tenant_id||!auth?.user_id)throw new Error("voice_eval_identity_required");
  const evidence=normalizeVoiceEvalEvidence(body);
  const sealed=await appendSealedAuditEvent(env,{
    tenantId:auth.tenant_id,
    actorUserId:auth.user_id,
    eventType:VOICE_EVIDENCE_EVENT,
    entityType:"thebe_live_eval",
    entityId:evidence.sessionId,
    eventData:evidence,
    writeSource:"voice_eval_v274"
  });
  return Object.freeze({
    ok:true,
    version:THEBE_LIVE_EVIDENCE_VERSION,
    seq:sealed.seq,
    scenarioId:evidence.sample.scenarioId,
    runtime:evidence.sample.runtime,
    productionSwitchAllowed:false
  });
}

function parseEventData(value){
  if(value&&typeof value==="object")return value;
  try{return JSON.parse(String(value||"{}"))}catch{return null}
}

export function pairVoiceEvalEvidenceRows(rows=[]){
  const scenarios=new Map();
  for(const row of Array.isArray(rows)?rows:[]){
    const data=parseEventData(row?.event_data??row?.eventData);
    const sample=data?.sample;
    if(!sample?.scenarioId||!["realtime","gpt-live"].includes(sample?.runtime))continue;
    const scenarioId=cleanId(sample.scenarioId,120);
    if(!scenarioId)continue;
    const bucket=scenarios.get(scenarioId)||{};
    if(!bucket[sample.runtime])bucket[sample.runtime]=sample;
    scenarios.set(scenarioId,bucket);
  }
  const pairs=[];
  for(const [scenarioId,bucket] of scenarios){
    if(!bucket.realtime||!bucket["gpt-live"])continue;
    try{
      pairs.push(pairGptLiveEvalSamples({
        scenarioId,
        realtime:gptLiveEvalReadinessSample({...bucket.realtime,scenarioId,runtime:"realtime"}),
        live:gptLiveEvalReadinessSample({...bucket["gpt-live"],scenarioId,runtime:"gpt-live"})
      }));
    }catch{}
  }
  return Object.freeze(pairs);
}

export function voiceRuntimePromotionQualificationHold(){
  return Object.freeze({
    version:VOICE_PROMOTION_QUALIFICATION_VERSION,
    eligibleForReview:false,
    eligible:false,
    code:"strict_evidence_capture_required",
    decision:"hold",
    productionSwitchAllowed:false,
    automaticPromotion:false,
    automaticFallback:false,
    evidenceMinimums:VOICE_RUNTIME_EVIDENCE_MINIMUMS,
    thresholds:VOICE_RUNTIME_PROMOTION_THRESHOLDS,
    missingStrictEvidence:Object.freeze([
      "silence_noise_recovery_outcomes",
      "graceful_provider_failure_outcomes",
      "authority_escape_count"
    ]),
    reason:"The V274 paired browser recorder does not capture every field required by the strict runtime-promotion evidence contract. Paired comparison readiness is not production-promotion readiness."
  });
}

export async function readVoiceEvalEvidenceSummary({env,auth,limit=VOICE_EVIDENCE_MAX_ROWS}={}){
  if(!env?.DB)throw new Error("voice_eval_database_unavailable");
  if(!auth?.tenant_id)throw new Error("voice_eval_identity_required");
  const safeLimit=Math.max(1,Math.min(VOICE_EVIDENCE_MAX_ROWS,toInt(limit,VOICE_EVIDENCE_MAX_ROWS)||VOICE_EVIDENCE_MAX_ROWS));
  const result=await env.DB.prepare(`SELECT event_data,tenant_seq,occurred_at
    FROM audit_events
    WHERE tenant_id=? AND event_type=?
    ORDER BY tenant_seq DESC
    LIMIT ?`)
    .bind(auth.tenant_id,VOICE_EVIDENCE_EVENT,safeLimit)
    .all();
  const rows=Array.isArray(result?.results)?result.results:[];
  const pairs=pairVoiceEvalEvidenceRows(rows);
  const comparisonEvaluation=evaluateGptLivePromotionReadiness({pairs});
  const promotionQualification=voiceRuntimePromotionQualificationHold();
  return Object.freeze({
    ok:true,
    version:THEBE_LIVE_EVIDENCE_VERSION,
    evidenceRows:rows.length,
    pairedScenarios:pairs.length,
    evaluation:comparisonEvaluation,
    comparisonEvaluation,
    promotionQualification,
    privacy:Object.freeze({rawAudioStored:false,transcriptStored:false,taskTextStored:false}),
    productionSwitchAllowed:false
  });
}
