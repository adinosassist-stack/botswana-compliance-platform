import {
  authenticate,roleAllowed,originAllowed,csrfAllowed,safeFirst
} from "./agentic-authority-core.js";

export const THEBE_LIVE_VOICE_VERSION="2026-09-20.realtime-ga-task-prepare-debug-v3";

const OPENAI_REALTIME_CALLS_URL="https://api.openai.com/v1/realtime/calls";
const LIVE_MODEL="gpt-realtime-2.1";
const DELEGATION_TOOL_NAME="delegate_to_thebe_backend";
const MAX_SESSION_BODY_BYTES=96*1024;
const MAX_SDP_CHARS=72*1024;
const MAX_DELEGATION_TEXT=2400;
const MAX_DELEGATION_ID=240;
const MAX_TASK_TITLE=160;
const MAX_TASK_DESCRIPTION=1200;
const VOICE_INTENT_ANALYZE="analyze";
const VOICE_INTENT_PREPARE_INTERNAL_TASK="prepare_internal_task";
const DEFAULT_MAX_SESSION_SECONDS=600;
const DEFAULT_UPSTREAM_TIMEOUT_MS=12000;
const DEFAULT_MAX_USER_STARTS_PER_HOUR=4;
const DEFAULT_FAILURE_CIRCUIT_THRESHOLD=3;
const DEFAULT_MARKETING_MAX_SESSION_SECONDS=60;
const DEFAULT_MARKETING_MAX_STARTS_PER_HOUR=6;

const json=(body,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff"
  }
});

function envTrue(value){
  return ["1","true","on","yes"].includes(String(value??"").trim().toLowerCase());
}

function cleanText(value,max=500){
  return String(value??"")
    .replace(/[\u0000-\u001f\u007f]/g," ")
    .replace(/\s+/g," ")
    .trim()
    .slice(0,max);
}

function boundedInt(value,{min,max,fallback}){
  const parsed=Number(value);
  if(!Number.isInteger(parsed)||parsed<min||parsed>max)return fallback;
  return parsed;
}

function boundedStarts(value){return boundedInt(value,{min:1,max:60,fallback:6})}
function boundedUserStarts(value){return boundedInt(value,{min:1,max:30,fallback:DEFAULT_MAX_USER_STARTS_PER_HOUR})}
function boundedSessionSeconds(value){return boundedInt(value,{min:60,max:1800,fallback:DEFAULT_MAX_SESSION_SECONDS})}
function boundedUpstreamTimeoutMs(value){return boundedInt(value,{min:3000,max:30000,fallback:DEFAULT_UPSTREAM_TIMEOUT_MS})}
function boundedFailureThreshold(value){return boundedInt(value,{min:1,max:20,fallback:DEFAULT_FAILURE_CIRCUIT_THRESHOLD})}
function boundedMarketingSessionSeconds(value){return boundedInt(value,{min:30,max:120,fallback:DEFAULT_MARKETING_MAX_SESSION_SECONDS})}
function boundedMarketingStarts(value){return boundedInt(value,{min:1,max:20,fallback:DEFAULT_MARKETING_MAX_STARTS_PER_HOUR})}

async function sha256Hex(value){
  const bytes=new TextEncoder().encode(String(value??""));
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

async function readBoundedJson(request){
  const encoding=String(request.headers.get("content-encoding")||"").trim().toLowerCase();
  if(encoding&&encoding!=="identity")throw new Error("unsupported_content_encoding");
  const declared=Number(request.headers.get("content-length")||0);
  if(Number.isFinite(declared)&&declared>MAX_SESSION_BODY_BYTES)throw new Error("request_too_large");
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>MAX_SESSION_BODY_BYTES)throw new Error("request_too_large");
  if(!raw)return {};
  try{return JSON.parse(raw)}catch{throw new Error("invalid_json")}
}

function bodyErrorStatus(error){
  if(error?.message==="request_too_large")return 413;
  if(error?.message==="unsupported_content_encoding")return 415;
  return 400;
}

function validPreparedTaskBackendPayload(value){
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  if(value.ok!==true)return false;
  const request=value.request;
  if(!request||typeof request!=="object"||Array.isArray(request))return false;
  return cleanText(request.id,160).length>0&&String(request.status||"").trim()==="prepared";
}

function validGovernedPlanPayload(value){
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  if(value.ok!==true)return false;
  const run=value.run;
  if(!run||typeof run!=="object"||Array.isArray(run))return false;
  return cleanText(run.id,160).length>0&&String(run.status||"").trim()==="completed"&&Array.isArray(value.proposals);
}

function liveEnabled(env){
  return envTrue(env?.THEBE_LIVE_VOICE_ENABLED);
}

function liveConfigured(env){
  return String(env?.OPENAI_API_KEY||"").trim().length>20;
}

function runtimeEnabled(env){
  return String(env?.AGENT_RUNTIME_ENABLED||"1")!=="0";
}

function killSwitchActive(env){
  return envTrue(env?.AGENT_RUNTIME_KILL_SWITCH);
}

function liveAllowed(env){
  return liveEnabled(env)&&liveConfigured(env)&&runtimeEnabled(env)&&!killSwitchActive(env);
}
function marketingVoiceEnabled(env){
  return liveEnabled(env)&&envTrue(env?.THEBE_MARKETING_VOICE_ENABLED);
}
function marketingVoiceAllowed(env){
  return marketingVoiceEnabled(env)&&liveConfigured(env)&&runtimeEnabled(env)&&!killSwitchActive(env);
}

