/* Separate People workspace enhancement: never blocks core workspace startup. */
(()=>{
  "use strict";
  let loading=false;
  let mounted=false;
  async function mountWhenReady(){
    if(loading||mounted)return;
    const candidates=[document.getElementById("peopleops"),document.getElementById("employees")].filter(Boolean);
    const people=candidates.find(node=>!node.hidden&&node.getClientRects().length>0);
    if(!people||people.hasAttribute("data-lazy-view")||!people.isConnected)return;
    const visible=!people.hidden&&people.getAttribute("aria-hidden")!=="true"&&people.getClientRects().length>0;
    if(!visible)return;
    loading=true;
    try{
      const response=await fetch("/api/employee-workflows",{credentials:"same-origin"});
      if(!response.ok)return; // Do not expose an unusable form to unauthorized staff.
      if(mounted||!people.isConnected)return;
      const host=document.createElement("section");
      host.id="employee-ai-workflow-builder";
      host.setAttribute("aria-label","Employee AI workflow builder");
      const {mountEmployeeWorkflowBuilder}=await import("/employee-workflow-panel.js");
      if(mounted||!people.isConnected)return;
      people.appendChild(host);
      mountEmployeeWorkflowBuilder(host);
      mounted=true;
    }catch{
      // Optional enhancement must never break the existing People page.
    }finally{loading=false}
  }
  document.addEventListener("click",()=>queueMicrotask(mountWhenReady),{passive:true});
  document.addEventListener("thebe:workspace-view-changed",mountWhenReady);
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mountWhenReady,{once:true});
  else mountWhenReady();
})();
