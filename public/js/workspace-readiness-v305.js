(()=>{
  "use strict";
  if(typeof window.whenThebeWorkspaceReady==="function")return;
  window.__THEBE_WORKSPACE_READY__=false;
  window.whenThebeWorkspaceReady=function(callback){
    if(typeof callback!=="function")return;
    if(window.__THEBE_WORKSPACE_READY__===true){queueMicrotask(callback);return}
    window.addEventListener("thebe:workspace-ready",callback,{once:true});
  };
})();
