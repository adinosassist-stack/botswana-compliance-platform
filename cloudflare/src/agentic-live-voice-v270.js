export const THEBE_GPT_LIVE_PREVIEW_VERSION="2026-10-03.gpt-live-event-adapter-v271";
export const GPT_LIVE_API_URL="https://api.openai.com/v1/live/sessions";
export const GPT_LIVE_MODEL="gpt-live-1";
export const GPT_LIVE_DELEGATION_MODE="client";
export const GPT_LIVE_ALLOWED_CLIENT_EVENTS=Object.freeze([
  "session.close",
  "session.thinking.append",
  "session.commentary.append",
  "session.instructions.append",
  "session.input_audio.mute",
  "session.input_audio.unmute"
]);
export const GPT_LIVE_ALLOWED_SERVER_EVENTS=Object.freeze([
  "session.started",
  "session.input_transcript.delta",
  "session.output_transcript.delta",
  "session.delegation.created",
  "session.thinking.appended",
  "session.commentary.appended",
  "session.instructions.appended",
  "session.input_audio.muted",
  "session.input_audio.unmuted",
  "session.usage.updated",
  "session.closed",
  "info",
  "error"
].map(type=>Object.freeze({type})));

const envTrue=value=>["1","true","on","yes"].includes(String(value??"").trim().toLowerCase());
const cleanText=(value,max=16384)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);

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
    client:{data_channel:{
      allowed_client_events:GPT_LIVE_ALLOWED_CLIENT_EVENTS,
      allowed_server_events:GPT_LIVE_ALLOWED_SERVER_EVENTS
    }},
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
    dataChannelRestricted:true,
    productionSwitchAllowed:false
  });
}
