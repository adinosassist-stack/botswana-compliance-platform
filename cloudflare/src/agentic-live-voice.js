import {
  authenticate,roleAllowed,originAllowed,csrfAllowed,safeFirst
} from "./agentic-authority-core.js";

export const THEBE_LIVE_VOICE_VERSION="2026-09-20.gpt-live-1-foundation-v1";

const OPENAI_LIVE_SESSIONS_URL="https://api.openai.com/v1/live/sessions";
const LIVE_MODEL="gpt-live-1";
const MAX_SESSION_BODY_BYTES=96*1024;
const MAX_SDP_CHARS=72*1024;
const MAX_DELEGATION_TEXT=2400;
const MAX_DELEGATION_ID=240;

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

function boundedStarts(value){
  const parsed=Number(value);
  if(!Number.isInteger(parsed)||parsed<1||parsed>60)return 6;
  return parsed;
}

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
    "For current company facts, finance, compliance, operations, customer work, business analysis, or any request that needs Thebe Desk data or tools, use client delegation instead of inventing an answer.",
    "The application backend owns business rules, permissions, tenant scope, approvals, tools, audit records and execution.",
    "Never claim a business action succeeded unless a verified backend result explicitly says it succeeded.",
    "Never approve, authorize or execute payments, statutory filings, signatures, employment termination, financing acceptance or accounting journal posting.",
    "A spoken interruption changes the conversation but does not prove that backend work was cancelled.",
    "When a delegated result arrives, summarize it naturally and preserve any approval, uncertainty or no-execution warning in that result."
  ].join(" ");
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

async function recentSessionStarts(env,tenantId){
  const row=await safeFirst(env,`SELECT COUNT(*) count FROM audit_events
    WHERE tenant_id=? AND event_type='THEBE_LIVE_SESSION_REQUESTED'
      AND created_at>=datetime('now','-1 hour')`,[tenantId]);
  return Number(row?.count||0);
}

async function status(env,auth){
  const starts=await recentSessionStarts(env,auth.tenant_id);
  const maxStarts=boundedStarts(env?.THEBE_LIVE_VOICE_MAX_STARTS_PER_HOUR);
  return json({
    enabled:liveEnabled(env),
    configured:liveConfigured(env),
    sessionCreationAllowed:liveAllowed(env)&&starts<maxStarts,
    version:THEBE_LIVE_VOICE_VERSION,
    model:LIVE_MODEL,
    transport:"webrtc",
    delegation:"client",
    phase:"phase0_foundation",
    runtimeEnabled:runtimeEnabled(env),
    runtimeKillSwitch:killSwitchActive(env),
    startsThisHour:starts,
    maxStartsPerHour:maxStarts,
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
  if(!liveEnabled(env))return json({error:"live_voice_disabled"},503);
  if(!liveConfigured(env))return json({error:"live_voice_not_configured"},503);
  if(!runtimeEnabled(env))return json({error:"agent_runtime_disabled"},503);
  if(killSwitchActive(env))return json({error:"agent_runtime_kill_switch_active"},503);

  const maxStarts=boundedStarts(env?.THEBE_LIVE_VOICE_MAX_STARTS_PER_HOUR);
  const starts=await recentSessionStarts(env,auth.tenant_id);
  if(starts>=maxStarts)return json({error:"live_session_rate_limited",retryAfterSeconds:3600},429);

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
    delegation:"client",
    voiceAuthority:"none"
  });

  let upstream;
  try{
    upstream=await fetch(OPENAI_LIVE_SESSIONS_URL,{
      method:"POST",
      headers:{
        "authorization":`Bearer ${String(env.OPENAI_API_KEY).trim()}`,
        "content-type":"application/json",
        "accept":"application/json"
      },
      body:JSON.stringify({
        session:{
          model:LIVE_MODEL,
          instructions:instructions(),
          delegation:{type:"client"}
        },
        transport:{type:"webrtc",sdp}
      })
    });
  }catch{
    await audit(env,auth,"THEBE_LIVE_SESSION_FAILED",requestId,{code:"upstream_unreachable"});
    return json({error:"live_session_create_failed"},502);
  }

  let data={};
  try{data=await upstream.json()}catch{}
  if(!upstream.ok){
    await audit(env,auth,"THEBE_LIVE_SESSION_FAILED",requestId,{code:"upstream_rejected",status:upstream.status});
    return json({error:"live_session_create_failed",upstreamStatus:upstream.status},502);
  }

  const sessionId=cleanText(data?.session?.id||data?.id,240);
  const answerSdp=String(data?.transport?.sdp||"");
  if(!sessionId||!answerSdp){
    await audit(env,auth,"THEBE_LIVE_SESSION_FAILED",requestId,{code:"invalid_upstream_response"});
    return json({error:"live_session_invalid_response"},502);
  }

  await audit(env,auth,"THEBE_LIVE_SESSION_STARTED",sessionId,{
    requestId,
    model:LIVE_MODEL,
    transport:"webrtc",
    delegation:"client"
  });

  return json({
    ok:true,
    version:THEBE_LIVE_VOICE_VERSION,
    model:LIVE_MODEL,
    session:{id:sessionId},
    transport:{type:"webrtc",sdp:answerSdp},
    delegation:{type:"client"},
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

  return json({
    ok:true,
    runId:plan?.run?.id||null,
    proposalIds:(Array.isArray(plan?.proposals)?plan.proposals:[]).map(item=>item?.id).filter(Boolean),
    event:{
      type:"session.commentary.append",
      event_id:crypto.randomUUID(),
      delegation_id:delegationId,
      content
    },
    authority:{
      executionPerformed:false,
      permissionsExpanded:false,
      runtimeGuardBypassed:false
    }
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
  liveEnabled,
  liveConfigured,
  runtimeEnabled,
  killSwitchActive,
  instructions,
  spokenResult
});
