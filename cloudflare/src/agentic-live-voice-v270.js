export const THEBE_GPT_LIVE_PREVIEW_VERSION="2026-10-03.gpt-live-migration-v272";
export const GPT_LIVE_API_URL="https://api.openai.com/v1/live/sessions";
export const GPT_LIVE_MODEL="gpt-live-1";
export const GPT_LIVE_DELEGATION_MODE="client";
export const GPT_LIVE_APPEND_MAX_CHARS=1600;
export const GPT_LIVE_ALLOWED_CLIENT_EVENTS=Object.freeze([
  "session.close",
  "session.thinking.append",
  "session.commentary.append",
  "session.instructions.append"
]);
export const GPT_LIVE_ALLOWED_SERVER_EVENTS=Object.freeze([
  Object.freeze({type:"session.started"}),
  Object.freeze({type:"session.updated"}),
  Object.freeze({type:"session.input_transcript.delta"}),
  Object.freeze({type:"session.output_transcript.delta"}),
  Object.freeze({type:"session.delegation.created"}),
  Object.freeze({type:"session.usage.updated"}),
  Object.freeze({type:"session.commentary.appended"}),
  Object.freeze({type:"session.thinking.appended"}),
  Object.freeze({type:"session.instructions.appended"}),
  Object.freeze({type:"session.closed"}),
  Object.freeze({type:"info"}),
  Object.freeze({type:"error"})
]);

const envTrue=value=>["1","true","on","yes"].includes(String(value??"").trim().toLowerCase());
const cleanText=(value,max=16384)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const cleanId=(value,max=240)=>cleanText(value,max).replace(/[^A-Za-z0-9._:-]/g,"_");
const boundedNumber=(value,{min=0,max=Number.MAX_SAFE_INTEGER,fallback=0}={})=>{
  const parsed=Number(value);
  return Number.isFinite(parsed)&&parsed>=min&&parsed<=max?parsed:fallback;
};

export function gptLivePreviewEnabled(env={}){
  return envTrue(env.THEBE_GPT_LIVE_PREVIEW_ENABLED)&&String(env.THEBE_LIVE_VOICE_RUNTIME||"").trim().toLowerCase()==="gpt_live_preview";
}

export function gptLiveSessionConfig({instructions,voice="marin"}={}){
  const prompt=cleanText(instructions);
  if(!prompt)throw new Error("gpt_live_instructions_required");
  return Object.freeze({
    model:GPT_LIVE_MODEL,
    instructions:prompt,
    audio:{output:{voice:cleanText(voice,80)||"marin"}},
    client:{
      data_channel:{
        allowed_client_events:GPT_LIVE_ALLOWED_CLIENT_EVENTS,
        allowed_server_events:GPT_LIVE_ALLOWED_SERVER_EVENTS
      }
    },
    delegation:{type:GPT_LIVE_DELEGATION_MODE},
    store:false
  });
}

export function gptLiveCreateRequest({sdp,instructions,voice="marin"}={}){
  const offer=String(sdp||"");
  if(!offer||offer.length>72*1024||!/^v=0(?:\r?\n|$)/.test(offer))throw new Error("invalid_webrtc_offer");
  return Object.freeze({
    url:GPT_LIVE_API_URL,
    body:Object.freeze({
      session:gptLiveSessionConfig({instructions,voice}),
      transport:Object.freeze({type:"webrtc",sdp:offer})
    })
  });
}

export function normalizeGptLiveServerEvent(event={}){
  const type=String(event?.type||"");
  if(!type)return Object.freeze({kind:"unknown",type:""});

  if(type==="session.started"||type==="session.updated"){
    return Object.freeze({
      kind:type==="session.started"?"session_started":"session_updated",
      type,
      sessionId:cleanId(event?.session?.id)||null,
      model:cleanText(event?.session?.model,120)||null
    });
  }

  if(type==="session.input_transcript.delta"||type==="session.output_transcript.delta"){
    return Object.freeze({
      kind:type==="session.input_transcript.delta"?"input_transcript_delta":"output_transcript_delta",
      type,
      delta:String(event?.delta??""),
      startMs:boundedNumber(event?.start_ms,{max:24*60*60*1000}),
      endMs:boundedNumber(event?.end_ms,{max:24*60*60*1000})
    });
  }

  if(type==="session.delegation.created"){
    return Object.freeze({
      kind:"delegation_created",
      type,
      delegationId:cleanId(event?.delegation?.id)||null,
      target:cleanText(event?.delegation?.target,80)||null,
      offsetMs:boundedNumber(event?.offset_ms,{max:24*60*60*1000})
    });
  }

  if(type==="session.usage.updated"){
    return Object.freeze({
      kind:"usage_updated",
      type,
      seconds:boundedNumber(event?.usage?.seconds,{max:24*60*60}),
      eventId:cleanId(event?.event_id)||null
    });
  }

  if(type==="session.commentary.appended"||type==="session.thinking.appended"||type==="session.instructions.appended"){
    return Object.freeze({
      kind:"append_acknowledged",
      type,
      clientEventId:cleanId(event?.client_event_id)||null,
      startMs:boundedNumber(event?.start_ms,{max:24*60*60*1000}),
      endMs:boundedNumber(event?.end_ms,{max:24*60*60*1000})
    });
  }

  if(type==="error"){
    return Object.freeze({
      kind:"error",
      type,
      code:cleanText(event?.error?.code||event?.code,120)||null,
      message:cleanText(event?.error?.message||event?.message||"GPT-Live session error",500)
    });
  }

  return Object.freeze({kind:"other",type});
}

