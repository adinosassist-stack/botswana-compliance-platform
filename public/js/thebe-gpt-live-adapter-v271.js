(function bootstrapThebeGptLiveAdapter(global){
  "use strict";
  const RELEASE="20261003-gpt-live-event-adapter-v271";
  const MAX_TRANSCRIPT_CHARS=6000;
  const MAX_APPEND_CHARS=1500;

  const clean=(value,max=MAX_APPEND_CHARS)=>String(value??"")
    .replace(/[\u0000-\u001f\u007f]/g," ")
    .replace(/\s+/g," ")
    .trim()
    .slice(0,max);

  function transcriptDelta(event){
    const type=String(event?.type||"");
    if(type!=="session.input_transcript.delta"&&type!=="session.output_transcript.delta")return null;
    const delta=String(event?.delta??"");
    if(!delta)return null;
    const startMs=Math.max(0,Number(event?.start_ms)||0);
    const endMs=Math.max(startMs,Number(event?.end_ms)||startMs);
    return Object.freeze({speaker:type==="session.input_transcript.delta"?"user":"assistant",delta,startMs,endMs});
  }

  function clientDelegation(event){
    if(event?.type!=="session.delegation.created"||event?.delegation?.target!=="client")return null;
    const id=clean(event?.delegation?.id,240);
    if(!id)return null;
    return Object.freeze({id,offsetMs:Math.max(0,Number(event?.offset_ms)||0)});
  }

  function createTranscriptState(){
    let input="",output="",latestInputEndMs=0,latestOutputEndMs=0;
    const history=[];
    function apply(event){
      const delta=transcriptDelta(event);
      if(!delta)return null;
      if(delta.speaker==="user"){
        input=(input+delta.delta).slice(-MAX_TRANSCRIPT_CHARS);
        latestInputEndMs=Math.max(latestInputEndMs,delta.endMs);
      }else{
        output=(output+delta.delta).slice(-MAX_TRANSCRIPT_CHARS);
        latestOutputEndMs=Math.max(latestOutputEndMs,delta.endMs);
      }
      history.push(delta);
      while(history.length>160)history.shift();
      return delta;
    }
    function snapshot(){
      return Object.freeze({input,output,latestInputEndMs,latestOutputEndMs,history:Object.freeze(history.slice())});
    }
    return Object.freeze({apply,snapshot});
  }

  function appendEvent({kind="commentary",delegationId=null,content,eventId}={}){
    const safe=clean(content);
    if(!safe)throw new Error("gpt_live_append_content_required");
    const type=kind==="thinking"?"session.thinking.append":kind==="instructions"?"session.instructions.append":"session.commentary.append";
    return Object.freeze({
      type,
      event_id:clean(eventId||global.crypto?.randomUUID?.()||`thebe_${Date.now()}`,240),
      delegation_id:delegationId===null?null:clean(delegationId,240),
      content:safe
    });
  }

  function delegationContext(delegation,transcriptState,taskState={}){
    const transcript=transcriptState.snapshot();
    const recent=transcript.history
      .filter(item=>delegation.offsetMs===0||item.endMs<=delegation.offsetMs)
      .slice(-48)
      .map(item=>`${item.speaker}: ${item.delta}`)
      .join("");
    return Object.freeze({
      delegationId:delegation.id,
      delegationOffsetMs:delegation.offsetMs,
      recentConversation:clean(recent,5000),
      transcript,
      taskState:taskState&&typeof taskState==="object"?taskState:{}
    });
  }

  function verifiedSummary(result){
    if(!result||result.verified!==true)throw new Error("gpt_live_backend_result_unverified");
    const content=clean(result.content);
    if(!content)throw new Error("gpt_live_backend_result_empty");
    return Object.freeze({content,authority:result.authority&&typeof result.authority==="object"?result.authority:{}});
  }

  function createAdapter({send,runBackend,readTaskState=()=>({}),onTranscript=()=>{},onDelegation=()=>{},onResult=()=>{},onMetric=()=>{},now=()=>Date.now()}={}){
    if(typeof send!=="function")throw new Error("gpt_live_send_required");
    if(typeof runBackend!=="function")throw new Error("gpt_live_backend_required");
    const transcripts=createTranscriptState();
    const active=new Map();

    async function handle(event){
      const delta=transcripts.apply(event);
      if(delta){onTranscript(delta,transcripts.snapshot());return {handled:true,kind:"transcript"}}
      const delegation=clientDelegation(event);
      if(!delegation)return {handled:false};
      if(active.has(delegation.id))return {handled:true,kind:"delegation_duplicate"};
      const context=delegationContext(delegation,transcripts,readTaskState());
      const startedAt=now();
      active.set(delegation.id,{delegation,context,startedAt});
      onDelegation(context);
      try{
        send(appendEvent({kind:"thinking",delegationId:delegation.id,content:"The governed Thebe backend is checking this request. No business action should be treated as complete until a verified result is returned."}));
        const result=await runBackend(context);
        const elapsedMs=Math.max(0,now()-startedAt);
        const current=transcripts.snapshot();
        const stale=delegation.offsetMs>0&&current.latestInputEndMs>delegation.offsetMs;
        onMetric({type:"delegation_latency",delegationId:delegation.id,elapsedMs,stale});
        if(stale){
          send(appendEvent({kind:"thinking",delegationId:delegation.id,content:"The user changed or continued the request after this delegated work started. Do not announce the older result; continue from the latest user input."}));
          onResult({delegationId:delegation.id,stale:true,result:null});
          return {handled:true,kind:"delegation_stale",elapsedMs};
        }
        const verified=verifiedSummary(result);
        send(appendEvent({kind:"commentary",delegationId:delegation.id,content:verified.content}));
        onResult({delegationId:delegation.id,stale:false,result:verified});
        return {handled:true,kind:"delegation_result",elapsedMs};
      }catch(error){
        const elapsedMs=Math.max(0,now()-startedAt);
        onMetric({type:"delegation_failure",delegationId:delegation.id,elapsedMs});
        send(appendEvent({kind:"commentary",delegationId:delegation.id,content:"The governed Thebe backend could not verify that request. No business action was confirmed."}));
        onResult({delegationId:delegation.id,stale:false,error:clean(error?.message||"delegation_failed",240)});
        return {handled:true,kind:"delegation_error",elapsedMs};
      }finally{
        active.delete(delegation.id);
      }
    }

    return Object.freeze({handle,transcripts,activeCount:()=>active.size});
  }

  global.ThebeGptLiveAdapter=Object.freeze({RELEASE,transcriptDelta,clientDelegation,createTranscriptState,delegationContext,appendEvent,verifiedSummary,createAdapter});
})(typeof window!=="undefined"?window:globalThis);
