import {authenticate,roleAllowed,originAllowed,csrfAllowed} from "./agentic-authority-core.js";
import {appendSealedAuditEvent} from "./audit-lineage-writer.js";
import {
  GPT_LIVE_MODEL,
  GPT_LIVE_API_URL,
  gptLivePreviewEnabled,
  gptLiveCreateRequest,
  gptLiveMigrationStatus
} from "./agentic-live-voice-v270.js";
import {
  recordVoiceEvalEvidence,
  readVoiceEvalEvidenceSummary
} from "./agentic-live-evidence-v274.js";

export const THEBE_GPT_LIVE_PREVIEW_TRANSPORT_VERSION="2026-10-03.v272";

const MAX_BODY_BYTES=96*1024;
const MAX_SDP_CHARS=72*1024;
const DEFAULT_TIMEOUT_MS=12000;
const REALTIME_FALLBACK_PATH="/api/agentic/live/session";
const PREVIEW_DELEGATION_PATH="/api/agentic/live/preview/delegation";
const PREVIEW_EVIDENCE_PATH="/api/agentic/live/preview/evidence";
const PREVIEW_EVIDENCE_SUMMARY_PATH="/api/agentic/live/preview/evidence/summary";

const json=(body,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff"
  }
});

const envTrue=value=>["1","true","on","yes"].includes(String(value??"").trim().toLowerCase());
const cleanText=(value,max=500)=>String(value??"")
  .replace(/[\u0000-\u001f\u007f]/g," ")
  .replace(/\s+/g," ")
  .trim()
  .slice(0,max);

function boundedTimeout(value){
  const parsed=Number(value);
  return Number.isInteger(parsed)&&parsed>=3000&&parsed<=30000?parsed:DEFAULT_TIMEOUT_MS;
}

function runtimeEnabled(env){return String(env?.AGENT_RUNTIME_ENABLED||"1")!=="0"}
function killSwitchActive(env){return envTrue(env?.AGENT_RUNTIME_KILL_SWITCH)}
function apiConfigured(env){return String(env?.OPENAI_API_KEY||"").trim().length>20}
function liveVoiceEnabled(env){return envTrue(env?.THEBE_LIVE_VOICE_ENABLED)}

export function gptLivePreviewGate(env={}){
  if(!liveVoiceEnabled(env))return Object.freeze({allowed:false,code:"live_voice_disabled"});
  if(!runtimeEnabled(env))return Object.freeze({allowed:false,code:"agent_runtime_disabled"});
  if(killSwitchActive(env))return Object.freeze({allowed:false,code:"agent_runtime_kill_switch"});
  if(!gptLivePreviewEnabled(env))return Object.freeze({allowed:false,code:"gpt_live_preview_disabled"});
  if(!apiConfigured(env))return Object.freeze({allowed:false,code:"openai_not_configured"});
  return Object.freeze({allowed:true,code:"gpt_live_preview_ready"});
}

async function readBoundedJson(request){
  const encoding=String(request.headers.get("content-encoding")||"").trim().toLowerCase();
  if(encoding&&encoding!=="identity")throw new Error("unsupported_content_encoding");
  const declared=Number(request.headers.get("content-length")||0);
  if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES)throw new Error("request_too_large");
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)throw new Error("request_too_large");
  if(!raw)return {};
  try{return JSON.parse(raw)}catch{throw new Error("invalid_json")}
}

function bodyErrorStatus(error){
  if(error?.message==="request_too_large")return 413;
  if(error?.message==="unsupported_content_encoding")return 415;
  return 400;
}

function previewInstructions(){
  return [
    "You are Thebe, the GPT-Live preview voice interface for Thebe Desk.",
    "Speak clearly, naturally and concisely.",
    "Answer ordinary general questions directly when no private workspace data or business action is required.",
    "For current company facts, finance, compliance, operations, customer work, business analysis or any request requiring Thebe Desk data or action, delegate to the client application.",
    "The client application owns authentication, permissions, confirmations, business records, governed tools, audit records and task state.",
    "Never claim a business action succeeded unless the client application returns a verified result.",
    "Never independently approve or execute payments, statutory filings, signatures, employment termination, financing acceptance or accounting journal posting.",
    "During this preview, client delegation supports analysis and business-data review only. Do not claim that voice created or prepared an internal task.",
    "If the application reports that approval is required, preserve that requirement in the spoken response."
  ].join(" ");
}