function instructions(){
  return [
    "You are Thebe, the live voice interface for Thebe Desk.",
    "Speak calmly, concisely and professionally. Prefer short spoken answers and ask one focused question when the user's intent is unclear.",
    "You are the conversational voice layer, not an independent business agent.",
    "For current company facts, finance, compliance, operations, customer work, business analysis, or any request that needs Thebe Desk data or tools, call delegate_to_thebe_backend instead of inventing an answer.",
    "If and only if the user explicitly asks to create, add or record an internal task, call delegate_to_thebe_backend with intent prepare_internal_task and a concise structured task. Do not use task preparation for vague follow-up, analysis or suggestions.",
    "Preparing an internal task is not approval and is not execution. The owner must separately approve the prepared request in Thebe Desk before guarded execution can be attempted.",
    "The application backend owns business rules, permissions, tenant scope, approvals, tools, audit records and execution.",
    "Never claim a business action succeeded unless a verified backend result explicitly says it succeeded.",
    "Never approve, authorize or execute payments, statutory filings, signatures, employment termination, financing acceptance or accounting journal posting.",
    "Never approve or execute an internal task from voice. Voice may only request a governed task draft.",
    "A spoken interruption changes the conversation but does not prove that backend work was cancelled or that a prepared task draft disappeared.",
    "When a delegated tool result arrives, summarize it naturally and preserve any approval, uncertainty, prepared-draft or no-execution warning in that result."
  ].join(" ");
}

function delegationTool(){
  return Object.freeze({
    type:"function",
    name:DELEGATION_TOOL_NAME,
    description:"Use this tool whenever the user asks for current Thebe Desk business data, finance, compliance, operations, customer work, business analysis, or governed business actions. The backend may analyze and propose next steps, but high-risk execution remains human-controlled.",
    parameters:{
      type:"object",
      properties:{
        request:{
          type:"string",
          description:"The user's business request, stated clearly and completely."
        },
        intent:{
          type:"string",
          enum:[VOICE_INTENT_ANALYZE,VOICE_INTENT_PREPARE_INTERNAL_TASK],
          description:"Use analyze for normal governed business work. Use prepare_internal_task only when the user explicitly asks to create, add or record an internal task."
        },
        task:{
          type:"object",
          description:"Structured internal-task draft. Supply only with prepare_internal_task.",
          properties:{
            title:{type:"string",description:"Short task title."},
            description:{type:"string",description:"Optional task detail."},
            priority:{type:"string",enum:["high","medium","low"],description:"Task priority."},
            dueAt:{type:"string",description:"Optional ISO date or date-time."}
          },
          required:["title"],
          additionalProperties:false
        }
      },
      required:["request"],
      additionalProperties:false
    }
  });
}

function realtimeSessionConfig(){
  return {
    type:"realtime",
    model:LIVE_MODEL,
    output_modalities:["audio"],
    audio:{
      input:{turn_detection:{type:"semantic_vad"}},
      output:{voice:"marin"}
    },
    instructions:instructions(),
    tools:[delegationTool()],
    tool_choice:"auto"
  };
}

function marketingInstructions(){
  return [
    "You are Thebe, the public voice guide for Thebe Desk, Botswana SME compliance software.",
    "This is a short marketing demonstration on the public website. You have no access to any visitor account, workspace, company data, finance records, employees, evidence, documents, tools or governed actions.",
    "Explain Thebe Desk clearly and conversationally. Keep most answers under 35 seconds unless the visitor asks for detail.",
    "Thebe Desk helps Botswana SMEs keep recurring compliance work visible across CIPA company records, BURS tax obligations, employment compliance, business and industrial licences, tender readiness, inspections and evidence.",
    "Key product features include Employer Shield, Regulatory Intelligence, Continuous Control Assurance, Remediation and Inspection Readiness, Tender Control, Compliance Passport, Thebe AI, and accounting and financial intelligence.",
    "Thebe AI provides grounded decision support inside an authenticated workspace: management briefs, risk explanations and practical next actions while approvals, evidence and human judgement remain in control.",
    "Current published plans are Monitor at P149 per month, Protect at P349 per month, Control at P699 per month, and Network at P1,299 per month. New workspaces start with a 14-day trial.",
    "Do not invent legal, tax or regulatory conclusions. Explain product capabilities rather than giving professional legal or tax advice.",
    "If asked to inspect a business, perform an action, create a task, access records, or make a decision using private data, explain that public sample mode cannot do that and invite the visitor to sign in or start a workspace.",
    "Do not call tools. Do not claim you accessed private data. Do not claim an action was executed.",
    "If the visitor asks what makes Thebe Desk different, emphasize continuous risk detection, controlled action, evidence of compliance, Botswana-specific workflows, and an owner-focused management view."
  ].join(" ");
}

function marketingRealtimeSessionConfig(){
  return {
    type:"realtime",
    model:LIVE_MODEL,
    output_modalities:["audio"],
    audio:{
      input:{turn_detection:{type:"semantic_vad"}},
      output:{voice:"marin"}
    },
    instructions:marketingInstructions(),
    tools:[],
    tool_choice:"none"
  };
}

