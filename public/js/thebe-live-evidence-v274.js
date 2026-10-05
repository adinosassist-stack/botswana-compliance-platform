(function installThebeVoiceEvidence(global){
  "use strict";

  const RELEASE="20261004-voice-evidence-v281";
  const EVIDENCE_PATH="/api/agentic/live/preview/evidence";
  const SUMMARY_PATH="/api/agentic/live/preview/evidence/summary";
  const SCENARIO_KEY="thebe.voice.eval.scenario.v281";
  let active=null,lastSubmission=null;

  const now=()=>performance?.now?.()??Date.now();
  const cleanId=(value,max=120)=>String(value??"").trim().replace(/[^A-Za-z0-9._:-]/g,"_").slice(0,max);
  const cleanLanguageTag=value=>{
    const raw=String(value??"").trim().slice(0,32);
    if(!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(raw))return "";
    return raw.split("-").map((part,index)=>index===0?part.toLowerCase():(/^[A-Za-z]{2}$/.test(part)?part.toUpperCase():part.toLowerCase())).join("-");
  };
  const cleanAcousticKind=value=>{
    const kind=String(value??"").trim().toLowerCase();
    return kind==="silence"||kind==="noise"?kind:"";
  };
  const safeApi=(url,options={})=>{
    if(typeof global.apiJson!=="function")throw new Error("The secure Thebe API transport is not available.");
    return global.apiJson(url,options);
  };
  const emit=(name,detail={})=>{try{global.dispatchEvent(new CustomEvent(name,{detail:{release:RELEASE,...detail}}))}catch{}};
  const boundedUsage=value=>{
    const parsed=Number(value);
    return Number.isFinite(parsed)&&parsed>=0?Math.min(24*60*60,parsed):null;
  };
  const parseUsageSeconds=event=>{
    if(!event||typeof event!=="object")return null;
    const type=String(event.type||"");
    if(!["session.usage.updated","session.usage","usage.updated"].includes(type))return null;
    const usage=event.usage&&typeof event.usage==="object"?event.usage:{};
    return boundedUsage(event.seconds??usage.seconds??usage.audio_seconds??usage.total_seconds);
  };

  function savedScenario(){
    try{return cleanId(global.sessionStorage?.getItem(SCENARIO_KEY)||"")}catch{return ""}
  }

  function beginScenario(scenarioId){
    const safe=cleanId(scenarioId);
    if(!safe)throw new Error("voice_eval_scenario_id_required");
    try{global.sessionStorage?.setItem(SCENARIO_KEY,safe)}catch{}
    emit("thebe-voice-eval-scenario",{scenarioId:safe,active:true});
    return safe;
  }

  function clearScenario(){
    try{global.sessionStorage?.removeItem(SCENARIO_KEY)}catch{}
    active=null;
    emit("thebe-voice-eval-scenario",{scenarioId:null,active:false});
  }

  function newSession(detail={}){
    const scenarioId=savedScenario();
    if(!scenarioId)return null;
    const startedAt=now();
    active={
      scenarioId,
      sessionId:cleanId(detail.sessionId,240)||`local-${Date.now()}`,
      runtime:"realtime",
      startedAt,
      connectedAt:0,
      connectMs:0,
      firstInputTranscriptMs:0,
      delegationCreatedMs:0,
      firstUsefulAnswerMs:0,
      interruptions:0,
      interruptionsHandled:0,
      interruptionsFailed:0,
      interruptionPending:false,
      assistantSpoke:false,
      delegations:0,
      delegationsCompleted:0,
      delegationsFailed:0,
      providerFailures:0,
      fallbackAttempts:0,
      fallbackRecoveries:0,
      usageSeconds:0,
      languageContinuityChecks:0,
      languageContinuityPasses:0,
      languageTags:new Set(),
      acousticRecoveryChecks:0,
      acousticRecoveryPasses:0,
      acousticRecoveryKinds:new Set(),
      submitted:false
    };
    emit("thebe-voice-eval-started",{scenarioId,sessionId:active.sessionId});
    return active;
  }

  function elapsed(){return active?Math.max(0,now()-active.startedAt):0}

  function markRuntime(detail={}){
    if(!active&&savedScenario())newSession(detail);
    if(!active)return;
    const runtime=String(detail.actualRuntime||detail.runtime||"").trim().toLowerCase();
    if(runtime==="gpt-live"||runtime==="realtime")active.runtime=runtime;
    const sessionId=cleanId(detail.sessionId,240);
    if(sessionId)active.sessionId=sessionId;
    if(Number.isFinite(Number(detail.elapsedMs))&&Number(detail.elapsedMs)>=0)active.connectMs=Number(detail.elapsedMs);
    const usage=boundedUsage(detail.usageSeconds);
    if(usage!==null)active.usageSeconds=Math.max(active.usageSeconds,usage);
    if(detail.fallback===true){
      active.fallbackAttempts+=1;
      if(runtime==="realtime")active.fallbackRecoveries+=1;
      active.providerFailures+=1;
    }
  }

  function markVoiceState(detail={}){
    const state=String(detail.state||"");
    if(state==="connecting"){
      if(savedScenario())newSession(detail);
      return;
    }
    if(!active)return;
    const sessionId=cleanId(detail.sessionId,240);
    if(sessionId)active.sessionId=sessionId;
    const usage=boundedUsage(detail.usageSeconds);
    if(usage!==null)active.usageSeconds=Math.max(active.usageSeconds,usage);
    if(state==="connected"&&!active.connectedAt){
      active.connectedAt=now();
      if(!active.connectMs)active.connectMs=Math.max(0,active.connectedAt-active.startedAt);
      return;
    }
    if(state==="idle"||state==="closed")void finalizeEvidence();
  }

  function markServerEvent(detail={}){
    if(!active)return;
    const event=detail.event||detail;
    const type=String(event?.type||"");
    const usage=parseUsageSeconds(event);
    if(usage!==null)active.usageSeconds=Math.max(active.usageSeconds,usage);
    if(type==="conversation.item.input_audio_transcription.delta"||type==="session.input_transcript.delta"){
      if(!active.firstInputTranscriptMs)active.firstInputTranscriptMs=elapsed();
      return;
    }
    if(type==="response.output_audio_transcript.delta"||type==="session.output_transcript.delta"){
      if(!active.firstUsefulAnswerMs)active.firstUsefulAnswerMs=elapsed();
      if(active.interruptionPending){
        active.interruptionsHandled+=1;
        active.interruptionPending=false;
      }
      active.assistantSpoke=true;
      return;
    }
    if(type==="input_audio_buffer.speech_started"&&active.assistantSpoke&&!active.interruptionPending){
      active.interruptions+=1;
      active.interruptionPending=true;
      return;
    }
    if(type==="error")active.providerFailures+=1;
  }

  function markLanguageContinuity(detail={}){
    if(!active)return false;
    const languageTag=cleanLanguageTag(detail.languageTag||detail.tag||"");
    if(!languageTag)throw new Error("voice_eval_language_tag_required");
    active.languageContinuityChecks+=1;
    if(detail.passed===true)active.languageContinuityPasses+=1;
    active.languageTags.add(languageTag);
    emit("thebe-voice-eval-language",{languageTag,passed:detail.passed===true});
    return true;
  }

  function markAcousticRecovery(detail={}){
    if(!active)return false;
    const kind=cleanAcousticKind(detail.kind);
    if(!kind)throw new Error("voice_eval_acoustic_kind_required");
    active.acousticRecoveryChecks+=1;
    if(detail.passed===true)active.acousticRecoveryPasses+=1;
    active.acousticRecoveryKinds.add(kind);
    emit("thebe-voice-eval-acoustic",{kind,passed:detail.passed===true});
    return true;
  }

  function markDelegation(detail={}){
    if(!active)return;
    active.delegations+=1;
    if(!active.delegationCreatedMs)active.delegationCreatedMs=elapsed();
  }

  function markDelegationResult(detail={}){
    if(!active)return;
    const result=detail.result;
    if(result?.verified===false||result?.ok===false){
      active.delegationsFailed+=1;
      return;
    }
    active.delegationsCompleted+=1;
  }

  function markError(detail={}){
    if(!active)return;
    const stage=String(detail.stage||"");
    if(stage.includes("delegation"))active.delegationsFailed+=1;
    else active.providerFailures+=1;
  }

  function evidencePayload(){
    if(!active)return null;
    const pendingDelegations=Math.max(0,active.delegations-active.delegationsCompleted-active.delegationsFailed);
    return {
      scenarioId:active.scenarioId,
      sessionId:active.sessionId,
      runtime:active.runtime,
      connectMs:Math.round(active.connectMs||0),
      firstInputTranscriptMs:Math.round(active.firstInputTranscriptMs||0),
      delegationCreatedMs:Math.round(active.delegationCreatedMs||0),
      firstUsefulAnswerMs:Math.round(active.firstUsefulAnswerMs||0),
      interruptions:active.interruptions,
      interruptionsHandled:active.interruptionsHandled,
      interruptionsFailed:active.interruptionsFailed+(active.interruptionPending?1:0),
      delegations:active.delegations,
      delegationsCompleted:active.delegationsCompleted,
      delegationsFailed:active.delegationsFailed+pendingDelegations,
      providerFailures:active.providerFailures,
      fallbackAttempts:active.fallbackAttempts,
      fallbackRecoveries:active.fallbackRecoveries,
      sessionSeconds:Number((elapsed()/1000).toFixed(3)),
      usageSeconds:Number(active.usageSeconds.toFixed(3)),
      languageContinuityChecks:active.languageContinuityChecks,
      languageContinuityPasses:active.languageContinuityPasses,
      languageTags:[...active.languageTags].sort(),
      acousticRecoveryChecks:active.acousticRecoveryChecks,
      acousticRecoveryPasses:active.acousticRecoveryPasses,
      acousticRecoveryKinds:[...active.acousticRecoveryKinds].sort()
    };
  }

  async function finalizeEvidence(){
    if(!active||active.submitted)return null;
    active.submitted=true;
    const payload=evidencePayload();
    try{
      const result=await safeApi(EVIDENCE_PATH,{method:"POST",body:JSON.stringify(payload)});
      lastSubmission={ok:true,payload,result,at:new Date().toISOString()};
      emit("thebe-voice-eval-recorded",{scenarioId:payload.scenarioId,runtime:payload.runtime,sessionId:payload.sessionId});
      return result;
    }catch(error){
      lastSubmission={ok:false,payload,error:String(error?.message||error),at:new Date().toISOString()};
      emit("thebe-voice-eval-error",{scenarioId:payload?.scenarioId,runtime:payload?.runtime,message:String(error?.message||error).slice(0,240)});
      return null;
    }finally{
      active=null;
    }
  }

  async function summary(){return safeApi(SUMMARY_PATH)}

  global.addEventListener?.("thebe-live-runtime-selection",event=>markRuntime(event.detail||{}));
  global.addEventListener?.("thebe-live-state",event=>markVoiceState(event.detail||{}));
  global.addEventListener?.("thebe-live-event",event=>markServerEvent(event.detail||{}));
  global.addEventListener?.("thebe-live-language-continuity",event=>markLanguageContinuity(event.detail||{}));
  global.addEventListener?.("thebe-live-acoustic-recovery",event=>markAcousticRecovery(event.detail||{}));
  global.addEventListener?.("thebe-live-delegation",event=>markDelegation(event.detail||{}));
  global.addEventListener?.("thebe-live-delegation-result",event=>markDelegationResult(event.detail||{}));
  global.addEventListener?.("thebe-live-error",event=>markError(event.detail||{}));

  global.ThebeVoiceEval=Object.freeze({
    release:RELEASE,
    beginScenario,
    clearScenario,
    markLanguageContinuity,
    markAcousticRecovery,
    finalize:finalizeEvidence,
    summary,
    state:()=>({scenarioId:savedScenario()||null,active:active?{...active,languageTags:[...active.languageTags],acousticRecoveryKinds:[...active.acousticRecoveryKinds]}:null,lastSubmission})
  });
})(window);
