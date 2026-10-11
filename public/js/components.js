(function bootstrapBwComponents(global){
  "use strict";
  function element(tag,{className="",text=null,attrs={}}={},children=[]){
    const node=document.createElement(tag);if(className)node.className=className;if(text!==null)node.textContent=String(text);
    for(const [key,value] of Object.entries(attrs)){if(value===false||value==null)continue;if(value===true)node.setAttribute(key,"");else node.setAttribute(key,String(value))}
    for(const child of children.flat()){if(child==null)continue;node.append(child instanceof Node?child:document.createTextNode(String(child)))}return node;
  }
  function renderList(target,items,renderItem,{emptyText="Nothing to show."}={}){
    if(!target)return;const frag=document.createDocumentFragment();
    if(!Array.isArray(items)||!items.length)frag.appendChild(element("div",{className:"muted small bw-empty-state",text:emptyText,attrs:{role:"status","aria-live":"polite"}}));
    else for(const item of items){const node=renderItem(item);if(node)frag.appendChild(node)}
    target.replaceChildren(frag);
  }
  global.BW=global.BW||{};global.BW.components=Object.freeze({element,renderList});
})(window);

(function installWorkspaceEntryBillingBudget(global){
  "use strict";
  if(!global.fetch||!global.document||!global.Response)return;
  const nativeFetch=global.fetch.bind(global);
  const WORKSPACE_ENTRY_BILLING_BUDGET_MS=5000;
  function isProduction(){return String(global.document.querySelector('meta[name="bw-runtime-mode"]')?.content||"production").toLowerCase()==="production"}
  function isEntryBillingRequest(input,init={}){
    if(!isProduction())return false;
    const method=String(init?.method||input?.method||"GET").toUpperCase();if(method!=="GET")return false;
    let url;try{url=new URL(typeof input==="string"?input:String(input?.url||input||""),global.location?.href||"https://invalid.local/")}catch{return false}
    if(!global.location?.origin||url.origin!==global.location.origin)return false;
    const logicalBilling=url.pathname==="/api/billing/status"||url.pathname==="/__thebe_api/billing/status"||(url.pathname==="/"&&url.searchParams.get("__thebe_api_path")==="/api/billing/status");
    if(!logicalBilling)return false;
    const shell=global.document.getElementById("appShell");return !!shell&&shell.style.visibility==="hidden";
  }
  global.fetch=async function workspaceEntrySafeFetch(input,init={}){
    if(!isEntryBillingRequest(input,init))return nativeFetch(input,init);
    const controller=new AbortController(),parentSignal=init?.signal;let budgetExpired=false;
    const forwardAbort=()=>{try{controller.abort(parentSignal?.reason)}catch{controller.abort()}};
    if(parentSignal?.aborted)forwardAbort();else parentSignal?.addEventListener?.("abort",forwardAbort,{once:true});
    const timer=global.setTimeout(()=>{budgetExpired=true;try{controller.abort("workspace-entry-billing-budget")}catch{controller.abort()}},WORKSPACE_ENTRY_BILLING_BUDGET_MS);
    try{return await nativeFetch(input,{...init,signal:controller.signal})}
    catch(error){
      if(budgetExpired&&!parentSignal?.aborted){
        return new global.Response(JSON.stringify({error:"billing_status_deferred",message:"Billing status refresh deferred until workspace entry completes."}),{status:408,headers:{"content-type":"application/json","cache-control":"no-store"}})
      }
      throw error
    }finally{
      global.clearTimeout(timer);parentSignal?.removeEventListener?.("abort",forwardAbort)
    }
  };
})(window);

(function installWorkspaceInteractionContract(global){
  "use strict";
  const doc=global.document;if(!doc)return;
  const STYLE_ID="thebe-workspace-interactions-v318";
  function ensureStyles(){
    if(doc.getElementById(STYLE_ID))return;
    const link=doc.createElement("link");
    link.id=STYLE_ID;link.rel="stylesheet";link.href="/assets/workspace-interactions-v318.css";
    link.dataset.workspaceOnly="true";
    (doc.head||doc.documentElement).appendChild(link);
  }
  function annotateAddCompany(root=doc){
    const button=(root?.id==="addCompanyBtn"?root:root?.querySelector?.("#addCompanyBtn"))||doc.getElementById("addCompanyBtn");
    if(!button)return;
    if(!button.hasAttribute("aria-label"))button.setAttribute("aria-label","Add company");
    if(!button.hasAttribute("title"))button.setAttribute("title","Add company");
  }
  function start(){
    ensureStyles();annotateAddCompany();
    const shell=doc.getElementById("appShell");if(!shell||!global.MutationObserver)return;
    const observer=new global.MutationObserver(records=>{
      for(const record of records){for(const node of record.addedNodes||[]){if(node?.nodeType===1)annotateAddCompany(node)}}
    });
    observer.observe(shell,{childList:true,subtree:true});
  }
  if(doc.readyState==="loading")doc.addEventListener("DOMContentLoaded",start,{once:true});else start();
})(window);