async function marketingSafetyIdentifier(request){
  const ip=cleanText((request.headers.get("cf-connecting-ip")||request.headers.get("x-forwarded-for")||"").split(",")[0],120);
  const ua=cleanText(request.headers.get("user-agent"),200);
  return sha256Hex(`marketing:${ip||"unknown"}:${ua||"unknown"}`);
}

async function consumeMarketingStart(request,env){
  const cache=globalThis.caches?.default;
  if(!cache)return Object.freeze({allowed:false,code:"marketing_rate_limit_unavailable"});
  const fingerprint=await marketingSafetyIdentifier(request);
  const hour=new Date().toISOString().slice(0,13);
  const key=new Request(`https://thebedesk-rate.invalid/marketing-voice/${fingerprint}/${hour}`);
  let count=0;
  try{
    const existing=await cache.match(key);
    if(existing){
      const body=await existing.json();
      count=Math.max(0,Number(body?.count)||0);
    }
  }catch{}
  const max=boundedMarketingStarts(env?.THEBE_MARKETING_VOICE_MAX_STARTS_PER_HOUR);
  if(count>=max)return Object.freeze({allowed:false,code:"marketing_session_rate_limited",retryAfterSeconds:3600,count,max});
  const next=count+1;
  try{
    await cache.put(key,new Response(JSON.stringify({count:next}),{
      headers:{"content-type":"application/json","cache-control":"public,max-age=3700"}
    }));
  }catch{
    return Object.freeze({allowed:false,code:"marketing_rate_limit_unavailable"});
  }
  return Object.freeze({allowed:true,code:"marketing_voice_ready",count:next,max,fingerprint});
}

function marketingStatus(env){
  const allowed=marketingVoiceAllowed(env);
  return json({
    enabled:marketingVoiceEnabled(env),
    configured:liveConfigured(env),
    sessionCreationAllowed:allowed,
    gateCode:allowed?"marketing_voice_ready":"marketing_voice_unavailable",
    version:THEBE_LIVE_VOICE_VERSION,
    model:LIVE_MODEL,
    transport:"webrtc",
    mode:"marketing_sample",
    maxSessionSeconds:boundedMarketingSessionSeconds(env?.THEBE_MARKETING_VOICE_MAX_SESSION_SECONDS),
    maxStartsPerHour:boundedMarketingStarts(env?.THEBE_MARKETING_VOICE_MAX_STARTS_PER_HOUR),
    transcriptPolicy:{rawAudioStoredByThebe:false,liveTranscriptServerStorage:false},
    authority:{workspaceDataAccess:false,toolsAvailable:false,executionAuthority:false}
  });
}

async function createMarketingSession({request,env}){
  if(!marketingVoiceAllowed(env))return json({error:"marketing_voice_unavailable"},503);
  let body;
  try{body=await readBoundedJson(request)}
  catch(error){return json({error:error.message},bodyErrorStatus(error))}
  const sdp=String(body?.sdp||"");
  if(!sdp||sdp.length>MAX_SDP_CHARS||!/^v=0(?:\r?\n|$)/.test(sdp))return json({error:"invalid_webrtc_offer"},400);

  const rate=await consumeMarketingStart(request,env);
  if(!rate.allowed){
    const status=rate.code==="marketing_session_rate_limited"?429:503;
    return json({error:rate.code,...(rate.retryAfterSeconds?{retryAfterSeconds:rate.retryAfterSeconds}:{})},status);
  }

  const upstreamTimeoutMs=boundedUpstreamTimeoutMs(env?.THEBE_LIVE_VOICE_UPSTREAM_TIMEOUT_MS);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort("marketing_live_session_timeout"),upstreamTimeoutMs);
  const form=new FormData();
  form.set("sdp",sdp);
  form.set("session",JSON.stringify(marketingRealtimeSessionConfig()));
  let upstream;
  try{
    upstream=await fetch(OPENAI_REALTIME_CALLS_URL,{
      method:"POST",
      headers:{
        "authorization":`Bearer ${String(env.OPENAI_API_KEY).trim()}`,
        "accept":"application/sdp",
        "OpenAI-Safety-Identifier":rate.fingerprint
      },
      signal:controller.signal,
      body:form
    });
  }catch{
    return json({error:"marketing_live_session_create_failed",code:controller.signal.aborted?"upstream_timeout":"upstream_unreachable"},502);
  }finally{
    clearTimeout(timeout);
  }
  if(!upstream.ok){
    const providerRaw=String(await upstream.text()).slice(0,4096);
    let providerCode=null,providerType=null;
    try{
      const parsed=JSON.parse(providerRaw);
      providerCode=cleanText(parsed?.error?.code,120)||null;
      providerType=cleanText(parsed?.error?.type,120)||null;
    }catch{}
    return json({error:"marketing_live_session_create_failed",code:"upstream_rejected",upstreamStatus:upstream.status,providerCode,providerType},502);
  }

  const answerSdp=String(await upstream.text());
  const location=String(upstream.headers.get("location")||"");
  const sessionId=cleanText(location.split("/").filter(Boolean).pop(),240)||crypto.randomUUID();
  if(!answerSdp||answerSdp.length>MAX_SDP_CHARS||!/^v=0(?:\r?\n|$)/.test(answerSdp))return json({error:"marketing_live_session_invalid_response"},502);

  return json({
    ok:true,
    version:THEBE_LIVE_VOICE_VERSION,
    model:LIVE_MODEL,
    mode:"marketing_sample",
    session:{id:sessionId},
    transport:{type:"webrtc",sdp:answerSdp},
    delegation:{type:"none"},
    limits:{
      maxSessionSeconds:boundedMarketingSessionSeconds(env?.THEBE_MARKETING_VOICE_MAX_SESSION_SECONDS),
      maxStartsPerHour:rate.max
    },
    authority:{workspaceDataAccess:false,toolsAvailable:false,executionAuthority:false}
  },201);
}

