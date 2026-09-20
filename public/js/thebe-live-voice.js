(function(global){
  "use strict";

  const RELEASE="20260920d";
  const DELEGATION_TOOL="delegate_to_thebe_backend";
  const MAX_TRANSCRIPT_CHARS=6000;
  const CLOSE_TIMEOUT_MS=15000;
  let pc=null,dc=null,media=null,remoteAudio=null,sessionId=null,sessionTimer=null,closeTimer=null;
  let inputTranscript="",outputTranscript="",state="idle",button=null,statusEl=null,transcriptRevision=0,maxSessionSeconds=600,lastError=null;
  const activeDelegations=new Set();

  const api=(url,options={})=>{
    if(typeof global.apiJson!=="function")throw new Error("The secure Thebe API transport is not available.");
    return global.apiJson(url,options);
  };
  const text=(value,max=500)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
  const emit=(name,detail={})=>{
    try{global.dispatchEvent(new CustomEvent(name,{detail}))}catch{}
  };
  function showStatus(message,kind="info"){
    if(!statusEl)return;
    statusEl.textContent=text(message,320);
    statusEl.dataset.kind=kind;
    statusEl.hidden=!statusEl.textContent;
  }

  const setState=(next,detail={})=>{
    state=next;
    if(button){
      button.textContent=next==="connected"?"End Thebe voice":next==="connecting"?"Connecting…":next==="closing"?"Ending…":"Talk to Thebe";
      button.disabled=next==="connecting"||next==="closing";
      button.setAttribute("aria-pressed",next==="connected"?"true":"false");
    }
    if(!detail.preserveStatus){
      if(next==="connecting")showStatus("Connecting securely to Thebe voice…");
      else if(next==="connected")showStatus("Thebe voice is connected. You can speak now.","success");
      else if(next==="closing")showStatus("Ending the voice session…");
      else if(next==="idle")showStatus("");
    }
    emit("thebe-live-state",{state:next,sessionId,...detail});
  };

  function rememberError(message,stage="runtime",detail={}){
    lastError=Object.freeze({
      at:new Date().toISOString(),
      stage,
      message:text(message||"Thebe live voice error",320),
      ...detail
    });
    showStatus(lastError.message,"error");
    emit("thebe-live-error",lastError);
  }

  function friendlyStartError(error){
    const name=String(error?.name||"");
    const raw=text(error?.message||error||"Thebe live voice could not start.",320);
    if(name==="NotAllowedError"||name==="PermissionDeniedError")return "Microphone permission is blocked. Allow microphone access for thebedesk.com, then try again.";
    if(name==="NotFoundError")return "No microphone was found on this device.";
    if(name==="NotReadableError")return "The microphone is busy or unavailable. Close other apps using it and try again.";
    if(/429|rate.?limit/i.test(raw))return "Thebe voice has reached its temporary session limit. Try again later.";
    if(/401|403|unauth|forbidden/i.test(raw))return "Your session is not authorized for Thebe voice. Sign in again and retry.";
    if(/upstream|502|OpenAI|live_session_create_failed/i.test(raw))return "The voice provider rejected the session. Thebe recorded a safe diagnostic code for review.";
    return raw||"Thebe live voice could not start.";
  }

  const cap=value=>String(value||"").slice(-MAX_TRANSCRIPT_CHARS);

  function sendEvent(event){
    if(!dc||dc.readyState!=="open")throw new Error("Thebe live data channel is not open.");
    dc.send(JSON.stringify(event));
  }

  function transcriptDelta(event){
    const delta=String(event?.delta??event?.text??"");
    if(!delta)return;
    if(event.type==="conversation.item.input_audio_transcription.delta"){
      inputTranscript=cap(inputTranscript+delta);
    }
    if(event.type==="response.output_audio_transcript.delta"){
      outputTranscript=cap(outputTranscript+delta);
    }
  }

  function sendFunctionOutput(callId,payload){
    sendEvent({
      type:"conversation.item.create",
      item:{
        type:"function_call_output",
        call_id:callId,
        output:JSON.stringify(payload)
      }
    });
    sendEvent({type:"response.create"});
  }

  async function handleFunctionCall(item){
    if(item?.type!=="function_call"||item?.name!==DELEGATION_TOOL)return;
    const callId=text(item?.call_id||item?.id,240);
    if(!callId||activeDelegations.has(callId))return;
    activeDelegations.add(callId);
    const revision=transcriptRevision;
    let taskText="",intent="analyze",task=null;
    try{
      const args=JSON.parse(String(item?.arguments||"{}"));
      taskText=text(args?.request,2400);
      intent=String(args?.intent||"analyze").trim().toLowerCase()==="prepare_internal_task"
        ?"prepare_internal_task"
        :"analyze";
      if(intent==="prepare_internal_task"&&args?.task&&typeof args.task==="object"&&!Array.isArray(args.task)){
        const priority=String(args.task.priority||"medium").trim().toLowerCase();
        task={
          title:text(args.task.title,160),
          description:text(args.task.description,1200)||null,
          priority:["high","medium","low"].includes(priority)?priority:"medium",
          dueAt:text(args.task.dueAt,80)||null
        };
      }
    }catch{}
    try{
      if(!taskText){
        sendFunctionOutput(callId,{
          ok:false,
          error:"delegation_request_missing",
          message:"I could not reliably capture the business request. Ask the user to repeat it.",
          executionPerformed:false
        });
        return;
      }
      showStatus(intent==="prepare_internal_task"?"Thebe is preparing the governed task draft…":"Thebe is checking your business data…");
      emit("thebe-live-delegation",{delegationId:callId,sessionId,taskText,intent});
      const result=await api("/api/agentic/live/delegation",{
        method:"POST",
        body:JSON.stringify({delegationId:callId,sessionId,taskText,intent,task})
      });
      if(revision!==transcriptRevision){
        const taskPrepared=result?.authority?.taskPrepared===true;
        emit("thebe-live-delegation-stale",{delegationId:callId,sessionId,revision,currentRevision:transcriptRevision,taskPrepared,requestId:result?.requestId||null});
        sendFunctionOutput(callId,{
          ok:false,
          stale:true,
          taskPrepared,
          requestId:result?.requestId||null,
          message:taskPrepared
            ?"The user spoke again after a governed internal task draft was prepared. Do not claim cancellation. Tell the user the draft still exists pending owner approval, then continue from the latest user input."
            :"The user spoke again before the governed result was ready. Do not present the stale result; continue from the latest user input.",
          executionPerformed:false
        });
        return;
      }
      sendFunctionOutput(callId,result?.toolOutput||{
        ok:result?.ok===true,
        content:text(result?.content||"The governed Thebe backend completed the request.",1800),
        authority:result?.authority||{executionPerformed:false}
      });
      showStatus("Thebe voice is connected. You can keep speaking.","success");
    }catch(error){
      try{
        sendFunctionOutput(callId,{
          ok:false,
          error:"governed_backend_unavailable",
          message:"The governed Thebe backend could not complete that request. No business action was executed.",
          executionPerformed:false
        });
      }catch{}
      rememberError(error?.message||"Delegation failed","delegation");
    }finally{
      activeDelegations.delete(callId);
    }
  }

  function handleServerEvent(raw){
    let event;
    try{event=JSON.parse(String(raw||""))}catch{return}
    transcriptDelta(event);
    if(event.type==="input_audio_buffer.speech_started"){
      transcriptRevision+=1;
      if(state==="connected")showStatus("Listening…");
    }
    if(event.type==="input_audio_buffer.speech_stopped"&&state==="connected")showStatus("Thinking…");
    if(event.type==="session.created"||event.type==="session.updated"){
      sessionId=text(event?.session?.id||sessionId,240)||sessionId;
    }
    if(event.type==="response.done"){
      const output=Array.isArray(event?.response?.output)?event.response.output:[];
      let delegated=false;
      for(const item of output){
        if(item?.type==="function_call"&&item?.name===DELEGATION_TOOL){
          delegated=true;
          handleFunctionCall(item);
        }
      }
      if(!delegated&&state==="connected")showStatus("Thebe voice is connected. You can keep speaking.","success");
    }
    if(event.type==="session.closed"){
      if(closeTimer){clearTimeout(closeTimer);closeTimer=null}
      cleanup("idle",{message:"Voice session ended.",success:true});
      return;
    }
    if(event.type==="error"){
      const code=text(event?.error?.code||event?.code,120)||null;
      const message=text(event?.error?.message||event?.message||"The realtime voice service reported an error.",320);
      rememberError(code?message+" ("+code+")":message,"realtime",{code,eventId:text(event?.event_id,160)||null});
    }
    emit("thebe-live-event",{event});
  }

  function waitForIce(peer,timeoutMs=5000){
    if(peer.iceGatheringState==="complete")return Promise.resolve();
    return new Promise(resolve=>{
      let settled=false;
      const done=()=>{
        if(settled)return;
        settled=true;
        peer.removeEventListener("icegatheringstatechange",onChange);
        clearTimeout(timer);
        resolve();
      };
      const onChange=()=>{if(peer.iceGatheringState==="complete")done()};
      const timer=setTimeout(done,timeoutMs);
      peer.addEventListener("icegatheringstatechange",onChange);
    });
  }

  async function start(){
    if(state==="connecting"||state==="connected")return {state,sessionId};
    if(!global.isSecureContext)throw new Error("Thebe live voice requires HTTPS.");
    if(!global.RTCPeerConnection||!navigator.mediaDevices?.getUserMedia)throw new Error("This browser does not support Thebe live voice.");

    const status=await api("/api/agentic/live/status");
    if(status?.sessionCreationAllowed!==true){
      const gate=text(status?.gateCode,120);
      if(status?.runtimeKillSwitch)throw new Error("Thebe live voice is paused by the runtime safety switch.");
      if(gate==="tenant_session_rate_limited"||gate==="user_session_rate_limited")throw new Error("Thebe voice session limit has been reached temporarily.");
      if(gate==="live_failure_circuit_open")throw new Error("Thebe voice is temporarily paused after repeated provider failures.");
      throw new Error("Thebe live voice is not enabled for this workspace.");
    }

    setState("connecting");
    inputTranscript="";outputTranscript="";sessionId=null;transcriptRevision=0;lastError=null;
    maxSessionSeconds=Math.max(60,Math.min(1800,Number(status?.maxSessionSeconds||600)));
    try{
      media=await navigator.mediaDevices.getUserMedia({audio:true});
      remoteAudio=document.createElement("audio");
      remoteAudio.autoplay=true;
      remoteAudio.setAttribute("aria-hidden","true");
      remoteAudio.style.display="none";
      document.body.append(remoteAudio);

      pc=new RTCPeerConnection();
      pc.addEventListener("connectionstatechange",()=>{
        const next=pc?.connectionState||"unknown";
        emit("thebe-live-peer-state",{connectionState:next,iceConnectionState:pc?.iceConnectionState||"unknown"});
        if(next==="failed")rememberError("The WebRTC voice connection failed. Check your network and try again.","webrtc");
      });
      pc.addEventListener("track",event=>{
        const stream=event.streams?.[0];
        if(stream)remoteAudio.srcObject=stream;
      });
      media.getTracks().forEach(track=>pc.addTrack(track,media));

      dc=pc.createDataChannel("oai-events");
      dc.addEventListener("open",()=>setState("connected"));
      dc.addEventListener("message",event=>handleServerEvent(event.data));
      dc.addEventListener("close",()=>{
        if(state!=="closing")cleanup("idle",{message:lastError?.message||"Voice connection closed."});
      });
      dc.addEventListener("error",()=>rememberError("Thebe live data channel failed.","data_channel"));

      const offer=await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIce(pc);
      const session=await api("/api/agentic/live/session",{
        method:"POST",
        body:JSON.stringify({sdp:pc.localDescription?.sdp||offer.sdp})
      });
      sessionId=text(session?.session?.id,240)||null;
      const answerSdp=String(session?.transport?.sdp||"");
      if(!answerSdp)throw new Error("Thebe live session did not return a WebRTC answer.");
      await pc.setRemoteDescription({type:"answer",sdp:answerSdp});
      const serverLimit=Number(session?.limits?.maxSessionSeconds||maxSessionSeconds);
      maxSessionSeconds=Math.max(60,Math.min(1800,Number.isFinite(serverLimit)?serverLimit:600));
      sessionTimer=setTimeout(()=>{
        emit("thebe-live-session-limit",{sessionId,maxSessionSeconds});
        stop();
      },maxSessionSeconds*1000);
      return {state:"connecting",sessionId,maxSessionSeconds};
    }catch(error){
      cleanup("idle",{preserveStatus:true});
      throw error;
    }
  }

  function cleanup(nextState="idle",options={}){
    try{dc?.close()}catch{}
    try{pc?.close()}catch{}
    try{media?.getTracks?.().forEach(track=>track.stop())}catch{}
    try{if(remoteAudio){remoteAudio.srcObject=null;remoteAudio.remove()}}catch{}
    pc=null;dc=null;media=null;remoteAudio=null;sessionId=null;
    if(sessionTimer){clearTimeout(sessionTimer);sessionTimer=null}
    if(closeTimer){clearTimeout(closeTimer);closeTimer=null}
    activeDelegations.clear();
    setState(nextState,{preserveStatus:options.preserveStatus||Boolean(options.message)});
    if(options.message)showStatus(options.message,options.success?"success":"info");
  }

  function stop(){
    if(state==="closing")return;
    if(state==="connected"&&dc?.readyState==="open"){
      setState("closing");
      try{
        sendEvent({
          type:"session.close",
          event_id:global.crypto?.randomUUID?.()||String(Date.now())
        });
        closeTimer=setTimeout(()=>{
          rememberError("The voice session did not confirm a graceful close; the local connection was ended.","close_timeout");
          cleanup("idle",{preserveStatus:true});
        },CLOSE_TIMEOUT_MS);
      }catch(error){
        rememberError(error?.message||"The voice session could not close cleanly.","close");
        cleanup("idle",{preserveStatus:true});
      }
      return;
    }
    cleanup("idle");
  }

  async function maybeMount(){
    let status;
    try{status=await api("/api/agentic/live/status")}catch{return}
    if(status?.sessionCreationAllowed!==true)return;
    const host=document.querySelector("#ownerAgenticPanel .owner-agentic-head")||document.querySelector("#ownerAgenticPanel");
    if(!host||document.getElementById("thebeLiveVoiceButton"))return;
    button=document.createElement("button");
    button.type="button";
    button.id="thebeLiveVoiceButton";
    button.className="btn soft";
    button.textContent="Talk to Thebe";
    button.setAttribute("aria-pressed","false");

    statusEl=document.createElement("span");
    statusEl.id="thebeLiveVoiceStatus";
    statusEl.className="muted";
    statusEl.setAttribute("role","status");
    statusEl.setAttribute("aria-live","polite");
    statusEl.hidden=true;

    button.addEventListener("click",async()=>{
      if(state==="connected"||state==="connecting"||state==="closing"){stop();return}
      try{await start()}catch(error){
        const message=friendlyStartError(error);
        cleanup("idle",{preserveStatus:true});
        rememberError(message,"start",{name:text(error?.name,120)||null});
      }
    });
    host.append(button,statusEl);
  }

  function boot(){
    setTimeout(maybeMount,350);
    const dashboard=document.querySelector("#dashboard");
    if(dashboard){
      new MutationObserver(()=>{
        if(dashboard.classList.contains("active"))setTimeout(maybeMount,250);
      }).observe(dashboard,{attributes:true,attributeFilter:["class"]});
    }
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();

  global.ThebeLiveVoice=Object.freeze({
    release:RELEASE,
    start,
    stop,
    status:()=>({state,sessionId,inputTranscript,outputTranscript,transcriptRevision,maxSessionSeconds,lastError}),
    diagnostics:()=>({
      release:RELEASE,
      state,
      sessionId,
      secureContext:global.isSecureContext,
      peerConnectionState:pc?.connectionState||null,
      iceConnectionState:pc?.iceConnectionState||null,
      dataChannelState:dc?.readyState||null,
      microphoneTracks:media?.getAudioTracks?.().map(track=>({readyState:track.readyState,enabled:track.enabled,muted:track.muted}))||[],
      lastError
    })
  });
})(window);
