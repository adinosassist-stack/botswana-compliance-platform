(function bootstrapThebeLivePreviewFallback(global){
  "use strict";
  const RELEASE="20261003-gpt-live-preview-fallback-v272";
  const PRODUCTION_SESSION_PATH="/api/agentic/live/session";
  const PREVIEW_STATUS_PATH="/api/agentic/live/preview/status";
  const PREVIEW_SESSION_PATH="/api/agentic/live/preview/session";
  const PREVIEW_DELEGATION_PATH="/api/agentic/live/preview/delegation";
  const LEGACY_BRIDGE_MARKER="__thebe_gpt_live_legacy_bridge";
  const LIVE_EVENT_BRIDGE_VERSION="session-v1";
  const MAX_TASK_TEXT=2400;
  let installed=false,bridgeInstalled=false,originalApi=null,previewStatus=null,statusCheckedAt=0;
  let activeRuntime="realtime",activeSessionId=null,latestInputEndMs=0,lastSpeaker="",inputSegments=[];
  const activeDelegations=new Set();

  const now=()=>Date.now();
  const clean=(value,max=1600)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
  const emit=(detail={})=>{try{global.dispatchEvent(new CustomEvent("thebe-live-runtime-selection",{detail:{release:RELEASE,...detail}}))}catch{}};
  const emitLive=(name,detail={})=>{try{global.dispatchEvent(new CustomEvent(name,{detail}))}catch{}};
  const emitFallback=(stage,detail={})=>emitLive("thebe-live-provider-fallback",{release:RELEASE,stage,...detail});
  const errorCode=error=>String(error?.code||error?.data?.error||error?.body?.error||"").trim();
  const errorStatus=error=>Number(error?.status||error?.data?.status||0)||0;
  const eventId=()=>global.crypto?.randomUUID?.()||`thebe-preview-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function exactLogicalPath(value){
    try{return new URL(String(value||""),global.location?.origin||"https://thebedesk.invalid").pathname}catch{return ""}
  }

  function previewClientCompatible(){return bridgeInstalled}

  function retryablePreviewError(error){
    const status=errorStatus(error),code=errorCode(error);
    if(status===400||status===401||status===403||status===413||status===415)return false;
    if(status>=500||status===429||status===0)return true;
    return /^gpt_live_preview_(?:disabled|unavailable|timeout|upstream_failed|invalid_response|audit_unavailable)$/.test(code)||code==="openai_not_configured"||code==="agent_runtime_disabled"||code==="agent_runtime_kill_switch"||code==="live_voice_disabled";
  }

  async function readPreviewStatus(force=false){
    if(!originalApi)return null;
    if(!force&&previewStatus&&now()-statusCheckedAt<30000)return previewStatus;
    statusCheckedAt=now();
    try{previewStatus=await originalApi(PREVIEW_STATUS_PATH);return previewStatus}catch{previewStatus=null;return null}
  }

  function resetRuntime(runtime="realtime",sessionId=null){
    activeRuntime=runtime;
    activeSessionId=sessionId;
    latestInputEndMs=0;
    lastSpeaker="";
    inputSegments=[];
    activeDelegations.clear();
  }

  async function request(url,options={}){
    const path=exactLogicalPath(url);
    if(path!==PRODUCTION_SESSION_PATH||String(options?.method||"GET").toUpperCase()!=="POST")return originalApi(url,options);
    if(!previewClientCompatible()){
      resetRuntime("realtime");
      emit({requestedRuntime:"realtime",actualRuntime:"realtime",fallback:false,reason:"gpt_live_event_adapter_unavailable"});
      return originalApi(url,options);
    }
    const status=await readPreviewStatus();
    if(status?.sessionCreationAllowed!==true){
      resetRuntime("realtime");
      emit({requestedRuntime:"realtime",actualRuntime:"realtime",fallback:false,reason:status?.gateCode||"preview_not_enabled"});
      return originalApi(url,options);
    }
    const started=now();
    try{
      const preview=await originalApi(PREVIEW_SESSION_PATH,options);
      resetRuntime("gpt-live",clean(preview?.session?.id,240)||null);
      emit({requestedRuntime:"gpt-live",actualRuntime:"gpt-live",fallback:false,elapsedMs:Math.max(0,now()-started),sessionId:activeSessionId});
      return preview;
    }catch(error){
      if(!retryablePreviewError(error)){
        resetRuntime("realtime");
        emit({requestedRuntime:"gpt-live",actualRuntime:"none",fallback:false,reason:errorCode(error)||"preview_request_rejected",status:errorStatus(error)});
        throw error;
      }
      const reason=errorCode(error)||"preview_transport_failure";
      const previewElapsedMs=Math.max(0,now()-started);
      const fallbackStarted=now();
      emitFallback("attempt",{requestedRuntime:"gpt-live",actualRuntime:"realtime",reason,previewElapsedMs});
      try{
        const realtime=await originalApi(url,options);
        resetRuntime("realtime",clean(realtime?.session?.id,240)||null);
        const fallbackElapsedMs=Math.max(0,now()-fallbackStarted);
        emitFallback("recovered",{requestedRuntime:"gpt-live",actualRuntime:"realtime",reason,previewElapsedMs,fallbackElapsedMs,sessionId:activeSessionId});
        emit({requestedRuntime:"gpt-live",actualRuntime:"realtime",fallback:true,reason,previewElapsedMs,fallbackElapsedMs,sessionId:activeSessionId});
        return realtime;
      }catch(fallbackError){
        resetRuntime("realtime");
        emitFallback("failed",{requestedRuntime:"gpt-live",actualRuntime:"none",reason,status:errorStatus(fallbackError),fallbackReason:errorCode(fallbackError)||"realtime_fallback_failed",previewElapsedMs,fallbackElapsedMs:Math.max(0,now()-fallbackStarted)});
        throw fallbackError;
      }
    }
  }

  function parseEvent(data){try{return JSON.parse(String(data||""))}catch{return null}}

  function legacyEventsForGptLive(event){
    const type=String(event?.type||"");
    const events=[];
    if(type==="session.started"||type==="session.updated"){
      events.push({type:"session.created",session:event?.session||{id:activeSessionId}});
      return events;
    }
    if(type==="session.input_transcript.delta"){
      const startMs=Math.max(0,Number(event?.start_ms)||0),endMs=Math.max(startMs,Number(event?.end_ms)||startMs);
      const delta=String(event?.delta??"");
      if(lastSpeaker!=="user"){
        if(lastSpeaker==="assistant")events.push({type:"response.done",response:{output:[]}});
        events.push({type:"input_audio_buffer.speech_started"});
      }
      if(delta){
        inputSegments.push({delta,startMs,endMs});
        while(inputSegments.length>160)inputSegments.shift();
        latestInputEndMs=Math.max(latestInputEndMs,endMs);
        events.push({type:"conversation.item.input_audio_transcription.delta",delta});
      }
      lastSpeaker="user";
      return events;
    }
    if(type==="session.output_transcript.delta"){
      if(lastSpeaker==="user")events.push({type:"input_audio_buffer.speech_stopped"});
      const delta=String(event?.delta??"");
      if(delta)events.push({type:"response.output_audio_transcript.delta",delta});
      lastSpeaker="assistant";
      return events;
    }
    if(type==="session.closed")return [{type:"session.closed"}];
    if(type==="error")return [{type:"error",error:event?.error||{code:event?.code,message:event?.message}}];
    return events;
  }

  function delegationTaskText(offsetMs=0){
    const offset=Math.max(0,Number(offsetMs)||0);
    const text=inputSegments
      .filter(item=>offset===0||item.endMs<=offset)
      .map(item=>item.delta)
      .join("");
    return clean(text,MAX_TASK_TEXT);
  }

  function governedResultVerified(result){
    return result?.verified===true&&
      result?.verification?.source==="governed_live_backend"&&
      result?.authority?.executionPerformed===false&&
      result?.authority?.taskPrepared!==true&&
      String(result?.mode||"analyze")!=="prepare_internal_task"&&
      clean(result?.content,1600).length>0;
  }

  function sendChannel(channel,payload){
    if(!channel||channel.readyState!=="open")return false;
    try{channel.send(JSON.stringify(payload));return true}catch{return false}
  }

  function appendChannel(channel,type,delegationId,content){
    return sendChannel(channel,{type,event_id:eventId(),delegation_id:delegationId||null,content:clean(content,1600)});
  }

  async function handlePreviewDelegation(event,channel){
    const delegationId=clean(event?.delegation?.id,240);
    if(!delegationId||event?.delegation?.target!=="client"||activeDelegations.has(delegationId))return;
    const offsetMs=Math.max(0,Number(event?.offset_ms)||0);
    const taskText=delegationTaskText(offsetMs);
    activeDelegations.add(delegationId);
    emitLive("thebe-live-delegation",{delegationId,sessionId:activeSessionId,taskText,intent:"analyze",runtime:"gpt-live"});
    if(!taskText){
      appendChannel(channel,"session.commentary.append",delegationId,"I could not reliably capture the business request. Please repeat it. No business action was confirmed.");
      activeDelegations.delete(delegationId);
      return;
    }
    appendChannel(channel,"session.thinking.append",delegationId,"The governed Thebe backend is checking this request. No business action is confirmed yet.");
    try{
      const result=await originalApi(PREVIEW_DELEGATION_PATH,{
        method:"POST",
        body:JSON.stringify({delegationId,sessionId:activeSessionId,taskText,intent:"analyze"})
      });
      const stale=offsetMs>0&&latestInputEndMs>offsetMs;
      if(stale){
        appendChannel(channel,"session.thinking.append",delegationId,"The user continued or changed the request after this work started. Do not announce the older result; continue from the latest input.");
        emitLive("thebe-live-delegation-stale",{delegationId,sessionId:activeSessionId,revision:offsetMs,currentRevision:latestInputEndMs,taskPrepared:false,runtime:"gpt-live"});
        return;
      }
      if(!governedResultVerified(result)){
        appendChannel(channel,"session.commentary.append",delegationId,"The governed Thebe backend could not verify that business result. No business action was confirmed.");
        emitLive("thebe-live-delegation-result",{delegationId,sessionId:activeSessionId,intent:"analyze",runtime:"gpt-live",result:{ok:false,content:"The governed Thebe backend could not verify that business result. No business action was confirmed.",authority:{executionPerformed:false}}});
        return;
      }
      appendChannel(channel,"session.commentary.append",delegationId,result.content);
      emitLive("thebe-live-delegation-result",{delegationId,sessionId:activeSessionId,intent:"analyze",runtime:"gpt-live",result});
    }catch(error){
      appendChannel(channel,"session.commentary.append",delegationId,"The governed Thebe backend could not complete that request. No business action was confirmed.");
      emitLive("thebe-live-error",{stage:"gpt_live_delegation",message:clean(error?.message||"Delegation failed",240),runtime:"gpt-live"});
    }finally{
      activeDelegations.delete(delegationId);
    }
  }

  function syntheticMessage(channel,payload){
    try{
      const bridgedPayload={...payload,[LEGACY_BRIDGE_MARKER]:LIVE_EVENT_BRIDGE_VERSION};
      const event=typeof global.MessageEvent==="function"
        ?new global.MessageEvent("message",{data:JSON.stringify(bridgedPayload)})
        :{type:"message",data:JSON.stringify(bridgedPayload)};
      channel.dispatchEvent(event);
    }catch{}
  }

  function handlePreviewChannelMessage(event,channel){
    if(activeRuntime!=="gpt-live")return;
    const message=parseEvent(event?.data);
    if(!message||message?.[LEGACY_BRIDGE_MARKER]===LIVE_EVENT_BRIDGE_VERSION)return;
    if(message.type==="session.delegation.created"){
      syntheticMessage(channel,{type:"input_audio_buffer.speech_stopped"});
      void handlePreviewDelegation(message,channel);
      return;
    }
    for(const legacy of legacyEventsForGptLive(message))syntheticMessage(channel,legacy);
  }

  function installDataChannelBridge(){
    const proto=global.RTCPeerConnection?.prototype;
    if(!proto||typeof proto.createDataChannel!=="function")return false;
    if(proto.createDataChannel.__thebeGptLiveBridge===true){bridgeInstalled=true;return true}
    const original=proto.createDataChannel;
    const patched=function(...args){
      const channel=original.apply(this,args);
      if(channel?.label==="oai-events"&&channel.__thebeGptLiveBridge!==true){
        Object.defineProperty(channel,"__thebeGptLiveBridge",{value:true});
        channel.addEventListener("message",event=>handlePreviewChannelMessage(event,channel));
      }
      return channel;
    };
    Object.defineProperty(patched,"__thebeGptLiveBridge",{value:true});
    proto.createDataChannel=patched;
    bridgeInstalled=true;
    return true;
  }

  function install(){
    if(installed)return true;
    installDataChannelBridge();
    if(typeof global.apiJson!=="function")return false;
    originalApi=global.apiJson;
    const wrapped=(url,options)=>request(url,options);
    Object.defineProperty(wrapped,"__thebeLivePreviewFallback",{value:true});
    global.apiJson=wrapped;
    installed=true;
    emit({installed:true,bridgeInstalled});
    return true;
  }

  function scheduleInstall(){
    if(install())return;
    let attempts=0;
    const timer=global.setInterval?.(()=>{
      attempts+=1;
      installDataChannelBridge();
      if(install()||attempts>=40)global.clearInterval?.(timer);
    },50);
  }

  if(global.document?.readyState==="loading")global.document.addEventListener("DOMContentLoaded",scheduleInstall,{once:true});
  else scheduleInstall();

  global.ThebeLivePreviewFallback=Object.freeze({
    release:RELEASE,
    install,
    request,
    readPreviewStatus,
    retryablePreviewError,
    previewClientCompatible,
    legacyEventsForGptLive,
    delegationTaskText,
    governedResultVerified,
    handlePreviewDelegation,
    state:()=>({installed,bridgeInstalled,status:previewStatus,statusCheckedAt,activeRuntime,activeSessionId,latestInputEndMs,pendingDelegations:activeDelegations.size})
  });
})(window);