async function audit(env,auth,eventType,entityId,detail={}){
  await env.DB.prepare(`INSERT INTO audit_events(tenant_id,actor_user_id,event_type,entity_type,entity_id,event_data)
    VALUES(?,?,?,?,?,?)`).bind(
      auth.tenant_id,
      auth.user_id,
      eventType,
      "thebe_live_session",
      entityId||null,
      JSON.stringify(detail)
    ).run();
}

async function recentLiveTelemetry(env,tenantId,userId){
  const row=await safeFirst(env,`SELECT
      SUM(CASE WHEN event_type='THEBE_LIVE_SESSION_REQUESTED' AND created_at>=datetime('now','-1 hour') THEN 1 ELSE 0 END) tenant_starts,
      SUM(CASE WHEN actor_user_id=? AND event_type='THEBE_LIVE_SESSION_REQUESTED' AND created_at>=datetime('now','-1 hour') THEN 1 ELSE 0 END) user_starts,
      SUM(CASE WHEN event_type='THEBE_LIVE_SESSION_FAILED' AND created_at>=datetime('now','-10 minutes') THEN 1 ELSE 0 END) recent_failures
    FROM audit_events WHERE tenant_id=? AND entity_type='thebe_live_session'`,[userId,tenantId]);
  return Object.freeze({
    tenantStarts:Number(row?.tenant_starts||0),
    userStarts:Number(row?.user_starts||0),
    recentFailures:Number(row?.recent_failures||0)
  });
}

function liveGate(env,telemetry={}){
  if(!liveEnabled(env))return Object.freeze({allowed:false,code:"live_voice_disabled"});
  if(!liveConfigured(env))return Object.freeze({allowed:false,code:"live_voice_not_configured"});
  if(!runtimeEnabled(env))return Object.freeze({allowed:false,code:"agent_runtime_disabled"});
  if(killSwitchActive(env))return Object.freeze({allowed:false,code:"agent_runtime_kill_switch_active"});
  if(Number(telemetry.tenantStarts||0)>=boundedStarts(env?.THEBE_LIVE_VOICE_MAX_STARTS_PER_HOUR))return Object.freeze({allowed:false,code:"tenant_session_rate_limited"});
  if(Number(telemetry.userStarts||0)>=boundedUserStarts(env?.THEBE_LIVE_VOICE_MAX_USER_STARTS_PER_HOUR))return Object.freeze({allowed:false,code:"user_session_rate_limited"});
  if(Number(telemetry.recentFailures||0)>=boundedFailureThreshold(env?.THEBE_LIVE_VOICE_FAILURE_CIRCUIT_THRESHOLD))return Object.freeze({allowed:false,code:"live_failure_circuit_open"});
  return Object.freeze({allowed:true,code:"live_voice_ready"});
}

async function status(env,auth){
  const telemetry=await recentLiveTelemetry(env,auth.tenant_id,auth.user_id);
  const maxStarts=boundedStarts(env?.THEBE_LIVE_VOICE_MAX_STARTS_PER_HOUR);
  const maxUserStarts=boundedUserStarts(env?.THEBE_LIVE_VOICE_MAX_USER_STARTS_PER_HOUR);
  const failureThreshold=boundedFailureThreshold(env?.THEBE_LIVE_VOICE_FAILURE_CIRCUIT_THRESHOLD);
  const gate=liveGate(env,telemetry);
  return json({
    enabled:liveEnabled(env),
    configured:liveConfigured(env),
    sessionCreationAllowed:gate.allowed,
    gateCode:gate.code,
    version:THEBE_LIVE_VOICE_VERSION,
    model:LIVE_MODEL,
    transport:"webrtc",
    delegation:"function_tool",
    phase:"phase0_foundation",
    runtimeEnabled:runtimeEnabled(env),
    runtimeKillSwitch:killSwitchActive(env),
    startsThisHour:telemetry.tenantStarts,
    userStartsThisHour:telemetry.userStarts,
    recentFailures10m:telemetry.recentFailures,
    maxStartsPerHour:maxStarts,
    maxUserStartsPerHour:maxUserStarts,
    failureCircuitThreshold:failureThreshold,
    maxSessionSeconds:boundedSessionSeconds(env?.THEBE_LIVE_VOICE_MAX_SESSION_SECONDS),
    upstreamTimeoutMs:boundedUpstreamTimeoutMs(env?.THEBE_LIVE_VOICE_UPSTREAM_TIMEOUT_MS),
    secureContextRequired:true,
    transcriptPolicy:{
      rawAudioStoredByThebe:false,
      liveTranscriptServerStorage:false,
      delegatedBusinessRequestMayBecomeAgenticRunGoal:true
    },
    authority:{
      voiceMayGrantPermissions:false,
      voiceMayBypassRuntimeGuard:false,
      voiceMayPrepareInternalTask:true,
      voiceMayApproveInternalTask:false,
      voiceMayExecuteInternalTask:false,
      taskPreparationRequiresExistingGrant:true,
      taskExecutionRequiresSeparateOwnerApproval:true,
      delegatedBusinessWork:"governed_thebe_backend",
      highRiskActions:"human_only"
    }
  });
}

