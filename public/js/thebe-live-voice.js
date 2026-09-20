(function(global){
  "use strict";

  const RELEASE="20260920a";
  const MAX_TRANSCRIPT_CHARS=6000;
  let pc=null,dc=null,media=null,remoteAudio=null,sessionId=null,closeTimer=null;
  let inputTranscript="",outputTranscript="",state="idle",button=null;
  const activeDelegations=new Set();

  const api=(url,options={})=>{
    if(typeof global.apiJson!=="function")throw new Error("The secure Thebe API transport is not available.");
    return global.apiJson(url,options);
  };
  const text=(value,max=500)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
  const emit=(name,detail={})=>{
    try{global.dispatchEvent(new CustomEvent(name,{detail}))}catch{}
  };
  const setState=(next,detail={})=>{
    state=next;
    if(button){
      button.textContent=next==="connected"?"End Thebe voice":next==="connecting"?"Connecting…":next==="closing"?"Ending…":"Talk to Thebe";
      button.disabled=next==="connecting"||next==="closing";
      button.setAttribute("aria-pressed",next==="connected"?"true":"false");
    }
    emit("thebe-live-state",{state:next,sessionId,...detail});
  };
  const cap=value=>String(value||"").slice(-MAX_TRANSCRIPT_CHARS);

  function sendEvent(event){
    if(!dc||dc.readyState!=="open")throw new Error("Thebe live data channel is not open.");
    dc.send(JSON.stringify(event));
  }

  function transcriptDelta(event){
    const delta=String(event?.delta??event?.text??"");
    if(!delta)return;
    if(event.type==="session.input_transcript.delta")inputTranscript=cap(inputTranscript+delta);
    if(event.type==="session.output_transcript.delta")outputTranscript=cap(outputTranscript+delta);
  }

  async function handleDelegation(event){
    const delegationId=text(event?.delegation?.id,240);
    if(event?.delegation?.target!=="client"||!delegationId||activeDelegations.has(delegationId))return;
    activeDelegations.add(delegationId);
    try{
      await new Promise(resolve=>setTimeout(resolve,60));
      const taskText=text(inputTranscript,2400);
      if(!taskText){
        sendEvent({
          type:"session.commentary.append",
          event_id:global.crypto?.randomUUID?.()||String(Date.now()),
          delegation_id:delegationId,
          content:"I could not reliably capture the business request. Please repeat it."
        });
        return;
      }
      emit("thebe-live-delegation",{delegationId,sessionId,taskText});
      const result=await api("/api/agentic/live/delegation",{
        method:"POST",
        body:JSON.stringify({delegationId,sessionId,taskText})
      });
      if(result?.event)sendEvent(result.event);
    }catch(error){
      try{
        sendEvent({
          type:"session.commentary.append",
          event_id:global.crypto?.randomUUID?.()||String(Date.now()),
          delegation_id:delegationId,
          content:"The governed Thebe backend could not complete that request. No business action was executed."
        });
      }catch{}
      emit("thebe-live-error",{message:text(error?.message||"Delegation failed",240)});
    }finally{
      activeDelegations.delete(delegationId);
    }
  }

  function handleServerEvent(raw){
    let event;
    try{event=JSON.parse(String(raw||""))}catch{return}
    transcriptDelta(event);
    if(event.type==="session.started"){
      sessionId=text(event?.session?.id||event?.session_id||sessionId,240)||sessionId;
      setState("connected");
    }
    if(event.type==="session.delegation.created")handleDelegation(event);
    if(event.type==="session.error")emit("thebe-live-error",{event});
    if(event.type==="session.closed")cleanup("idle");
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
      throw new Error(status?.runtimeKillSwitch?"Thebe live voice is paused by the runtime safety switch.":"Thebe live voice is not enabled for this workspace.");
    }

    setState("connecting");
    inputTranscript="";outputTranscript="";sessionId=null;
    try{
      media=await navigator.mediaDevices.getUserMedia({audio:true});
      remoteAudio=document.createElement("audio");
      remoteAudio.autoplay=true;
      remoteAudio.setAttribute("aria-hidden","true");
      remoteAudio.style.display="none";
      document.body.append(remoteAudio);

      pc=new RTCPeerConnection();
      pc.addEventListener("track",event=>{
        const stream=event.streams?.[0];
        if(stream)remoteAudio.srcObject=stream;
      });
      media.getTracks().forEach(track=>pc.addTrack(track,media));

      dc=pc.createDataChannel("oai-events");
      dc.addEventListener("message",event=>handleServerEvent(event.data));
      dc.addEventListener("close",()=>cleanup("idle"));
      dc.addEventListener("error",()=>emit("thebe-live-error",{message:"Thebe live data channel failed."}));

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
      return {state:"connecting",sessionId};
    }catch(error){
      cleanup("idle");
      throw error;
    }
  }

  function cleanup(nextState="idle"){
    try{dc?.close()}catch{}
    try{pc?.close()}catch{}
    try{media?.getTracks?.().forEach(track=>track.stop())}catch{}
    try{if(remoteAudio){remoteAudio.srcObject=null;remoteAudio.remove()}}catch{}
    pc=null;dc=null;media=null;remoteAudio=null;sessionId=null;
    activeDelegations.clear();
    setState(nextState);
  }

  function stop(){
    cleanup("idle");
  }

  function appendCommentary(delegationId,content){
    const id=text(delegationId,240),message=text(content,1800);
    if(!id||!message)throw new Error("Delegation id and commentary are required.");
    sendEvent({
      type:"session.commentary.append",
      event_id:global.crypto?.randomUUID?.()||String(Date.now()),
      delegation_id:id,
      content:message
    });
  }

  function appendThinking(delegationId,content){
    const id=text(delegationId,240),message=text(content,1800);
    if(!id||!message)throw new Error("Delegation id and context are required.");
    sendEvent({
      type:"session.thinking.append",
      event_id:global.crypto?.randomUUID?.()||String(Date.now()),
      delegation_id:id,
      content:message
    });
  }

  function appendInstructions(content){
    const message=text(content,1800);
    if(!message)throw new Error("Instruction content is required.");
    sendEvent({
      type:"session.instructions.append",
      event_id:global.crypto?.randomUUID?.()||String(Date.now()),
      content:message
    });
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
    button.addEventListener("click",async()=>{
      if(state==="connected"||state==="connecting"||state==="closing"){stop();return}
      try{await start()}catch(error){
        setState("idle");
        emit("thebe-live-error",{message:text(error?.message||"Thebe live voice could not start.",240)});
      }
    });
    host.append(button);
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
    status:()=>({state,sessionId,inputTranscript,outputTranscript}),
    appendCommentary,
    appendThinking,
    appendInstructions
  });
})(window);
