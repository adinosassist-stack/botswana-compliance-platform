(function(global){
  "use strict";

  const RELEASE="20260920i";
  const DELEGATION_TOOL="delegate_to_thebe_backend";
  const MAX_TRANSCRIPT_CHARS=6000;
  const CLOSE_TIMEOUT_MS=15000;
  const DELEGATION_DRAIN_TIMEOUT_MS=12000;
  let pc=null,dc=null,media=null,remoteAudio=null,sessionId=null,sessionTimer=null,closeTimer=null,delegationDrainTimer=null;
  const audioMeters=[];
  let inputTranscript="",outputTranscript="",state="idle",button=null,statusEl=null,transcriptRevision=0,maxSessionSeconds=600,lastError=null,closeRequested=false,sessionMode="workspace";
  const activeDelegations=new Set();

  let publicTransport=null;
  const api=(url,options={})=>{
    if(typeof global.apiJson==="function")return global.apiJson(url,options);
    if(!publicTransport&&typeof global.BW?.api?.createClient==="function"){
      publicTransport=global.BW.api.createClient({
        getCsrfToken:()=>"",
        onUnauthorized:()=>{},
        onError:()=>{}
      });
    }
    if(publicTransport?.request)return publicTransport.request(url,options);
    throw new Error("The secure Thebe API transport is not available.");
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
    emit("thebe-live-state",{state:next,sessionId,mode:sessionMode,...detail});
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
    const providerCode=String(error?.data?.providerCode||error?.body?.providerCode||"");
    if(providerCode==="billing_not_active")return "The public voice sample is temporarily unavailable while API billing is being activated.";
    if(/429|rate.?limit|marketing_session_rate_limited/i.test(raw))return sessionMode==="marketing"
      ?"The public voice sample has reached its temporary limit. Please try again later or sign in to use your workspace."
      :"Thebe voice has reached its temporary session limit. Try again later.";
    if(/401|403|unauth|forbidden/i.test(raw))return "Your session is not authorized for Thebe voice. Sign in again and retry.";
    if(/upstream|502|OpenAI|live_session_create_failed/i.test(raw))return "The voice provider rejected the session. Thebe recorded a safe diagnostic code for review.";
    return raw||"Thebe live voice could not start.";
  }

  const cap=value=>String(value||"").slice(-MAX_TRANSCRIPT_CHARS);

  function stopAudioMeters(){
    while(audioMeters.length){
      const meter=audioMeters.pop();
      try{cancelAnimationFrame(meter.raf)}catch{}
      try{meter.source?.disconnect()}catch{}
      try{meter.analyser?.disconnect()}catch{}
      try{meter.context?.close()}catch{}
    }
    emit("thebe-live-audio-level",{channel:"all",level:0});
  }

  function startAudioMeter(stream,channel){
    if(!stream)return;
    const AudioContextCtor=global.AudioContext||global.webkitAudioContext;
    if(!AudioContextCtor)return;
    try{
      const context=new AudioContextCtor();
      const analyser=context.createAnalyser();
      analyser.fftSize=256;
      analyser.smoothingTimeConstant=.78;
      const source=context.createMediaStreamSource(stream);
      source.connect(analyser);
      const samples=new Uint8Array(analyser.fftSize);
      const meter={context,analyser,source,raf:0,channel};
      const frame=()=>{
        analyser.getByteTimeDomainData(samples);
        let sum=0;
        for(let i=0;i<samples.length;i++){
          const centered=(samples[i]-128)/128;
          sum+=centered*centered;
        }
        const rms=Math.sqrt(sum/samples.length);
        const level=Math.max(0,Math.min(1,rms*5.5));
        emit("thebe-live-audio-level",{channel,level});
        meter.raf=requestAnimationFrame(frame);
      };
      audioMeters.push(meter);
      meter.raf=requestAnimationFrame(frame);
    }catch{}
  }

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

  function sendSessionClose(){
    if(state!=="closing"||closeTimer||!dc||dc.readyState!=="open")return;
    closeRequested=false;
    if(delegationDrainTimer){clearTimeout(delegationDrainTimer);delegationDrainTimer=null}
    showStatus("Ending the voice session…");
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
  }

  function maybeSendSessionClose(){
    if(state!=="closing"||!closeRequested||activeDelegations.size>0)return;
    sendSessionClose();
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
      const taskPrepared=result?.authority?.taskPrepared===true;
      emit("thebe-live-delegation-complete",{delegationId:callId,sessionId,intent,taskPrepared,requestId:result?.requestId||null});
      if(state==="idle"||(state==="closing"&&closeTimer)){
        emit("thebe-live-delegation-after-close",{delegationId:callId,sessionId,intent,taskPrepared,requestId:result?.requestId||null});
        if(taskPrepared)showStatus("Voice ended while a task draft finished. It still requires owner approval.","info");
        return;
      }
      if(revision!==transcriptRevision){
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
      emit("thebe-live-delegation-result",{delegationId:callId,sessionId,intent,result});
      if(state==="connected")showStatus("Thebe voice is connected. You can keep speaking.","success");
      else if(state==="closing")showStatus("Governed work finished. Ending voice…");
    }catch(error){
      if(state==="idle"||(state==="closing"&&closeTimer)){
        emit("thebe-live-delegation-after-close",{delegationId:callId,sessionId,intent,error:text(error?.message||"Delegation failed",240)});
      }else{
        try{
          sendFunctionOutput(callId,{
            ok:false,
            error:"governed_backend_unavailable",
            message:"The governed Thebe backend could not complete that request. No business action was executed.",
            executionPerformed:false
          });
        }catch{}
        rememberError(error?.message||"Delegation failed","delegation");
      }
    }finally{
      activeDelegations.delete(callId);
      maybeSendSessionClose();
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
    if(event.type==="session.started"||event.type==="session.created"||event.type==="session.updated"){
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

  async function start(options={}){
    if(state==="connecting"||state==="connected")return {state,sessionId,mode:sessionMode};
    if(!global.isSecureContext)throw new Error("Thebe live voice requires HTTPS.");
    if(!global.RTCPeerConnection||!navigator.mediaDevices?.getUserMedia)throw new Error("This browser does not support Thebe live voice.");

    sessionMode=String(options?.mode||"workspace")==="marketing"?"marketing":"workspace";
    const requestApi=api;
    const statusPath=sessionMode==="marketing"?"/api/agentic/live/marketing/status":"/api/agentic/live/status";
    const status=await requestApi(statusPath);
    if(status?.sessionCreationAllowed!==true){
      const gate=text(status?.gateCode,120);
      if(status?.runtimeKillSwitch)throw new Error("Thebe live voice is paused by the runtime safety switch.");
      if(gate==="tenant_session_rate_limited"||gate==="user_session_rate_limited"||gate==="marketing_session_rate_limited")throw new Error("Thebe voice session limit has been reached temporarily.");
      if(gate==="live_failure_circuit_open")throw new Error("Thebe voice is temporarily paused after repeated provider failures.");
      throw new Error(sessionMode==="marketing"?"The public Thebe voice sample is not available right now.":"Thebe live voice is not enabled for this workspace.");
    }

    setState("connecting");
    inputTranscript="";outputTranscript="";sessionId=null;transcriptRevision=0;lastError=null;
    const minimum=sessionMode==="marketing"?30:60;
    maxSessionSeconds=Math.max(minimum,Math.min(1800,Number(status?.maxSessionSeconds||(sessionMode==="marketing"?60:600))));
    try{
      media=await navigator.mediaDevices.getUserMedia({audio:true});
      startAudioMeter(media,"input");
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
        if(stream){remoteAudio.srcObject=stream;startAudioMeter(stream,"output")}
      });
      media.getTracks().forEach(track=>pc.addTrack(track,media));

      dc=pc.createDataChannel("oai-events");
      dc.addEventListener("open",()=>{
        setState("connected");
        if(sessionMode==="marketing"){
          try{sendEvent({type:"response.create",response:{instructions:"Greet the visitor in one short sentence as Thebe, then invite them to ask what Thebe Desk does or to ask about a feature."}})}catch{}
        }
      });
      dc.addEventListener("message",event=>handleServerEvent(event.data));
      dc.addEventListener("close",()=>{
        if(state!=="closing")cleanup("idle",{message:lastError?.message||"Voice connection closed."});
      });
      dc.addEventListener("error",()=>rememberError("Thebe live data channel failed.","data_channel"));

      const offer=await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIce(pc);
      const sessionPath=sessionMode==="marketing"?"/api/agentic/live/marketing/session":"/api/agentic/live/session";
      const session=await requestApi(sessionPath,{
        method:"POST",
        body:JSON.stringify({sdp:pc.localDescription?.sdp||offer.sdp})
      });
      sessionId=text(session?.session?.id,240)||null;
      const answerSdp=String(session?.transport?.sdp||"");
      if(!answerSdp)throw new Error("Thebe live session did not return a WebRTC answer.");
      await pc.setRemoteDescription({type:"answer",sdp:answerSdp});
      const serverLimit=Number(session?.limits?.maxSessionSeconds||maxSessionSeconds);
      maxSessionSeconds=Math.max(sessionMode==="marketing"?30:60,Math.min(1800,Number.isFinite(serverLimit)?serverLimit:(sessionMode==="marketing"?60:600)));
      sessionTimer=setTimeout(()=>{
        emit("thebe-live-session-limit",{sessionId,maxSessionSeconds});
        stop();
      },maxSessionSeconds*1000);
      return {state:"connecting",sessionId,maxSessionSeconds,mode:sessionMode};
    }catch(error){
      cleanup("idle",{preserveStatus:true});
      throw error;
    }
  }

  function cleanup(nextState="idle",options={}){
    stopAudioMeters();
    try{dc?.close()}catch{}
    try{pc?.close()}catch{}
    try{media?.getTracks?.().forEach(track=>track.stop())}catch{}
    try{if(remoteAudio){remoteAudio.srcObject=null;remoteAudio.remove()}}catch{}
    pc=null;dc=null;media=null;remoteAudio=null;sessionId=null;
    if(sessionTimer){clearTimeout(sessionTimer);sessionTimer=null}
    if(closeTimer){clearTimeout(closeTimer);closeTimer=null}
    if(delegationDrainTimer){clearTimeout(delegationDrainTimer);delegationDrainTimer=null}
    closeRequested=false;
    activeDelegations.clear();
    setState(nextState,{preserveStatus:options.preserveStatus||Boolean(options.message)});
    if(options.message)showStatus(options.message,options.success?"success":"info");
  }

  function stop(){
    if(state==="closing")return;
    if(state==="connected"&&dc?.readyState==="open"){
      setState("closing");
      closeRequested=true;
      try{media?.getAudioTracks?.().forEach(track=>{track.enabled=false})}catch{}
      if(activeDelegations.size>0){
        showStatus("Finishing governed work before ending voice…");
        delegationDrainTimer=setTimeout(()=>{
          delegationDrainTimer=null;
          if(state!=="closing"||!closeRequested)return;
          emit("thebe-live-delegation-drain-timeout",{sessionId,pendingDelegations:activeDelegations.size});
          sendSessionClose();
        },DELEGATION_DRAIN_TIMEOUT_MS);
        return;
      }
      sendSessionClose();
      return;
    }
    cleanup("idle");
  }

  async function maybeMount(){
    let status;
    try{status=await api("/api/agentic/live/status")}catch{return}
    if(status?.sessionCreationAllowed!==true)return;
    const host=document.querySelector("#thebeAiDockVoiceMount")||document.querySelector("#ownerAgenticPanel .owner-agentic-head")||document.querySelector("#ownerAgenticPanel");
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
    status:()=>({state,sessionId,mode:sessionMode,inputTranscript,outputTranscript,transcriptRevision,maxSessionSeconds,lastError,pendingDelegations:activeDelegations.size,closeRequested}),
    diagnostics:()=>({
      release:RELEASE,
      state,
      sessionId,
      mode:sessionMode,
      secureContext:global.isSecureContext,
      peerConnectionState:pc?.connectionState||null,
      iceConnectionState:pc?.iceConnectionState||null,
      dataChannelState:dc?.readyState||null,
      pendingDelegations:activeDelegations.size,
      closeRequested,
      microphoneTracks:media?.getAudioTracks?.().map(track=>({readyState:track.readyState,enabled:track.enabled,muted:track.muted}))||[],
      lastError
    })
  });
})(window);