async function createSession({request,env,auth}){
  const telemetry=await recentLiveTelemetry(env,auth.tenant_id,auth.user_id);
  const gate=liveGate(env,telemetry);
  if(!gate.allowed){
    const rateLimited=gate.code==="tenant_session_rate_limited"||gate.code==="user_session_rate_limited";
    return json({error:gate.code,...(rateLimited?{retryAfterSeconds:3600}:{})},rateLimited?429:503);
  }

  let body;
  try{body=await readBoundedJson(request)}
  catch(error){return json({error:error.message},bodyErrorStatus(error))}

  const sdp=String(body?.sdp||"");
  if(!sdp||sdp.length>MAX_SDP_CHARS||!/^v=0(?:\r?\n|$)/.test(sdp)){
    return json({error:"invalid_webrtc_offer"},400);
  }

  const requestId=crypto.randomUUID();
  await audit(env,auth,"THEBE_LIVE_SESSION_REQUESTED",requestId,{
    model:LIVE_MODEL,
    transport:"webrtc",
    delegation:"function_tool",
    voiceAuthority:"none"
  });

  let upstream;
  const upstreamTimeoutMs=boundedUpstreamTimeoutMs(env?.THEBE_LIVE_VOICE_UPSTREAM_TIMEOUT_MS);
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort("live_session_timeout"),upstreamTimeoutMs);
  const safetyIdentifier=await sha256Hex(`${auth.tenant_id}:${auth.user_id}`);
  const form=new FormData();
  form.set("sdp",sdp);
  form.set("session",JSON.stringify(realtimeSessionConfig()));
  try{
    upstream=await fetch(OPENAI_REALTIME_CALLS_URL,{
      method:"POST",
      headers:{
        "authorization":`Bearer ${String(env.OPENAI_API_KEY).trim()}`,
        "accept":"application/sdp",
        "OpenAI-Safety-Identifier":safetyIdentifier
      },
      signal:controller.signal,
      body:form
    });
  }catch(error){
    const code=controller.signal.aborted?"upstream_timeout":"upstream_unreachable";
    await audit(env,auth,"THEBE_LIVE_SESSION_FAILED",requestId,{code,upstreamTimeoutMs});
    return json({error:"live_session_create_failed",code},502);
  }finally{
    clearTimeout(timeout);
  }

  if(!upstream.ok){
    const providerRaw=String(await upstream.text()).slice(0,4096);
    let providerCode=null,providerType=null;
    try{
      const parsed=JSON.parse(providerRaw);
      providerCode=cleanText(parsed?.error?.code,120)||null;
      providerType=cleanText(parsed?.error?.type,120)||null;
    }catch{}
    await audit(env,auth,"THEBE_LIVE_SESSION_FAILED",requestId,{
      code:"upstream_rejected",
      status:upstream.status,
      providerCode,
      providerType
    });
    return json({
      error:"live_session_create_failed",
      code:"upstream_rejected",
      upstreamStatus:upstream.status,
      providerCode,
      providerType
    },502);
  }

  const answerSdp=String(await upstream.text());
  const location=String(upstream.headers.get("location")||"");
  const sessionId=cleanText(location.split("/").filter(Boolean).pop(),240)||requestId;
  if(!answerSdp||answerSdp.length>MAX_SDP_CHARS||!/^v=0(?:\r?\n|$)/.test(answerSdp)){
    await audit(env,auth,"THEBE_LIVE_SESSION_FAILED",requestId,{code:"invalid_upstream_response"});
    return json({error:"live_session_invalid_response"},502);
  }

  await audit(env,auth,"THEBE_LIVE_SESSION_STARTED",sessionId,{
    requestId,
    model:LIVE_MODEL,
    transport:"webrtc",
    delegation:"function_tool"
  });

  return json({
    ok:true,
    version:THEBE_LIVE_VOICE_VERSION,
    model:LIVE_MODEL,
    session:{id:sessionId},
    transport:{type:"webrtc",sdp:answerSdp},
    delegation:{type:"function_tool",name:DELEGATION_TOOL_NAME},
    limits:{
      maxSessionSeconds:boundedSessionSeconds(env?.THEBE_LIVE_VOICE_MAX_SESSION_SECONDS),
      maxStartsPerHour:boundedStarts(env?.THEBE_LIVE_VOICE_MAX_STARTS_PER_HOUR),
      maxUserStartsPerHour:boundedUserStarts(env?.THEBE_LIVE_VOICE_MAX_USER_STARTS_PER_HOUR)
    },
    authority:{
      independentAgent:false,
      backendPolicyRequired:true,
      executionAuthorityInherited:false
    }
  },201);
}