export function gptLivePreviewStatus(env={}){
  const gate=gptLivePreviewGate(env);
  const migration=gptLiveMigrationStatus(env);
  return Object.freeze({
    enabled:migration.previewEnabled,
    configured:apiConfigured(env),
    sessionCreationAllowed:gate.allowed,
    gateCode:gate.code,
    version:THEBE_GPT_LIVE_PREVIEW_TRANSPORT_VERSION,
    migrationVersion:migration.version,
    runtime:"gpt-live",
    model:GPT_LIVE_MODEL,
    transport:"webrtc",
    delegation:"client",
    delegatedIntent:"analyze",
    productionSwitchAllowed:false,
    evaluation:Object.freeze({
      evidencePath:PREVIEW_EVIDENCE_PATH,
      summaryPath:PREVIEW_EVIDENCE_SUMMARY_PATH,
      rawAudioStored:false,
      transcriptStored:false,
      taskTextStored:false
    }),
    fallback:Object.freeze({runtime:"realtime",path:REALTIME_FALLBACK_PATH})
  });
}

function safeProviderCode(payload){
  return cleanText(payload?.error?.code||payload?.code||"upstream_rejected",120)||"upstream_rejected";
}

async function previewAudit(env,auth,eventType,entityId,detail={}){
  if(!env?.DB||!auth?.tenant_id||!auth?.user_id)return false;
  try{
    const result=await appendSealedAuditEvent(env,{
      tenantId:auth.tenant_id,
      actorUserId:auth.user_id,
      eventType,
      entityType:"thebe_live_session",
      entityId:entityId||null,
      eventData:detail,
      writeSource:"gpt_live_preview"
    });
    return result?.ok===true;
  }catch{return false}
}

export async function createGptLivePreviewSession({request,env,auth=null}){
  const gate=gptLivePreviewGate(env);
  if(!gate.allowed)return json({
    error:gate.code,
    runtime:"gpt-live",
    fallback:{runtime:"realtime",path:REALTIME_FALLBACK_PATH}
  },503);

  let body;
  try{body=await readBoundedJson(request)}
  catch(error){return json({error:error.message},bodyErrorStatus(error))}

  const sdp=String(body?.sdp||"");
  if(!sdp||sdp.length>MAX_SDP_CHARS||!/^v=0(?:\r?\n|$)/.test(sdp))return json({error:"invalid_webrtc_offer"},400);

  let providerRequest;
  try{
    providerRequest=gptLiveCreateRequest({
      sdp,
      instructions:previewInstructions(),
      voice:cleanText(body?.voice,80)||"marin"
    });
  }catch(error){return json({error:cleanText(error?.message,160)||"invalid_preview_request"},400)}

  const requestId=crypto.randomUUID();
  if(auth&&env?.DB){
    const requested=await previewAudit(env,auth,"THEBE_LIVE_SESSION_REQUESTED",requestId,{
      runtime:"gpt-live-preview",model:GPT_LIVE_MODEL,transport:"webrtc",delegation:"client",voiceAuthority:"none"
    });
    if(!requested)return json({error:"gpt_live_preview_audit_unavailable",runtime:"gpt-live",fallback:{runtime:"realtime",path:REALTIME_FALLBACK_PATH}},503);
  }

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort("gpt_live_preview_timeout"),boundedTimeout(env?.THEBE_LIVE_VOICE_UPSTREAM_TIMEOUT_MS));
  let upstream;
  try{
    upstream=await fetch(providerRequest.url,{
      method:"POST",
      headers:{
        "authorization":`Bearer ${String(env.OPENAI_API_KEY).trim()}`,
        "content-type":"application/json",
        "accept":"application/json"
      },
      body:JSON.stringify(providerRequest.body),
      signal:controller.signal
    });
  }catch(error){
    clearTimeout(timeout);
    const code=error?.name==="AbortError"?"gpt_live_preview_timeout":"gpt_live_preview_unavailable";
    if(auth&&env?.DB)await previewAudit(env,auth,"THEBE_LIVE_SESSION_FAILED",requestId,{runtime:"gpt-live-preview",code});
    return json({error:code,runtime:"gpt-live",fallback:{runtime:"realtime",path:REALTIME_FALLBACK_PATH}},error?.name==="AbortError"?504:502);
  }
  clearTimeout(timeout);

  let payload={};
  try{payload=await upstream.json()}catch{}
  if(!upstream.ok){
    const providerCode=safeProviderCode(payload);
    if(auth&&env?.DB)await previewAudit(env,auth,"THEBE_LIVE_SESSION_FAILED",requestId,{runtime:"gpt-live-preview",code:"upstream_rejected",status:upstream.status,providerCode});
    return json({
      error:"gpt_live_preview_upstream_failed",
      providerCode,
      runtime:"gpt-live",
      fallback:{runtime:"realtime",path:REALTIME_FALLBACK_PATH}
    },502);
  }

  const sessionId=cleanText(payload?.id||payload?.session?.id,240);
  const answerSdp=String(payload?.transport?.sdp||"");
  if(!sessionId||!answerSdp||answerSdp.length>MAX_SDP_CHARS||!/^v=0(?:\r?\n|$)/.test(answerSdp)){
    if(auth&&env?.DB)await previewAudit(env,auth,"THEBE_LIVE_SESSION_FAILED",requestId,{runtime:"gpt-live-preview",code:"invalid_upstream_response"});
    return json({error:"gpt_live_preview_invalid_response",runtime:"gpt-live",fallback:{runtime:"realtime",path:REALTIME_FALLBACK_PATH}},502);
  }

  if(auth&&env?.DB){
    const started=await previewAudit(env,auth,"THEBE_LIVE_SESSION_STARTED",sessionId,{
      requestId,runtime:"gpt-live-preview",model:GPT_LIVE_MODEL,transport:"webrtc",delegation:"client"
    });
    if(!started)return json({error:"gpt_live_preview_audit_unavailable",runtime:"gpt-live",fallback:{runtime:"realtime",path:REALTIME_FALLBACK_PATH}},503);
  }

  return json({
    ok:true,
    version:THEBE_GPT_LIVE_PREVIEW_TRANSPORT_VERSION,
    runtime:"gpt-live",
    model:GPT_LIVE_MODEL,
    session:{id:sessionId},
    transport:{type:"webrtc",sdp:answerSdp},
    delegation:{type:"client",intent:"analyze"},
    productionSwitchAllowed:false,
    fallback:{runtime:"realtime",path:REALTIME_FALLBACK_PATH}
  });
}