(function(global){
  "use strict";

  const DOCK_RELEASE="20260920f";
  const STORE_KEY="thebe_ai_dock_collapsed_v4";
  const MAX_QUESTION=1000;
  const MOBILE_DOCK_MAX=650;
  let dock=null,pill=null,pillLabel=null,orb=null,voiceLabel=null,voiceSub=null,transcriptBox=null,responseBox=null,input=null,sendButton=null,attentionButton=null,quick=null,foot=null;
  let textBusy=false,voiceInput="",voiceOutput="",voicePhase="idle",collapsed=false;

  const api=(url,options={})=>{
    if(typeof global.apiJson!=="function")throw new Error("The secure Thebe API transport is not available.");
    return global.apiJson(url,options);
  };
  const clean=(value,max=600)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
  const el=(tag,className,textValue)=>{
    const item=document.createElement(tag);
    if(className)item.className=className;
    if(textValue!==undefined&&textValue!==null)item.textContent=String(textValue);
    return item;
  };
  function safeSessionGet(key){try{return sessionStorage.getItem(key)}catch{return null}}
  function safeSessionSet(key,value){try{sessionStorage.setItem(key,value)}catch{}}
  function mobileDockMode(){
    try{return global.matchMedia?.(`(max-width: ${MOBILE_DOCK_MAX}px)`)?.matches??global.innerWidth<=MOBILE_DOCK_MAX}
    catch{return global.innerWidth<=MOBILE_DOCK_MAX}
  }
  function effectiveCollapsed(){return mobileDockMode()&&collapsed}
  function shellVisible(){
    const shell=document.getElementById("appShell");
    if(!shell)return false;
    const style=getComputedStyle(shell);
    return style.display!=="none"&&style.visibility!=="hidden";
  }
  function publicSurfaceVisible(){
    const gate=document.getElementById("marketingGate");
    if(!gate)return false;
    const style=getComputedStyle(gate);
    return !gate.classList.contains("hidden")&&style.display!=="none"&&style.visibility!=="hidden";
  }
  function surfaceMode(){
    if(shellVisible())return "workspace";
    if(publicSurfaceVisible())return "public";
    return "hidden";
  }
  function activeContext(){
    const active=document.querySelector(".view.active");
    const id=clean(active?.id||"workspace",80);
    const title=clean(document.getElementById("pageTitle")?.textContent||id||"Workspace",100);
    return {id,title};
  }
  function contextualQuestion(question){
    const q=clean(question,MAX_QUESTION);
    const context=activeContext();
    const prefix=`Current Thebe Desk screen: ${context.title} (${context.id}). `;
    return (prefix+q).slice(0,MAX_QUESTION);
  }
  function openView(id){
    const button=[...document.querySelectorAll("[data-view]")].find(item=>item.dataset.view===id);
    if(button){button.click();return true}
    if(typeof global.showView==="function")return global.showView(id)!==false;
    return false;
  }
  function setCollapsed(next){
    if(!mobileDockMode()){
      collapsed=false;
      syncVisibility();
      return;
    }
    collapsed=Boolean(next);
    safeSessionSet(STORE_KEY,collapsed?"1":"0");
    syncVisibility();
  }
  function syncVisibility(){
    if(!dock||!pill)return;
    const surface=surfaceMode(),visible=surface!=="hidden",workspace=surface==="workspace",mobile=mobileDockMode(),isCollapsed=effectiveCollapsed();
    dock.hidden=!visible||isCollapsed;
    pill.hidden=!visible||!isCollapsed;
    dock.dataset.surface=surface;
    pill.dataset.surface=surface;
    dock.dataset.workspaceVisible=workspace?"1":"0";
    pill.dataset.workspaceVisible=workspace?"1":"0";
    if(attentionButton)attentionButton.hidden=!workspace;
    const minimize=dock.querySelector(".thebe-ai-minimize");
    if(minimize)minimize.hidden=!mobile;
    const presence=dock.querySelector(".thebe-ai-presence");
    if(presence){
      presence.replaceChildren(el("span","thebe-ai-presence-dot"),document.createTextNode(workspace?"Available across this workspace":"Public assistant · sign in for your workspace"));
    }
    if(voicePhase==="idle"){
      if(workspace)setPhase("idle","Voice ready","Tap the particles or Talk to Thebe");
      else if(surface==="public")setPhase("idle","Try Thebe voice","Tap the particles and ask about Thebe Desk");
    }
    if(input)input.placeholder=workspace?"Ask Thebe anything…":"Ask about Thebe Desk…";
    if(pillLabel)pillLabel.textContent=workspace?"Thebe":"Ask Thebe";
    renderQuickActions(surface);
    if(foot)foot.textContent=workspace
      ?"Advisory by default · governed actions still require the existing approval controls."
      :"Public sample · no workspace data · voice sample limited to 60 seconds.";
    document.body.classList.toggle("thebe-ai-dock-open",workspace&&!isCollapsed);
  }
  function recoverVisibility(){
    if(!dock||!pill)return;
    syncVisibility();
    const surface=surfaceMode(),isCollapsed=effectiveCollapsed();
    if(surface!=="hidden"&&!isCollapsed){
      dock.hidden=false;
      pill.hidden=true;
      document.body.classList.toggle("thebe-ai-dock-open",surface==="workspace");
    }
  }
  function setPhase(phase,label,sub){
    voicePhase=phase||"idle";
    if(orb)orb.dataset.phase=voicePhase;
    if(voiceLabel&&label)voiceLabel.textContent=label;
    if(voiceSub)voiceSub.textContent=sub||"";
  }
  function syncAttention(){
    if(!attentionButton||!pill)return;
    const raw=clean(document.getElementById("navAlerts")?.textContent,20);
    const count=Math.max(0,Number.parseInt(raw||"0",10)||0);
    attentionButton.textContent=count?String(count):"";
    attentionButton.setAttribute("aria-label",count?`${count} work item${count===1?"":"s"} need attention`:"No urgent work items");
    if(count)pill.dataset.attention=String(count);else delete pill.dataset.attention;
  }
  function renderVoiceTranscript(){
    if(!transcriptBox)return;
    transcriptBox.replaceChildren();
    const user=clean(voiceInput,360),assistant=clean(voiceOutput,360);
    if(!user&&!assistant){transcriptBox.hidden=true;return}
    transcriptBox.hidden=false;
    if(user){
      const line=el("div","thebe-ai-live-line"),label=el("b","", "You");
      line.append(label,document.createTextNode(user));
      transcriptBox.append(line);
    }
    if(assistant){
      const line=el("div","thebe-ai-live-line"),label=el("b","", "Thebe");
      line.append(label,document.createTextNode(assistant));
      transcriptBox.append(line);
    }
  }
  function responseMessage(message,state="ready"){
    if(!responseBox)return;
    responseBox.dataset.state=state;
    responseBox.replaceChildren(el("div","thebe-ai-response-title",state==="thinking"?"Thebe is working":"Thebe"),el("div","thebe-ai-response-answer",message));
  }
  function renderResult(result){
    if(!responseBox)return;
    responseBox.dataset.state="ready";
    responseBox.replaceChildren();
    responseBox.append(el("div","thebe-ai-response-title",result?.generationMode==="workers_ai"?"Grounded workspace response":"Thebe workspace response"));
    responseBox.append(el("div","thebe-ai-response-answer",clean(result?.answer||"No grounded answer was returned.",1800)));
    const actions=Array.isArray(result?.actions)?result.actions.slice(0,3):[];
    for(const action of actions){
      const card=el("div","thebe-ai-action");
      card.append(el("b","",clean(action?.title||"Suggested follow-up",180)));
      if(action?.reason)card.append(el("span","",clean(action.reason,320)));
      responseBox.append(card);
    }
    const caveats=Array.isArray(result?.caveats)?result.caveats.slice(0,2):[];
    if(caveats.length)responseBox.append(el("div","thebe-ai-boundary",caveats.map(item=>clean(item,220)).filter(Boolean).join(" · ")));
    const open=el("button","thebe-ai-open-full","Open full Thebe AI →");
    open.type="button";
    open.addEventListener("click",()=>{openView("automationhub");if(innerWidth<900)setCollapsed(true)});
    responseBox.append(open);
  }
  function showPublicSignIn(message){
    responseMessage(message||"Sign in to use Thebe with your business workspace.");
    if(!responseBox)return;
    const actions=el("div","thebe-ai-public-actions");
    const signIn=el("button","thebe-ai-public-signin","Sign in");
    signIn.type="button";
    signIn.addEventListener("click",()=>global.location.assign("/auth/?mode=login&next=%2Fapp%2F"));
    const start=el("button","thebe-ai-public-start","Start 14-day trial");
    start.type="button";
    start.addEventListener("click",()=>global.location.assign("/auth/?mode=register"));
    actions.append(signIn,start);
    responseBox.append(actions);
  }
  function publishedPricing(){
    const cards=[...document.querySelectorAll("#pricing .pricecard")].slice(0,4);
    const values=cards.map(card=>{
      const name=clean(card.querySelector("h3")?.textContent,40);
      const price=clean(card.querySelector(".price")?.textContent,60);
      return name&&price?`${name} ${price}`:"";
    }).filter(Boolean);
    return values.length?values.join(" · "):"Monitor P149/month · Protect P349/month · Control P699/month · Network P1,299/month";
  }
  function marketingAnswer(question){
    const q=clean(question,MAX_QUESTION).toLowerCase();
    if(/price|pricing|cost|plan|subscription|trial/.test(q)){
      return `Thebe Desk has four published plans: ${publishedPricing()}. Every new workspace starts with a 14-day trial, so an SME can start lean and upgrade as it needs more locations, controls and AI capacity.`;
    }
    if(/cipa|burs|tax|vat|paye|licen[cs]e|compliance|regulat/.test(q)){
      return "Thebe Desk keeps recurring Botswana compliance work visible in one place: CIPA company records and annual-return work, BURS tax obligations, employment compliance, business and industrial licences, tender deadlines, controls and inspection-ready evidence. It turns confirmed obligations into practical actions and keeps the supporting proof attached.";
    }
    if(/employee|employment|hr|disciplin|leave|employer/.test(q)){
      return "Employer Shield organises employment contracts, fixed-term risk, warnings, disciplinary evidence, leave, grievances and high-risk decision gates around a defensible process. It is designed for employment-risk control and evidence rather than payroll processing.";
    }
    if(/tender|bid|passport|evidence|inspection|remediation/.test(q)){
      return "Tender Control tracks bid-specific requirements, mandatory evidence and closing dates. Compliance Passport can share scoped, revocable proof, while remediation and inspection-readiness workflows turn control failures into owned cases and evidence packs.";
    }
    if(/ai|thebe ai|agent|voice|assistant/.test(q)){
      return "Thebe AI is the decision-support layer inside Thebe Desk. In a signed-in workspace it can turn permitted business data into management briefs, explain risks and suggest next actions, while approvals, evidence and human judgement stay in control. This public dock is a safe sample and cannot access private workspace data.";
    }
    if(/account|finance|cash|reconcil|revenue|expense|bookkeep/.test(q)){
      return "Accounting and financial intelligence brings bookkeeping outputs into the management picture so owners can understand revenue, expenses, cash position, payroll and tax readiness. Thebe Desk analyses the business picture without pretending to replace the accounting ledger.";
    }
    if(/what is|what does|feature|how does|tell me|explain|thebe desk/.test(q)){
      return "Thebe Desk is Botswana SME compliance and business-risk software. It continuously helps owners and managers see what needs attention across compliance, employees, licences, tenders, evidence, operations and financial intelligence, then turns gaps into controlled next actions instead of scattered reminders and files.";
    }
    return "Ask me about Thebe Desk features, Botswana compliance workflows, Thebe AI, Employer Shield, tenders, evidence, financial intelligence or pricing. You can also tap the black-and-white particles to sample Thebe voice for up to one minute.";
  }
  function renderMarketingAnswer(question){
    responseMessage(marketingAnswer(question));
    if(!responseBox)return;
    const actions=el("div","thebe-ai-public-actions");
    const voice=el("button","thebe-ai-public-voice","Try voice");
    voice.type="button";
    voice.addEventListener("click",()=>orb?.parentElement?.click());
    const start=el("button","thebe-ai-public-start","Start 14-day trial");
    start.type="button";start.addEventListener("click",()=>global.location.assign("/auth/?mode=register"));
    actions.append(voice,start);
    responseBox.append(actions);
  }
  function renderQuickActions(surface){
    if(!quick)return;
    const mode=surface==="public"?"public":"workspace";
    if(quick.dataset.mode===mode)return;
    quick.dataset.mode=mode;
    quick.replaceChildren();
    if(mode==="public"){
      quick.append(
        quickButton("What is Thebe Desk?","30-second overview","ask","What is Thebe Desk and who is it for?"),
        quickButton("Compliance","CIPA, BURS, licences","ask","How does Thebe Desk help with Botswana SME compliance?"),
        quickButton("Thebe AI","Decision support","ask","What can Thebe AI do?"),
        quickButton("Pricing","Plans & trial","ask","What does Thebe Desk cost?")
      );
      return;
    }
    quick.append(
      quickButton("What changed?","Management brief","management_brief","Summarise what has changed or needs attention from the current workspace records. Be concise and distinguish confirmed facts from missing data."),
      quickButton("Today’s priorities","Next actions","next_actions","What needs management attention today? Prioritise the most important current workspace items."),
      quickButton("Cash position","Finance check","ask","Summarise the current cash position, collection risk and finance items needing attention. If finance data is incomplete, say exactly what is missing."),
      quickButton("Explain risk","Grounded evidence","explain_risk","Explain the highest current business-protection risk and the evidence behind it.")
    );
  }
  async function ask(mode,question){
    const q=clean(question,MAX_QUESTION);
    if(textBusy||q.length<3)return;
    if(!shellVisible()){
      renderMarketingAnswer(q);
      return;
    }
    textBusy=true;
    if(sendButton)sendButton.disabled=true;
    responseMessage("Reviewing the current workspace and this screen…","thinking");
    try{
      const result=await api("/api/ai/advisor",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({mode:mode||"ask",question:contextualQuestion(q)})
      });
      renderResult(result||{});
    }catch(error){
      const message=error?.status===402
        ?"AI credits or the configured cost cap do not allow this run."
        :clean(error?.message||"Thebe could not complete that workspace review.",320);
      responseMessage(message||"Thebe could not complete that workspace review.","error");
    }finally{
      textBusy=false;
      if(sendButton)sendButton.disabled=false;
    }
  }
  function quickButton(label,detail,mode,question){
    const button=el("button","",label);
    button.type="button";
    if(detail)button.append(el("small","",detail));
    button.addEventListener("click",()=>ask(mode,question));
    return button;
  }
  function mount(){
    if(document.getElementById("thebeAiDock"))return;
    const storedCollapse=safeSessionGet(STORE_KEY);
    collapsed=mobileDockMode()&&(storedCollapse==="1"||storedCollapse===null);

    dock=el("section","thebe-ai-dock");
    dock.id="thebeAiDock";
    dock.setAttribute("aria-label","Thebe AI assistant");
    dock.hidden=true;

    const head=el("div","thebe-ai-dock-head");
    const title=el("div","thebe-ai-dock-title");
    title.append(el("span","thebe-ai-mark","TD"));
    const titleCopy=el("div","thebe-ai-title-copy");
    titleCopy.append(el("b","","Thebe"));
    const presence=el("div","thebe-ai-presence");
    presence.append(el("span","thebe-ai-presence-dot"),document.createTextNode("Available across this workspace"));
    titleCopy.append(presence);title.append(titleCopy);

    const headActions=el("div","thebe-ai-head-actions");
    attentionButton=el("button","thebe-ai-attention","");
    attentionButton.type="button";
    attentionButton.addEventListener("click",()=>{openView("workhub");if(mobileDockMode())setCollapsed(true)});
    const minimize=el("button","thebe-ai-icon-btn thebe-ai-minimize","—");
    minimize.type="button";minimize.setAttribute("aria-label","Minimise Thebe on mobile");
    minimize.addEventListener("click",()=>setCollapsed(true));
    headActions.append(attentionButton,minimize);head.append(title,headActions);

    const scroll=el("div","thebe-ai-dock-scroll");
    const voiceCard=el("div","thebe-ai-voice-card");
    const orbButton=el("button","thebe-ai-orb-button");
    orbButton.type="button";orbButton.setAttribute("aria-label","Start or stop Thebe voice");
    orb=el("div","thebe-particle-orb");orb.dataset.phase="idle";
    orb.append(el("span","thebe-particle-core"));
    for(let i=0;i<12;i++)orb.append(el("i","thebe-particle"));
    orbButton.append(orb);
    orbButton.addEventListener("click",()=>{
      const liveApi=global.ThebeLiveVoice;
      if(!shellVisible()){
        if(!liveApi){responseMessage("The public voice sample is not available in this browser right now.","error");return}
        const liveState=liveApi.status?.().state||"idle";
        if(liveState==="connected"||liveState==="connecting"||liveState==="closing"){liveApi.stop();return}
        responseMessage("Opening a short Thebe voice sample…","thinking");
        liveApi.start({mode:"marketing"}).catch(error=>{
          responseMessage(clean(error?.message||"The public voice sample could not start.",320),"error");
        });
        return;
      }
      const live=document.getElementById("thebeLiveVoiceButton");
      if(live&&!live.disabled){live.click();return}
      responseMessage("Thebe Live Voice is not available for this workspace right now.","error");
    });
    voiceLabel=el("div","thebe-ai-voice-label","Voice ready");
    voiceSub=el("div","thebe-ai-voice-sub","Tap the particles or Talk to Thebe");
    const voiceMount=el("div","thebe-ai-voice-mount");voiceMount.id="thebeAiDockVoiceMount";
    transcriptBox=el("div","thebe-ai-live-transcript");transcriptBox.id="thebeAiDockTranscript";transcriptBox.hidden=true;
    voiceCard.append(orbButton,voiceLabel,voiceSub,voiceMount,transcriptBox);

    quick=el("div","thebe-ai-quick");
    renderQuickActions(surfaceMode());

    responseBox=el("div","thebe-ai-response");responseBox.id="thebeAiDockResponse";responseMessage("Ask a question, use a quick action, or speak to Thebe.");

    scroll.append(voiceCard,quick,responseBox);

    const compose=el("form","thebe-ai-compose");
    input=document.createElement("textarea");input.id="thebeAiDockInput";input.maxLength=MAX_QUESTION;input.rows=1;input.placeholder="Ask Thebe anything…";input.setAttribute("aria-label","Ask Thebe anything");
    sendButton=el("button","thebe-ai-send","↑");sendButton.type="submit";sendButton.setAttribute("aria-label","Send to Thebe");
    compose.append(input,sendButton);
    compose.addEventListener("submit",event=>{event.preventDefault();const value=input.value;input.value="";void ask("ask",value)});
    input.addEventListener("keydown",event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();compose.requestSubmit()}});

    foot=el("div","thebe-ai-foot","Advisory by default · governed actions still require the existing approval controls.");
    dock.append(head,scroll,compose,foot);

    pill=el("button","thebe-ai-pill");
    pill.id="thebeAiDockPill";pill.type="button";pill.hidden=true;
    pillLabel=el("span","thebe-ai-pill-label","Thebe");
    pill.append(el("span","thebe-ai-pill-dot"),pillLabel);
    pill.addEventListener("click",()=>setCollapsed(false));

    document.body.append(dock,pill);
    syncVisibility();syncAttention();

    const shell=document.getElementById("appShell");
    if(shell)new MutationObserver(syncVisibility).observe(shell,{attributes:true,attributeFilter:["style","class"]});
    const marketing=document.getElementById("marketingGate");
    if(marketing)new MutationObserver(syncVisibility).observe(marketing,{attributes:true,attributeFilter:["style","class"]});
    const alerts=document.getElementById("navAlerts");
    if(alerts)new MutationObserver(syncAttention).observe(alerts,{childList:true,characterData:true,subtree:true});
    global.addEventListener("resize",syncVisibility,{passive:true});
    global.addEventListener("pageshow",recoverVisibility,{passive:true});
    global.addEventListener("focus",recoverVisibility,{passive:true});
    global.addEventListener("thebe:workspace-ready",recoverVisibility);
    if(typeof global.whenThebeWorkspaceReady==="function")global.whenThebeWorkspaceReady(recoverVisibility);
  }

  global.addEventListener("thebe-live-state",event=>{
    const next=event?.detail?.state||"idle";
    const marketing=event?.detail?.mode==="marketing"||surfaceMode()==="public";
    if(next==="connecting")setPhase("connecting","Connecting…",marketing?"Opening the 60-second sample":"Opening the secure voice session");
    else if(next==="connected")setPhase("ready","Voice connected",marketing?"Ask me about Thebe Desk":"Speak naturally — you can interrupt Thebe");
    else if(next==="closing")setPhase("thinking","Ending voice…","Closing the voice session");
    else {
      setPhase("idle",marketing?"Try Thebe voice":"Voice ready",marketing?"Tap the particles and ask about Thebe Desk":"Tap the particles or Talk to Thebe");
      voiceInput="";voiceOutput="";renderVoiceTranscript()
    }
  });
  global.addEventListener("thebe-live-event",event=>{
    const message=event?.detail?.event||{};
    if(message.type==="input_audio_buffer.speech_started"){
      voiceInput="";setPhase("listening","Listening…","Thebe is hearing you");
    }else if(message.type==="conversation.item.input_audio_transcription.delta"){
      voiceInput=(voiceInput+String(message?.delta??message?.text??"")).slice(-600);renderVoiceTranscript();
    }else if(message.type==="input_audio_buffer.speech_stopped"){
      setPhase("thinking","Thinking…","Checking the request and workspace context");
    }else if(message.type==="response.output_audio_transcript.delta"){
      if(voicePhase!=="speaking")voiceOutput="";
      voiceOutput=(voiceOutput+String(message?.delta??message?.text??"")).slice(-600);
      setPhase("speaking","Thebe is speaking","You can interrupt at any time");renderVoiceTranscript();
    }else if(message.type==="response.done"){
      setPhase("ready","Voice connected","Ready for your next request");
    }
  });
  global.addEventListener("thebe-live-audio-level",event=>{
    if(!orb)return;
    const channel=event?.detail?.channel||"all";
    const level=Math.max(0,Math.min(1,Number(event?.detail?.level)||0));
    const relevant=(voicePhase==="listening"&&channel==="input")||(voicePhase==="speaking"&&channel==="output");
    const scale=relevant?(1+level*.13):1;
    const ring=relevant?(8+level*5):8;
    const blur=relevant?(28+level*20):28;
    orb.style.setProperty("--thebe-audio-scale",scale.toFixed(3));
    orb.style.setProperty("--thebe-audio-ring",ring.toFixed(1)+"px");
    orb.style.setProperty("--thebe-audio-blur",blur.toFixed(1)+"px");
  });
  global.addEventListener("thebe-live-delegation",()=>setPhase("thinking","Checking your business…","Using the governed Thebe backend"));
  global.addEventListener("thebe-live-delegation-result",event=>{
    const result=event?.detail?.result||{};
    const prepared=result?.authority?.taskPrepared===true;
    if(prepared){
      responseBox?.replaceChildren();
      if(responseBox){
        responseBox.dataset.state="ready";
        responseBox.append(el("div","thebe-ai-response-title","Approval required"),el("div","thebe-ai-response-answer",clean(result?.content||"The internal task draft was prepared for owner review.",800)));
        const review=el("button","thebe-ai-open-full","Review approval controls →");review.type="button";
        review.addEventListener("click",()=>{openView("dashboard");setTimeout(()=>document.getElementById("ownerAgenticPanel")?.scrollIntoView({behavior:"smooth",block:"center"}),250);if(innerWidth<900)setCollapsed(true)});
        responseBox.append(review);
      }
    }else if(result?.content){
      responseMessage(clean(result.content,1200));
    }
  });
  global.addEventListener("thebe-live-delegation-stale",event=>{
    if(event?.detail?.taskPrepared)responseMessage("A governed task draft was prepared before you spoke again. It still exists and requires owner approval before any guarded execution.","ready");
  });
  global.addEventListener("thebe-live-error",event=>setPhase("error","Voice needs attention",clean(event?.detail?.message||"Check the voice connection and try again.",180)));
  global.addEventListener("thebe-live-session-limit",()=>responseMessage("This voice session reached its configured safety limit and was ended. Start a new session to continue.","ready"));

  function boot(){
    mount();
    setTimeout(recoverVisibility,0);
    setTimeout(recoverVisibility,350);
    setTimeout(recoverVisibility,1200);
    setTimeout(recoverVisibility,3000);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();

  global.ThebeAiDock=Object.freeze({
    release:DOCK_RELEASE,
    open:()=>setCollapsed(false),
    close:()=>setCollapsed(true),
    ask:(question,mode="ask")=>ask(mode,question),
    state:()=>({collapsed:effectiveCollapsed(),mobileCollapsedPreference:collapsed,mobile:mobileDockMode(),voicePhase,textBusy,workspaceVisible:shellVisible(),dockHidden:dock?.hidden??true,pillHidden:pill?.hidden??true,context:activeContext()})
  });
})(window);