function copiedHeaders(request){
  const headers=new Headers({"content-type":"application/json","accept":"application/json"});
  for(const name of ["cookie","x-csrf-token","origin"]){
    const value=request.headers.get(name);
    if(value)headers.set(name,value);
  }
  return headers;
}

function normalizeVoiceIntent(value){
  return String(value||"").trim().toLowerCase()===VOICE_INTENT_PREPARE_INTERNAL_TASK
    ?VOICE_INTENT_PREPARE_INTERNAL_TASK
    :VOICE_INTENT_ANALYZE;
}

function normalizeTaskPriority(value){
  const priority=String(value||"medium").trim().toLowerCase();
  if(priority==="high")return 1;
  if(priority==="low")return 3;
  return 2;
}

function normalizeTaskDueAt(value){
  const raw=cleanText(value,80);
  if(!raw)return null;
  const date=new Date(raw);
  return Number.isFinite(date.getTime())?date.toISOString():undefined;
}

function normalizeVoiceTask(value={}){
  const task=value&&typeof value==="object"&&!Array.isArray(value)?value:{};
  const title=cleanText(task.title,MAX_TASK_TITLE);
  if(!title)return Object.freeze({error:"voice_task_title_required"});
  const dueAt=normalizeTaskDueAt(task.dueAt);
  if(dueAt===undefined)return Object.freeze({error:"voice_task_due_at_invalid"});
  return Object.freeze({
    task:Object.freeze({
      title,
      description:cleanText(task.description,MAX_TASK_DESCRIPTION)||null,
      priority:normalizeTaskPriority(task.priority),
      dueAt
    })
  });
}

async function activeVoiceTaskAuthority(env,tenantId){
  if(!env?.DB)return Object.freeze({ok:false,code:"bounded_execution_schema_not_ready"});
  let rows;
  try{
    rows=await env.DB.prepare(`SELECT d.id delegation_id,g.id execution_grant_id
      FROM agent_delegations d
      JOIN agent_execution_grants g ON g.delegation_id=d.id AND g.tenant_id=d.tenant_id
      WHERE d.tenant_id=? AND d.agent_key='thebe' AND d.action_key='task.create'
        AND d.status='active' AND d.max_autonomy_level>=3
        AND d.external_side_effects=0 AND d.human_confirmation_required=1
        AND (d.valid_from IS NULL OR d.valid_from<=CURRENT_TIMESTAMP)
        AND (d.expires_at IS NULL OR d.expires_at>CURRENT_TIMESTAMP)
        AND g.status='active'
      ORDER BY g.created_at DESC,g.id DESC
      LIMIT 2`).bind(tenantId).all();
  }catch{
    return Object.freeze({ok:false,code:"bounded_execution_schema_not_ready"});
  }
  const items=rows?.results||[];
  if(items.length===0)return Object.freeze({ok:false,code:"active_task_execution_grant_required"});
  if(items.length!==1)return Object.freeze({ok:false,code:"ambiguous_task_execution_grant"});
  return Object.freeze({
    ok:true,
    delegationId:String(items[0].delegation_id),
    executionGrantId:String(items[0].execution_grant_id)
  });
}

function preparedTaskContent(task){
  return cleanText(`I prepared the internal task "${task.title}" for review. It is not approved or executed. The owner must approve it in Thebe Desk before any guarded execution can occur.`,1500);
}

function taskPreparationNoopContent(code){
  if(code==="active_task_execution_grant_required"){
    return "I could not prepare that task because this workspace does not have an active governed task-creation grant. No task was created or executed.";
  }
  if(code==="ambiguous_task_execution_grant"){
    return "I could not prepare that task because more than one eligible task-creation grant is active. Resolve the grant configuration first. No task was created or executed.";
  }
  return "I could not prepare that task through the governed task workflow. No task was created or executed.";
}