(function installReviewerP1Remediations(global){
  "use strict";
  if(!global||!global.document||typeof global.fetch!=="function")return;

  const doc=global.document;
  const nativeFetch=global.fetch.bind(global);
  const MAX_IN_PROGRESS_RETRIES=6;

  function logicalPath(input){
    let raw="";
    if(typeof input==="string")raw=input;
    else if(input instanceof URL)raw=input.toString();
    else if(input&&typeof input.url==="string")raw=input.url;
    if(!raw)return "";
    try{
      const url=new URL(raw,global.location?.href||"https://invalid.local/");
      return url.searchParams.get("__thebe_api_path")||url.pathname;
    }catch{return ""}
  }

  function methodOf(input,init){
    return String(init?.method||input?.method||"GET").toUpperCase();
  }

  function signalOf(input,init){
    return init?.signal||input?.signal||null;
  }

  function retryAfterMs(response){
    const raw=String(response?.headers?.get?.("retry-after")||"").trim();
    if(!raw)return 2000;
    const seconds=Number(raw);
    if(Number.isFinite(seconds))return Math.max(250,Math.min(5000,Math.round(seconds*1000)));
    const at=Date.parse(raw);
    return Number.isFinite(at)?Math.max(250,Math.min(5000,at-Date.now())):2000;
  }

  function wait(ms,signal){
    return new Promise((resolve,reject)=>{
      if(signal?.aborted){
        reject(signal.reason instanceof Error?signal.reason:new DOMException("Aborted","AbortError"));return;
      }
      const timer=global.setTimeout(done,ms);
      function done(){cleanup();resolve()}
      function aborted(){cleanup();reject(signal.reason instanceof Error?signal.reason:new DOMException("Aborted","AbortError"))}
      function cleanup(){global.clearTimeout(timer);signal?.removeEventListener?.("abort",aborted)}
      signal?.addEventListener?.("abort",aborted,{once:true});
    });
  }

  async function isAdvisorInProgress(response){
    if(response?.status!==425)return false;
    try{
      const body=await response.clone().json();
      return String(body?.error||body?.code||"")==="idempotency_request_in_progress";
    }catch{return true}
  }

  global.fetch=async function recoverInProgressAiRequest(input,init={}){
    if(methodOf(input,init)!=="POST"||logicalPath(input)!=="/api/ai/advisor")return nativeFetch(input,init);
    const requestTemplate=(typeof Request!=="undefined"&&input instanceof Request)?input.clone():null;
    const signal=signalOf(input,init);
    let attempt=0;
    while(true){
      const requestInput=requestTemplate?requestTemplate.clone():input;
      const response=await nativeFetch(requestInput,init);
      if(!(await isAdvisorInProgress(response))||attempt>=MAX_IN_PROGRESS_RETRIES)return response;
      attempt+=1;
      await wait(retryAfterMs(response),signal);
    }
  };

  function employmentAssuranceItem(label,status,tone){
    const row=doc.createElement("div");row.className="item";
    const text=doc.createElement("span");text.textContent=label;
    const badge=doc.createElement("span");badge.className=`badge ${tone}`;badge.textContent=status;
    row.append(text,badge);return row;
  }

  function renderTruthfulEmploymentAssurance(){
    const root=doc.getElementById("employeesList");
    if(!root)return;
    const gaps=doc.getElementById("employeesGaps");
    if(gaps){
      gaps.textContent="—";
      gaps.title="Evidence gaps are not estimated. They are shown only when backed by linked employee evidence.";
    }
    root.replaceChildren(
      employmentAssuranceItem("Employment contracts","Evidence review required","warn"),
      employmentAssuranceItem("Leave records","Evidence review required","warn"),
      employmentAssuranceItem("Disciplinary files","Evidence review required","warn")
    );
    root.dataset.assuranceSource="linked-evidence-required";
    root.setAttribute("aria-label","Employment assurance. Verification is not inferred without linked evidence.");
  }

  let employeePatchInstalled=false;
  let aiPatchInstalled=false;

  function patchWorkspaceGlobals(){
    if(!employeePatchInstalled&&typeof global.renderEmployees==="function"){
      const original=global.renderEmployees;
      if(!original.__thebeTruthfulEmploymentAssurance){
        const patched=function(){
          const result=original.apply(this,arguments);
          renderTruthfulEmploymentAssurance();
          return result;
        };
        patched.__thebeTruthfulEmploymentAssurance=true;
        global.renderEmployees=patched;
      }
      employeePatchInstalled=true;
      renderTruthfulEmploymentAssurance();
    }

    if(!aiPatchInstalled&&typeof global.askAiAdvisor==="function"){
      const original=global.askAiAdvisor;
      if(!original.__thebeCreditRefreshOnFailure){
        const patched=async function(){
          try{return await original.apply(this,arguments)}
          finally{
            try{if(typeof global.renderAiCredits==="function")await global.renderAiCredits()}catch{}
          }
        };
        patched.__thebeCreditRefreshOnFailure=true;
        global.askAiAdvisor=patched;
      }
      aiPatchInstalled=true;
    }
    return employeePatchInstalled&&aiPatchInstalled;
  }

  function start(){
    if(patchWorkspaceGlobals())return;
    let attempts=0;
    const timer=global.setInterval(()=>{
      attempts+=1;
      if(patchWorkspaceGlobals()||attempts>=80)global.clearInterval(timer);
    },250);
  }

  if(doc.readyState==="loading")doc.addEventListener("DOMContentLoaded",start,{once:true});else start();
})(window);