async function verifiedPreviewDelegation(delegateRequest,request){
  if(typeof delegateRequest!=="function")return json({error:"gpt_live_preview_delegation_unavailable",verified:false},503);
  let response;
  try{response=await delegateRequest(request)}catch{return json({error:"gpt_live_preview_delegation_unavailable",verified:false},502)}
  let body=null;
  try{body=await response.clone().json()}catch{}
  if(!body||typeof body!=="object"||Array.isArray(body))return json({error:"gpt_live_preview_delegation_invalid_response",verified:false},502);
  const content=cleanText(body?.content,1500);
  const authority=body?.authority&&typeof body.authority==="object"&&!Array.isArray(body.authority)?body.authority:null;
  const verified=response.ok&&!!content&&authority?.executionPerformed===false&&authority?.taskPrepared!==true&&String(body?.mode||"analyze")!=="prepare_internal_task";
  return json({
    ...body,
    verified,
    verification:{source:"governed_live_backend",runtime:"gpt-live-preview",executionPerformed:authority?.executionPerformed===true}
  },response.status);
}

async function recordPreviewEvidence(request,env,auth){
  let body;
  try{body=await readBoundedJson(request)}
  catch(error){return json({error:error.message},bodyErrorStatus(error))}
  try{return json(await recordVoiceEvalEvidence({env,auth,body}),201)}
  catch(error){return json({error:cleanText(error?.message,160)||"voice_eval_evidence_failed"},400)}
}

async function previewEvidenceSummary(env,auth){
  try{return json(await readVoiceEvalEvidenceSummary({env,auth}))}
  catch(error){return json({error:cleanText(error?.message,160)||"voice_eval_summary_failed"},503)}
}

export async function handleAgenticLivePreviewRequest({request,logicalPath,env,delegateRequest=null}){
  const path=String(logicalPath||new URL(request.url).pathname);
  if(!path.startsWith("/api/agentic/live/preview"))return null;

  const auth=await authenticate(request,env);
  if(!auth)return json({error:"unauthenticated"},401);
  if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);

  if(request.method!=="GET"){
    if(!originAllowed(request,env))return json({error:"origin_failed"},403);
    if(!csrfAllowed(request,auth))return json({error:"csrf_failed"},403);
  }

  if(path==="/api/agentic/live/preview/status"&&request.method==="GET")return json(gptLivePreviewStatus(env));
  if(path==="/api/agentic/live/preview/session"&&request.method==="POST")return createGptLivePreviewSession({request,env,auth});
  if(path===PREVIEW_DELEGATION_PATH&&request.method==="POST")return verifiedPreviewDelegation(delegateRequest,request);
  if(path===PREVIEW_EVIDENCE_PATH&&request.method==="POST")return recordPreviewEvidence(request,env,auth);
  if(path===PREVIEW_EVIDENCE_SUMMARY_PATH&&request.method==="GET")return previewEvidenceSummary(env,auth);
  return json({error:"not_found"},404);
}

export const __gptLivePreviewTransportTest=Object.freeze({
  MAX_BODY_BYTES,
  MAX_SDP_CHARS,
  DEFAULT_TIMEOUT_MS,
  REALTIME_FALLBACK_PATH,
  PREVIEW_DELEGATION_PATH,
  PREVIEW_EVIDENCE_PATH,
  PREVIEW_EVIDENCE_SUMMARY_PATH,
  previewInstructions,
  safeProviderCode,
  boundedTimeout,
  previewAudit,
  verifiedPreviewDelegation,
  recordPreviewEvidence,
  previewEvidenceSummary
});