async function prepareInternalTaskFromVoice({request,env,auth,taskFetch,delegationId,sessionId,task}){
  const authority=await activeVoiceTaskAuthority(env,auth.tenant_id);
  if(!authority.ok){
    const content=taskPreparationNoopContent(authority.code);
    await audit(env,auth,"THEBE_LIVE_TASK_PREPARE_DENIED",sessionId||delegationId,{
      delegationId,
      code:authority.code,
      executionPerformed:false
    });
    return json({
      ok:false,
      mode:VOICE_INTENT_PREPARE_INTERNAL_TASK,
      content,
      toolOutput:{
        ok:false,
        content,
        authority:{
          taskPrepared:false,
          approvalRequired:true,
          executionPerformed:false,
          voiceMayApprove:false,
          voiceMayExecute:false,
          runtimeGuardBypassed:false
        }
      },
      authority:{
        taskPrepared:false,
        approvalRequired:true,
        executionPerformed:false,
        voiceMayApprove:false,
        voiceMayExecute:false,
        runtimeGuardBypassed:false
      }
    },200);
  }
  if(typeof taskFetch!=="function")return json({error:"governed_task_backend_unavailable"},503);

  const taskPayloadHash=await sha256Hex(JSON.stringify(task));
  const idempotencyHash=await sha256Hex(`${auth.tenant_id}:${sessionId||"no-session"}:${delegationId}:${taskPayloadHash}`);
  const idempotencyKey=`voice-task-${idempotencyHash.slice(0,40)}`;
  await audit(env,auth,"THEBE_LIVE_TASK_PREPARE_REQUESTED",sessionId||delegationId,{
    delegationId,
    taskPayloadHash,
    executionGrantId:authority.executionGrantId,
    transcriptStored:false,
    executionPerformed:false
  });

  const target=new URL("/api/agentic/task-execution/prepare",request.url);
  const headers=copiedHeaders(request);
  headers.set("idempotency-key",idempotencyKey);
  let response;
  try{
    response=await taskFetch(new Request(target.toString(),{
      method:"POST",
      headers,
      body:JSON.stringify({
        delegationId:authority.delegationId,
        title:task.title,
        description:task.description,
        priority:task.priority,
        dueAt:task.dueAt
      })
    }),env);
  }catch{
    await audit(env,auth,"THEBE_LIVE_TASK_PREPARE_FAILED",sessionId||delegationId,{
      delegationId,taskPayloadHash,code:"task_backend_unreachable"
    });
    return json({error:"governed_task_prepare_failed"},502);
  }

  let prepared=null;
  try{prepared=await response.json()}catch{}
  if(!response.ok){
    const code=cleanText(prepared?.error,120)||"task_prepare_rejected";
    await audit(env,auth,"THEBE_LIVE_TASK_PREPARE_FAILED",sessionId||delegationId,{
      delegationId,taskPayloadHash,code,status:response.status
    });
    const content=taskPreparationNoopContent(code);
    return json({
      ok:false,
      mode:VOICE_INTENT_PREPARE_INTERNAL_TASK,
      content,
      toolOutput:{
        ok:false,
        content,
        authority:{
          taskPrepared:false,
          approvalRequired:true,
          executionPerformed:false,
          voiceMayApprove:false,
          voiceMayExecute:false,
          runtimeGuardBypassed:false
        }
      },
      authority:{
        taskPrepared:false,
        approvalRequired:true,
        executionPerformed:false,
        voiceMayApprove:false,
        voiceMayExecute:false,
        runtimeGuardBypassed:false
      }
    },response.status>=500?502:200);
  }

  if(!validPreparedTaskBackendPayload(prepared)){
    await audit(env,auth,"THEBE_LIVE_TASK_PREPARE_FAILED",sessionId||delegationId,{
      delegationId,taskPayloadHash,code:"task_backend_invalid_response",status:response.status
    });
    return json({error:"governed_task_prepare_invalid_response"},502);
  }

  const requestId=cleanText(prepared.request.id,160);
  const content=preparedTaskContent(task);
  await audit(env,auth,"THEBE_LIVE_TASK_PREPARED",sessionId||delegationId,{
    delegationId,
    taskPayloadHash,
    requestId,
    executionGrantId:authority.executionGrantId,
    preparedStatus:cleanText(prepared?.request?.status,80)||"prepared",
    executionPerformed:false
  });

  const resultAuthority={
    taskPrepared:true,
    approvalRequired:true,
    executionPerformed:false,
    permissionsExpanded:false,
    voiceMayApprove:false,
    voiceMayExecute:false,
    runtimeGuardBypassed:false
  };
  return json({
    ok:true,
    mode:VOICE_INTENT_PREPARE_INTERNAL_TASK,
    requestId,
    task:{title:task.title,priority:task.priority,dueAt:task.dueAt},
    content,
    toolOutput:{
      ok:true,
      mode:VOICE_INTENT_PREPARE_INTERNAL_TASK,
      requestId,
      content,
      authority:resultAuthority
    },
    authority:resultAuthority
  },201);
}

function spokenResult(plan){
  const summary=cleanText(plan?.run?.summary||"Thebe completed the governed business review.",700);
  const proposals=(Array.isArray(plan?.proposals)?plan.proposals:[])
    .slice(0,3)
    .map(item=>{
      const title=cleanText(item?.title,180);
      const reason=cleanText(item?.reason,260);
      return title&&reason?`${title}: ${reason}`:title;
    })
    .filter(Boolean);
  const parts=[summary];
  if(proposals.length)parts.push(`The main next steps are: ${proposals.join(" ")}`);
  parts.push("No business action was executed from this voice delegation.");
  return cleanText(parts.join(" "),1500);
}

