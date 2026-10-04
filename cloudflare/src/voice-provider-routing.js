export const VOICE_PROVIDER_ROUTING_VERSION="2026-10-04.v273";

export const VOICE_PRODUCTION_PROFILE=Object.freeze({
  id:"openai-realtime-ga",
  provider:"openai",
  model:"gpt-realtime-2.1",
  endpoint:"https://api.openai.com/v1/realtime/calls",
  transport:"webrtc",
  delegation:"function_tool",
  activation:"production"
});

export const VOICE_EVALUATION_PROFILES=Object.freeze([
  Object.freeze({
    id:"openai-gpt-live-1",
    provider:"openai",
    model:"gpt-live-1",
    endpoint:"https://api.openai.com/v1/live/sessions",
    transport:"webrtc",
    delegation:"backend",
    activation:"evaluation_only"
  })
]);

const clean=value=>String(value??"").trim();
const candidateById=id=>VOICE_EVALUATION_PROFILES.find(profile=>profile.id===id)||null;

export function resolveVoiceProviderRoute({
  mode="production",
  requestedProfileId="",
  evidenceDecision=null,
  reviewPermit=""
}={}){
  const normalizedMode=clean(mode).toLowerCase()||"production";
  const requested=clean(requestedProfileId);

  if(normalizedMode==="production"){
    return Object.freeze({
      ok:true,
      mode:"production",
      profile:VOICE_PRODUCTION_PROFILE,
      fallback:false,
      code:requested&&requested!==VOICE_PRODUCTION_PROFILE.id
        ?"production_profile_pinned"
        :"production_profile_selected",
      requestedProfileId:requested||VOICE_PRODUCTION_PROFILE.id
    });
  }

  if(normalizedMode!=="evaluation"){
    return Object.freeze({
      ok:false,
      mode:normalizedMode,
      profile:null,
      fallback:false,
      code:"voice_routing_mode_invalid",
      requestedProfileId:requested||null
    });
  }

  const candidate=candidateById(requested);
  if(!candidate){
    return Object.freeze({
      ok:false,
      mode:"evaluation",
      profile:null,
      fallback:false,
      code:"voice_evaluation_profile_unknown",
      requestedProfileId:requested||null
    });
  }

  if(evidenceDecision?.eligible!==true||evidenceDecision?.code!=="evidence_qualifies_for_review"){
    return Object.freeze({
      ok:true,
      mode:"evaluation",
      profile:VOICE_PRODUCTION_PROFILE,
      fallback:true,
      code:"voice_candidate_evidence_not_qualified",
      requestedProfileId:candidate.id
    });
  }

  if(!clean(reviewPermit)){
    return Object.freeze({
      ok:true,
      mode:"evaluation",
      profile:VOICE_PRODUCTION_PROFILE,
      fallback:true,
      code:"voice_candidate_review_permit_required",
      requestedProfileId:candidate.id
    });
  }

  return Object.freeze({
    ok:true,
    mode:"evaluation",
    profile:candidate,
    fallback:false,
    code:"voice_candidate_review_route_selected",
    requestedProfileId:candidate.id,
    reviewPermit:clean(reviewPermit),
    productionActivation:false
  });
}

export function verifyVoiceProviderRoutingPolicy(){
  const qualified=Object.freeze({eligible:true,code:"evidence_qualifies_for_review"});
  const unqualified=Object.freeze({eligible:false,code:"evaluation_threshold_failed"});
  const productionDefault=resolveVoiceProviderRoute();
  const productionCandidateRequest=resolveVoiceProviderRoute({mode:"production",requestedProfileId:"openai-gpt-live-1",evidenceDecision:qualified,reviewPermit:"review-1"});
  const unknownMode=resolveVoiceProviderRoute({mode:"other",requestedProfileId:"openai-gpt-live-1"});
  const unknownCandidate=resolveVoiceProviderRoute({mode:"evaluation",requestedProfileId:"unknown",evidenceDecision:qualified,reviewPermit:"review-1"});
  const unqualifiedCandidate=resolveVoiceProviderRoute({mode:"evaluation",requestedProfileId:"openai-gpt-live-1",evidenceDecision:unqualified,reviewPermit:"review-1"});
  const noReviewPermit=resolveVoiceProviderRoute({mode:"evaluation",requestedProfileId:"openai-gpt-live-1",evidenceDecision:qualified});
  const reviewedCandidate=resolveVoiceProviderRoute({mode:"evaluation",requestedProfileId:"openai-gpt-live-1",evidenceDecision:qualified,reviewPermit:"review-1"});

  const pass=productionDefault.profile?.id===VOICE_PRODUCTION_PROFILE.id&&
    productionCandidateRequest.profile?.id===VOICE_PRODUCTION_PROFILE.id&&
    productionCandidateRequest.code==="production_profile_pinned"&&
    unknownMode.ok===false&&
    unknownCandidate.ok===false&&
    unqualifiedCandidate.profile?.id===VOICE_PRODUCTION_PROFILE.id&&unqualifiedCandidate.fallback===true&&
    noReviewPermit.profile?.id===VOICE_PRODUCTION_PROFILE.id&&noReviewPermit.fallback===true&&
    reviewedCandidate.profile?.id==="openai-gpt-live-1"&&
    reviewedCandidate.mode==="evaluation"&&
    reviewedCandidate.productionActivation===false;

  return Object.freeze({
    version:VOICE_PROVIDER_ROUTING_VERSION,
    pass,
    routes:Object.freeze({
      productionDefault,
      productionCandidateRequest,
      unknownMode,
      unknownCandidate,
      unqualifiedCandidate,
      noReviewPermit,
      reviewedCandidate
    })
  });
}
