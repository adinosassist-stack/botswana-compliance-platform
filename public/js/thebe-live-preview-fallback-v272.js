(function bootstrapThebeLivePreviewFallback(global){
  "use strict";
  const RELEASE="20261003-gpt-live-preview-fallback-v272";
  const PRODUCTION_SESSION_PATH="/api/agentic/live/session";
  const PREVIEW_STATUS_PATH="/api/agentic/live/preview/status";
  const PREVIEW_SESSION_PATH="/api/agentic/live/preview/session";
  let installed=false,originalApi=null,previewStatus=null,statusCheckedAt=0;

  const now=()=>Date.now();
  const emit=(detail={})=>{try{global.dispatchEvent(new CustomEvent("thebe-live-runtime-selection",{detail:{release:RELEASE,...detail}}))}catch{}};
  const errorCode=error=>String(error?.code||error?.data?.error||error?.body?.error||"").trim();
  const errorStatus=error=>Number(error?.status||error?.data?.status||0)||0;

  function exactLogicalPath(value){
    try{return new URL(String(value||""),global.location?.origin||"https://thebedesk.invalid").pathname}catch{return ""}
  }

  function retryablePreviewError(error){
    const status=errorStatus(error),code=errorCode(error);
    if(status===400||status===401||status===403||status===413||status===415)return false;
    if(status>=500||status===429||status===0)return true;
    return /^gpt_live_preview_(?:disabled|unavailable|timeout|upstream_failed|invalid_response)$/.test(code)||code==="openai_not_configured"||code==="agent_runtime_disabled"||code==="agent_runtime_kill_switch"||code==="live_voice_disabled";
  }

  async function readPreviewStatus(force=false){
    if(!originalApi)return null;
    if(!force&&previewStatus&&now()-statusCheckedAt<30000)return previewStatus;
    statusCheckedAt=now();
    try{previewStatus=await originalApi(PREVIEW_STATUS_PATH);return previewStatus}catch{previewStatus=null;return null}
  }

  async function request(url,options={}){
    const path=exactLogicalPath(url);
    if(path!==PRODUCTION_SESSION_PATH||String(options?.method||"GET").toUpperCase()!=="POST")return originalApi(url,options);
    const status=await readPreviewStatus();
    if(status?.sessionCreationAllowed!==true){
      emit({requestedRuntime:"realtime",actualRuntime:"realtime",fallback:false,reason:status?.gateCode||"preview_not_enabled"});
      return originalApi(url,options);
    }
    const started=now();
    try{
      const preview=await originalApi(PREVIEW_SESSION_PATH,options);
      emit({requestedRuntime:"gpt-live",actualRuntime:"gpt-live",fallback:false,elapsedMs:Math.max(0,now()-started)});
      return preview;
    }catch(error){
      if(!retryablePreviewError(error)){
        emit({requestedRuntime:"gpt-live",actualRuntime:"none",fallback:false,reason:errorCode(error)||"preview_request_rejected",status:errorStatus(error)});
        throw error;
      }
      const reason=errorCode(error)||"preview_transport_failure";
      const previewElapsedMs=Math.max(0,now()-started);
      const fallbackStarted=now();
      const realtime=await originalApi(url,options);
      emit({requestedRuntime:"gpt-live",actualRuntime:"realtime",fallback:true,reason,previewElapsedMs,fallbackElapsedMs:Math.max(0,now()-fallbackStarted)});
      return realtime;
    }
  }

  function install(){
    if(installed)return true;
    if(typeof global.apiJson!=="function")return false;
    originalApi=global.apiJson;
    const wrapped=(url,options)=>request(url,options);
    Object.defineProperty(wrapped,"__thebeLivePreviewFallback",{value:true});
    global.apiJson=wrapped;
    installed=true;
    emit({installed:true});
    return true;
  }

  function scheduleInstall(){
    if(install())return;
    let attempts=0;
    const timer=global.setInterval?.(()=>{
      attempts+=1;
      if(install()||attempts>=40)global.clearInterval?.(timer);
    },50);
  }

  if(global.document?.readyState==="loading")global.document.addEventListener("DOMContentLoaded",scheduleInstall,{once:true});
  else scheduleInstall();

  global.ThebeLivePreviewFallback=Object.freeze({release:RELEASE,install,request,readPreviewStatus,retryablePreviewError,state:()=>({installed,status:previewStatus,statusCheckedAt})});
})(window);