async function delegateBusinessWork({request,env,ctx,auth,coreFetch,taskFetch}){
  if(!liveAllowed(env))return json({error:"live_voice_unavailable"},503);
  if(typeof coreFetch!=="function")return json({error:"governed_backend_unavailable"},503);

  let body;
  try{body=await readBoundedJson(request)}
  catch(error){return json({error:error.message},bodyErrorStatus(error))}

  const delegationId=cleanText(body?.delegationId,MAX_DELEGATION_ID);
  const taskText=cleanText(body?.taskText,MAX_DELEGATION_TEXT);
  const sessionId=cleanText(body?.sessionId,240)||null;
  const intent=normalizeVoiceIntent(body?.intent);
  if(!delegationId)return json({error:"delegation_id_required"},400);
  if(!taskText)return json({error:"delegation_task_text_required"},400);

  if(intent===VOICE_INTENT_PREPARE_INTERNAL_TASK){
    const normalized=normalizeVoiceTask(body?.task);
    if(normalized.error){
      const content="I could not prepare that internal task because the task details were incomplete or invalid. Ask the user to restate the task. No task was created or executed.";
      return json({
        ok:false,
        mode:intent,
        content,
        toolOutput:{ok:false,content,authority:{taskPrepared:false,approvalRequired:true,executionPerformed:false,voiceMayApprove:false,voiceMayExecute:false}},
        authority:{taskPrepared:false,approvalRequired:true,executionPerformed:false,voiceMayApprove:false,voiceMayExecute:false}
      },200);
    }
    return prepareInternalTaskFromVoice({
      request,env,auth,taskFetch,delegationId,sessionId,task:normalized.task
    });
  }

  const taskHash=await sha256Hex(taskText);
  await audit(env,auth,"THEBE_LIVE_DELEGATION_REQUESTED",sessionId||delegationId,{
    delegationId,
    taskHash,
    intent,
    transcriptStored:false,
    executionAuthorityInherited:false
  });

  const target=new URL("/api/agentic/plan",request.url);
  let response;
  try{
    response=await coreFetch(new Request(target.toString(),{
      method:"POST",
      headers:copiedHeaders(request),
      body:JSON.stringify({goal:taskText})
    }),env,ctx);
  }catch{
    await audit(env,auth,"THEBE_LIVE_DELEGATION_FAILED",sessionId||delegationId,{delegationId,taskHash,code:"backend_unreachable"});
    return json({error:"delegated_business_work_failed"},502);
  }

  let plan=null;
  try{plan=await response.json()}catch{}
  if(!response.ok){
    await audit(env,auth,"THEBE_LIVE_DELEGATION_FAILED",sessionId||delegationId,{
      delegationId,taskHash,code:"governed_backend_rejected",status:response.status
    });
    return json({error:"delegated_business_work_failed",backendStatus:response.status},response.status>=500?502:response.status);
  }
  if(!validGovernedPlanPayload(plan)){
    await audit(env,auth,"THEBE_LIVE_DELEGATION_FAILED",sessionId||delegationId,{
      delegationId,taskHash,code:"governed_backend_invalid_response",status:response.status
    });
    return json({error:"delegated_business_work_invalid_response"},502);
  }

  const content=spokenResult(plan);
  await audit(env,auth,"THEBE_LIVE_DELEGATION_COMPLETED",sessionId||delegationId,{
    delegationId,
    taskHash,
    runId:cleanText(plan?.run?.id,160)||null,
    proposalCount:Array.isArray(plan?.proposals)?plan.proposals.length:0,
    executionPerformed:false
  });

  const authority={
    executionPerformed:false,
    permissionsExpanded:false,
    runtimeGuardBypassed:false
  };
  return json({
    ok:true,
    runId:plan?.run?.id||null,
    proposalIds:(Array.isArray(plan?.proposals)?plan.proposals:[]).map(item=>item?.id).filter(Boolean),
    content,
    toolOutput:{
      ok:true,
      runId:plan?.run?.id||null,
      content,
      authority
    },
    authority
  },201);
}

export async function handleAgenticLiveVoiceRequest({request,logicalPath,env,ctx,coreFetch,taskFetch}){
  const path=String(logicalPath||new URL(request.url).pathname);
  if(!path.startsWith("/api/agentic/live"))return null;

  if(path==="/api/agentic/live/marketing/status"&&request.method==="GET")return marketingStatus(env);
  if(path==="/api/agentic/live/marketing/session"&&request.method==="POST"){
    if(!originAllowed(request,env))return json({error:"origin_failed"},403);
    return createMarketingSession({request,env});
  }
  if(path.startsWith("/api/agentic/live/marketing"))return json({error:"not_found"},404);

  const auth=await authenticate(request,env);
  if(!auth)return json({error:"unauthenticated"},401);
  if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);

  if(request.method!=="GET"){
    if(!originAllowed(request,env))return json({error:"origin_failed"},403);
    if(!csrfAllowed(request,auth))return json({error:"csrf_failed"},403);
  }

  if(path==="/api/agentic/live/status"&&request.method==="GET")return status(env,auth);
  if(path==="/api/agentic/live/session"&&request.method==="POST")return createSession({request,env,auth});
  if(path==="/api/agentic/live/delegation"&&request.method==="POST"){
    return delegateBusinessWork({request,env,ctx,auth,coreFetch,taskFetch});
  }
  return json({error:"not_found"},404);
}

export const __agenticLiveVoiceTest=Object.freeze({
  cleanText,
  boundedStarts,
  boundedUserStarts,
  boundedSessionSeconds,
  boundedUpstreamTimeoutMs,
  boundedFailureThreshold,
  boundedMarketingSessionSeconds,
  boundedMarketingStarts,
  liveGate,
  liveEnabled,
  marketingVoiceEnabled,
  marketingVoiceAllowed,
  liveConfigured,
  runtimeEnabled,
  killSwitchActive,
  normalizeVoiceIntent,
  normalizeTaskPriority,
  normalizeTaskDueAt,
  normalizeVoiceTask,
  validPreparedTaskBackendPayload,
  validGovernedPlanPayload,
  instructions,
  marketingInstructions,
  delegationTool,
  realtimeSessionConfig,
  marketingRealtimeSessionConfig,
  spokenResult,
  preparedTaskContent,
  taskPreparationNoopContent
});
