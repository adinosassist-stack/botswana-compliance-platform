/* Separate People workspace enhancement: never blocks core workspace startup. */
(()=>{
  "use strict";
  let loading=false;
  let mounted=false;
  let accessDenied=false;
  async function mountWhenReady(){
    if(loading||mounted||accessDenied)return;
    const candidates=[document.getElementById("peopleops"),document.getElementById("employees")].filter(Boolean);
    const people=candidates.find(node=>!node.hidden&&node.getClientRects().length>0);
    if(!people||people.hasAttribute("data-lazy-view")||!people.isConnected)return;
    const visible=!people.hidden&&people.getAttribute("aria-hidden")!=="true"&&people.getClientRects().length>0;
    if(!visible)return;
    loading=true;
    const startedAt=performance.now();
    try{
      const client=window.BW?.api?.createClient?.();
      if(!client)return;
      try{await client.request("/api/employee-workflows");}
      catch(error){if([401,403].includes(Number(error?.status)))accessDenied=true;return;} // Do not expose an unusable form to unauthorized staff.
      if(mounted||!people.isConnected||people.hidden||!people.getClientRects().length)return;
      const host=document.createElement("section");
      host.id="employee-ai-workflow-builder";
      host.setAttribute("aria-label","Employee AI workflow builder");
      const {mountEmployeeWorkflowBuilder}=await import("/employee-workflow-panel.js");
      if(mounted||!people.isConnected||people.hidden||!people.getClientRects().length)return;
      people.appendChild(host);
      mountEmployeeWorkflowBuilder(host,{fetcher:async(path,options)=>{
        try{await client.request(path,options);return {ok:true,status:200};}
        catch(error){return {ok:false,status:Number(error?.status)||500};}
      }});
      // Optional read-only review queue; failure cannot break workflow builder.
      try{
        const reviewHost=document.createElement("section");
        reviewHost.id="employee-ai-proposal-review-queue";
        reviewHost.setAttribute("aria-label","Pending employee workflow reviews");
        const {mountEmployeeProposalReviewQueue}=await import("/employee-proposal-review-panel.js");
        if(people.isConnected&&!people.hidden&&people.getClientRects().length){
          people.appendChild(reviewHost);
          mountEmployeeProposalReviewQueue(reviewHost,{fetcher:async(path)=>{
            try{return {ok:true,data:await client.request(path)};}
            catch(error){return {ok:false,status:Number(error?.status)||500};}
          }});
        }
      }catch{
        // The optional review list must never block People workflows.
      }
      mounted=true;
    }catch{
      // Optional enhancement must never break the existing People page.
    }finally{
      loading=false;
      const durationMs=Math.round(performance.now()-startedAt);
      if(durationMs>=1500)console.warn("employee_workflow_builder_slow_mount",{durationMs});
    }
  }
  document.addEventListener("click",()=>queueMicrotask(mountWhenReady),{passive:true});
  document.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" ")queueMicrotask(mountWhenReady);},{passive:true});
  window.addEventListener("thebe:workspace-view-change",mountWhenReady);
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mountWhenReady,{once:true});
  else mountWhenReady();
})();
