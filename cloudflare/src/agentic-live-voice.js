import {
  authenticate,roleAllowed,originAllowed,csrfAllowed,safeFirst
} from "./agentic-authority-core.js";

export const THEBE_LIVE_VOICE_VERSION="2026-09-20.realtime-ga-activation-v1";

const OPENAI_REALTIME_CALLS_URL="https://api.openai.com/v1/realtime/calls";
const LIVE_MODEL="gpt-realtime-1.5";
const DELEGATION_TOOL_NAME="delegate_to_thebe_backend";
const MAX_SESSION_BODY_BYTES=96*1024;
const MAX_SDP_CHARS=72*1024;
const MAX_DELEGATION_TEXT=2400;
const MAX_DELEGATION_ID=240;
const DEFAULT_MAX_SESSION_SECONDS=600;
const DEFAULT_UPSTREAM_TIMEOUT_MS=12000;
const DEFAULT_MAX_USER_STARTS_PER_HOUR=4;
const DEFAULT_FAILURE_CIRCUIT_THRESHOLD=3;

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

function instructions(){
  return [
    "You are Thebe, the live voice interface for Thebe Desk.",
    "Speak calmly, concisely and professionally. Prefer short spoken answers and ask one focused question when the user's intent is unclear.",
    "You are the conversational voice layer, not an independent business agent.",
    "For current company facts, finance, compliance, operations, customer work, business analysis, or any request that needs Thebe Desk data or tools, call delegate_to_thebe_backend instead of inventing an answer.",
    "The application backend owns business rules, permissions, tenant scope, approvals, tools, audit records and execution.",
    "Never claim a business action succeeded unless a verified backend result explicitly says it succeeded.",
    "Never approve, authorize or execute payments, statutory filings, signatures, employment termination, financing acceptance or accounting journal posting.",
    "A spoken interruption changes the conversation but does not prove that backend work was cancelled.",
    "When a delegated tool result arrives, summarize it naturally and preserve any approval, uncertainty or no-execution warning in that result."
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
    instructions:instructions(),
    tools:[delegationTool()],
    tool_choice:"auto"
  };
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
    await audit(env,auth,"THEBE_LIVE_SESSION_FAILED",requestId,{code:"upstream_rejected",status:upstream.status});
    return json({error:"live_session_create_failed",upstreamStatus:upstream.status},502);
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

async function delegateBusinessWork({request,env,ctx,auth,coreFetch}){
  if(!liveAllowed(env))return json({error:"live_voice_unavailable"},503);
  if(typeof coreFetch!=="function")return json({error:"governed_backend_unavailable"},503);

  let body;
  try{body=await readBoundedJson(request)}
  catch(error){return json({error:error.message},bodyErrorStatus(error))}

  const delegationId=cleanText(body?.delegationId,MAX_DELEGATION_ID);
  const taskText=cleanText(body?.taskText,MAX_DELEGATION_TEXT);
  const sessionId=cleanText(body?.sessionId,240)||null;
  if(!delegationId)return json({error:"delegation_id_required"},400);
  if(!taskText)return json({error:"delegation_task_text_required"},400);

  const taskHash=await sha256Hex(taskText);
  await audit(env,auth,"THEBE_LIVE_DELEGATION_REQUESTED",sessionId||delegationId,{
    delegationId,
    taskHash,
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

  let plan={};
  try{plan=await response.json()}catch{}
  if(!response.ok){
    await audit(env,auth,"THEBE_LIVE_DELEGATION_FAILED",sessionId||delegationId,{
      delegationId,taskHash,code:"governed_backend_rejected",status:response.status
    });
    return json({error:"delegated_business_work_failed",backendStatus:response.status},response.status>=500?502:response.status);
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

export async function handleAgenticLiveVoiceRequest({request,logicalPath,env,ctx,coreFetch}){
  const path=String(logicalPath||new URL(request.url).pathname);
  if(!path.startsWith("/api/agentic/live"))return null;

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
    return delegateBusinessWork({request,env,ctx,auth,coreFetch});
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
  liveGate,
  liveEnabled,
  liveConfigured,
  runtimeEnabled,
  killSwitchActive,
  instructions,
  delegationTool,
  realtimeSessionConfig,
  spokenResult
});