export function gptLiveContextAppend({channel="thinking",delegationId=null,content,eventId}={}){
  const allowed=new Set(["thinking","commentary","instructions"]);
  const selected=String(channel||"").trim().toLowerCase();
  if(!allowed.has(selected))throw new Error("invalid_gpt_live_append_channel");
  const safeEventId=cleanId(eventId);
  if(!safeEventId)throw new Error("gpt_live_event_id_required");
  const safeContent=cleanText(content,GPT_LIVE_APPEND_MAX_CHARS);
  if(!safeContent)throw new Error("gpt_live_append_content_required");
  const safeDelegationId=delegationId===null?null:cleanId(delegationId);
  if(delegationId!==null&&!safeDelegationId)throw new Error("gpt_live_delegation_id_required");
  return Object.freeze({
    type:`session.${selected}.append`,
    event_id:safeEventId,
    delegation_id:safeDelegationId,
    content:safeContent
  });
}

export function gptLiveDelegationUpdate({delegationId,eventId,content,status="progress",speak=false,verified=false}={}){
  const normalizedStatus=String(status||"progress").trim().toLowerCase();
  const allowedStatuses=new Set(["progress","completed","failed","cancelled"]);
  if(!allowedStatuses.has(normalizedStatus))throw new Error("invalid_gpt_live_delegation_status");
  if(!cleanId(delegationId))throw new Error("gpt_live_delegation_id_required");
  const terminal=normalizedStatus!=="progress";
  if(speak&&terminal&&!verified)throw new Error("verified_terminal_result_required");
  return gptLiveContextAppend({
    channel:speak?"commentary":"thinking",
    delegationId,
    eventId,
    content
  });
}

export function gptLiveEvalSample({
  runtime="gpt-live",
  connectMs=0,
  firstInputTranscriptMs=0,
  delegationCreatedMs=0,
  firstUsefulAnswerMs=0,
  interruptions=0,
  delegations=0,
  providerFailures=0,
  sessionSeconds=0
}={}){
  const normalizedRuntime=String(runtime||"").trim().toLowerCase();
  if(!["gpt-live","realtime"].includes(normalizedRuntime))throw new Error("invalid_voice_eval_runtime");
  const metric=value=>boundedNumber(value,{max:60*60*1000});
  const count=value=>Math.trunc(boundedNumber(value,{max:100000}));
  return Object.freeze({
    runtime:normalizedRuntime,
    connectMs:metric(connectMs),
    firstInputTranscriptMs:metric(firstInputTranscriptMs),
    delegationCreatedMs:metric(delegationCreatedMs),
    firstUsefulAnswerMs:metric(firstUsefulAnswerMs),
    interruptions:count(interruptions),
    delegations:count(delegations),
    providerFailures:count(providerFailures),
    sessionSeconds:boundedNumber(sessionSeconds,{max:24*60*60})
  });
}

export function compareGptLiveEvalSamples({realtime,live}={}){
  if(realtime?.runtime!=="realtime"||live?.runtime!=="gpt-live")throw new Error("voice_eval_samples_required");
  const delta=(a,b)=>Number((b-a).toFixed(2));
  return Object.freeze({
    connectMsDelta:delta(realtime.connectMs,live.connectMs),
    firstInputTranscriptMsDelta:delta(realtime.firstInputTranscriptMs,live.firstInputTranscriptMs),
    delegationCreatedMsDelta:delta(realtime.delegationCreatedMs,live.delegationCreatedMs),
    firstUsefulAnswerMsDelta:delta(realtime.firstUsefulAnswerMs,live.firstUsefulAnswerMs),
    providerFailureDelta:live.providerFailures-realtime.providerFailures,
    interruptionDelta:live.interruptions-realtime.interruptions
  });
}

export function gptLiveMigrationStatus(env={}){
  return Object.freeze({
    version:THEBE_GPT_LIVE_PREVIEW_VERSION,
    productionRuntime:"realtime",
    previewRuntime:"gpt-live",
    previewEnabled:gptLivePreviewEnabled(env),
    model:GPT_LIVE_MODEL,
    endpoint:"/v1/live/sessions",
    transport:"webrtc",
    delegation:GPT_LIVE_DELEGATION_MODE,
    eventCompatibility:true,
    comparativeTelemetry:true,
    dataChannelRestricted:true,
    productionSwitchAllowed:false
  });
}
