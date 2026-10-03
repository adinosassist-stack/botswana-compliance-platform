export const THEBE_VOICE_PROVIDER_POLICY_VERSION="2026-10-03.v270-eval";

const DEFAULT_PROVIDER="realtime";
const PROVIDERS=Object.freeze({
  realtime:Object.freeze({
    id:"realtime",
    api:"realtime",
    endpoint:"https://api.openai.com/v1/realtime/calls",
    model:"gpt-realtime-2.1",
    transport:"webrtc",
    productionDefault:true,
    evaluationOnly:false
  }),
  live:Object.freeze({
    id:"live",
    api:"live",
    endpoint:"https://api.openai.com/v1/live/sessions",
    model:"gpt-live-1",
    transport:"webrtc",
    productionDefault:false,
    evaluationOnly:true
  })
});

function envTrue(value){
  return ["1","true","on","yes"].includes(String(value??"").trim().toLowerCase());
}

function cleanProvider(value){
  return String(value??"").trim().toLowerCase().replace(/[^a-z0-9_-]/g,"").slice(0,32);
}

function providerDescriptor(id){
  return PROVIDERS[id]||PROVIDERS[DEFAULT_PROVIDER];
}

export function resolveThebeVoiceProvider(env={}){
  const requested=cleanProvider(env?.THEBE_VOICE_PROVIDER)||DEFAULT_PROVIDER;
  const known=Object.prototype.hasOwnProperty.call(PROVIDERS,requested);
  const liveEvaluationEnabled=envTrue(env?.THEBE_GPT_LIVE_EVAL_ENABLED);

  let selected=requested;
  let reason="requested_provider_ready";
  let fallbackApplied=false;

  if(!known){
    selected=DEFAULT_PROVIDER;
    reason="unknown_provider_fallback";
    fallbackApplied=true;
  }else if(requested==="live"&&!liveEvaluationEnabled){
    selected=DEFAULT_PROVIDER;
    reason="live_evaluation_disabled";
    fallbackApplied=true;
  }

  const active=providerDescriptor(selected);
  const fallbackChain=selected==="live"?["live","realtime"]:["realtime"];

  return Object.freeze({
    version:THEBE_VOICE_PROVIDER_POLICY_VERSION,
    requestedProvider:requested,
    provider:active.id,
    api:active.api,
    endpoint:active.endpoint,
    model:active.model,
    transport:active.transport,
    evaluationOnly:active.evaluationOnly,
    liveEvaluationEnabled,
    fallbackApplied,
    fallbackChain:Object.freeze(fallbackChain),
    reason
  });
}

export function thebeVoiceProviderDiagnostics(env={}){
  const policy=resolveThebeVoiceProvider(env);
  return Object.freeze({
    version:policy.version,
    requestedProvider:policy.requestedProvider,
    provider:policy.provider,
    api:policy.api,
    model:policy.model,
    transport:policy.transport,
    evaluationOnly:policy.evaluationOnly,
    liveEvaluationEnabled:policy.liveEvaluationEnabled,
    fallbackApplied:policy.fallbackApplied,
    fallbackChain:policy.fallbackChain,
    reason:policy.reason
  });
}

export function openAIVoiceSessionEnvelope({provider,sdp,session}={}){
  const selected=providerDescriptor(cleanProvider(provider));
  const offer=String(sdp??"");
  if(!offer||!/^v=0(?:\r?\n|$)/.test(offer))throw new Error("invalid_webrtc_offer");
  if(!session||typeof session!=="object"||Array.isArray(session))throw new Error("invalid_voice_session_config");

  if(selected.id==="live"){
    const liveSession={...session,model:selected.model};
    delete liveSession.type;
    return Object.freeze({
      provider:selected.id,
      endpoint:selected.endpoint,
      contentType:"application/json",
      body:Object.freeze({
        session:Object.freeze(liveSession),
        transport:Object.freeze({type:"webrtc",sdp:offer})
      })
    });
  }

  return Object.freeze({
    provider:selected.id,
    endpoint:selected.endpoint,
    contentType:"multipart/form-data",
    body:Object.freeze({
      sdp:offer,
      session:JSON.stringify({...session,type:"realtime",model:selected.model})
    })
  });
}

export const __thebeVoiceProviderPolicyTest=Object.freeze({
  PROVIDERS,
  DEFAULT_PROVIDER,
  cleanProvider,
  envTrue,
  providerDescriptor
});
