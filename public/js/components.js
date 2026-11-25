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
    link.id=STYLE_ID;link.rel="stylesheet";link.href="/assets/workspace-interactions-v318.css?v=20261021-brand-blue";
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

  function methodOf(input,init){return String(init?.method||input?.method||"GET").toUpperCase()}
  function signalOf(input,init){return init?.signal||input?.signal||null}
  function retryAfterMs(response){
    const raw=String(response?.headers?.get?.("retry-after")||"").trim();if(!raw)return 2000;
    const seconds=Number(raw);if(Number.isFinite(seconds))return Math.max(250,Math.min(5000,Math.round(seconds*1000)));
    const at=Date.parse(raw);return Number.isFinite(at)?Math.max(250,Math.min(5000,at-Date.now())):2000;
  }
  function wait(ms,signal){
    return new Promise((resolve,reject)=>{
      if(signal?.aborted){reject(signal.reason instanceof Error?signal.reason:new DOMException("Aborted","AbortError"));return}
      const timer=global.setTimeout(done,ms);
      function done(){cleanup();resolve()}
      function aborted(){cleanup();reject(signal.reason instanceof Error?signal.reason:new DOMException("Aborted","AbortError"))}
      function cleanup(){global.clearTimeout(timer);signal?.removeEventListener?.("abort",aborted)}
      signal?.addEventListener?.("abort",aborted,{once:true});
    });
  }
  async function isAdvisorInProgress(response){
    if(response?.status!==425)return false;
    try{const body=await response.clone().json();return String(body?.error||body?.code||"")==="idempotency_request_in_progress"}catch{return true}
  }
  global.fetch=async function recoverInProgressAiRequest(input,init={}){
    if(methodOf(input,init)!=="POST"||logicalPath(input)!=="/api/ai/advisor")return nativeFetch(input,init);
    const requestTemplate=(typeof Request!=="undefined"&&input instanceof Request)?input.clone():null;
    const signal=signalOf(input,init);let attempt=0;
    while(true){
      const requestInput=requestTemplate?requestTemplate.clone():input;
      const response=await nativeFetch(requestInput,init);
      if(!(await isAdvisorInProgress(response))||attempt>=MAX_IN_PROGRESS_RETRIES)return response;
      attempt+=1;await wait(retryAfterMs(response),signal);
    }
  };

  function employmentAssuranceItem(label,status,tone){
    const row=doc.createElement("div");row.className="item";
    const text=doc.createElement("span");text.textContent=label;
    const badge=doc.createElement("span");badge.className=`badge ${tone}`;badge.textContent=status;
    row.append(text,badge);return row;
  }
  function renderTruthfulEmploymentAssurance(){
    const root=doc.getElementById("employeesList");if(!root)return;
    const gaps=doc.getElementById("employeesGaps");if(gaps){gaps.textContent="—";gaps.title="Evidence gaps are not estimated. They are shown only when backed by linked employee evidence."}
    root.replaceChildren(
      employmentAssuranceItem("Employment contracts","Evidence review required","warn"),
      employmentAssuranceItem("Leave records","Evidence review required","warn"),
      employmentAssuranceItem("Disciplinary files","Evidence review required","warn")
    );
    root.dataset.assuranceSource="linked-evidence-required";
    root.setAttribute("aria-label","Employment assurance. Verification is not inferred without linked evidence.");
  }

  let employeePatchInstalled=false,aiPatchInstalled=false;
  function patchWorkspaceGlobals(){
    if(!employeePatchInstalled&&typeof global.renderEmployees==="function"){
      const original=global.renderEmployees;
      if(!original.__thebeTruthfulEmploymentAssurance){
        const patched=function(){const result=original.apply(this,arguments);renderTruthfulEmploymentAssurance();return result};
        patched.__thebeTruthfulEmploymentAssurance=true;global.renderEmployees=patched;
      }
      employeePatchInstalled=true;renderTruthfulEmploymentAssurance();
    }
    if(!aiPatchInstalled&&typeof global.askAiAdvisor==="function"){
      const original=global.askAiAdvisor;
      if(!original.__thebeCreditRefreshOnFailure){
        const patched=async function(){try{return await original.apply(this,arguments)}finally{try{if(typeof global.renderAiCredits==="function")await global.renderAiCredits()}catch{}}};
        patched.__thebeCreditRefreshOnFailure=true;global.askAiAdvisor=patched;
      }
      aiPatchInstalled=true;
    }
    return employeePatchInstalled&&aiPatchInstalled;
  }
  function start(){
    if(patchWorkspaceGlobals())return;
    let attempts=0;const timer=global.setInterval(()=>{attempts+=1;if(patchWorkspaceGlobals()||attempts>=80)global.clearInterval(timer)},250);
  }
  if(doc.readyState==="loading")doc.addEventListener("DOMContentLoaded",start,{once:true});else start();
})(window);

(function installDocumentGenerationCapabilityBoundary(global){
  "use strict";
  const doc=global?.document;if(!doc)return;
  function enforceDocumentBoundary(){
    const grid=doc.getElementById("docGrid");if(!grid)return;
    const buttons=grid.querySelectorAll?.('button[data-bw-onclick^="generateDoc("]')||[];
    for(const button of buttons){button.disabled=true;button.textContent="Draft generation unavailable";button.setAttribute("aria-disabled","true");button.title="Document generation is not enabled in this qualified release."}
    const cards=grid.querySelectorAll?.(".card")||[];
    for(const card of cards){const note=card.querySelector?.(".muted.small");if(note)note.textContent="Controlled template · generation not enabled in this release"}
    grid.dataset.documentGeneration="disabled";
  }
  function install(){
    let renderReady=false,generateReady=false;
    if(typeof global.renderDocs==="function"&&!global.renderDocs.__thebeDocumentCapabilityBoundary){
      const originalRender=global.renderDocs;
      const patchedRender=function(){const result=originalRender.apply(this,arguments);enforceDocumentBoundary();return result};
      patchedRender.__thebeDocumentCapabilityBoundary=true;global.renderDocs=patchedRender;renderReady=true;enforceDocumentBoundary();
    }else renderReady=typeof global.renderDocs==="function";
    if(typeof global.generateDoc==="function"&&!global.generateDoc.__thebeDocumentCapabilityBoundary){
      const blocked=function(name){
        const label=String(name||"Document");
        try{if(typeof global.logEvent==="function")global.logEvent("DOCUMENT_DRAFT_UNAVAILABLE",{name:label})}catch{}
        if(typeof global.notifyUser==="function")global.notifyUser(`${label} draft generation is not available in this release. No document or background workflow has been created.`);
        return false;
      };
      blocked.__thebeDocumentCapabilityBoundary=true;global.generateDoc=blocked;generateReady=true;
    }else generateReady=typeof global.generateDoc==="function";
    return renderReady&&generateReady;
  }
  function start(){
    if(install())return;
    let attempts=0;const timer=global.setInterval(()=>{attempts+=1;if(install()||attempts>=80)global.clearInterval(timer)},250);
  }
  if(doc.readyState==="loading")doc.addEventListener("DOMContentLoaded",start,{once:true});else start();
})(window);

(function installEvidenceUploadCapabilityBoundary(global){
  "use strict";
  const doc=global?.document;if(!doc)return;
  function productionMode(){return String(doc.querySelector?.('meta[name="bw-runtime-mode"]')?.content||"production").toLowerCase()==="production"}
  function uploadsEnabled(){return global.__THEBE_EVIDENCE_UPLOADS_ENABLED__===true}
  function uploadsClosed(){return productionMode()&&!uploadsEnabled()}
  function role(){try{return typeof global.currentWorkspaceRole==="function"?String(global.currentWorkspaceRole()||""):""}catch{return ""}}
  function message(text){
    if(typeof global.notifyUser==="function")global.notifyUser(text);
    else{const status=doc.getElementById("srStatus");if(status)status.textContent=text}
  }
  function ensureBoundaryNote(input){
    if(doc.getElementById("evidenceUploadBoundaryNote"))return;
    const note=doc.createElement("div");note.id="evidenceUploadBoundaryNote";note.className="notice";note.setAttribute("role","status");
    const heading=doc.createElement("b");heading.textContent="File uploads are temporarily unavailable.";
    const detail=doc.createElement("div");detail.className="small";detail.textContent="This release can record metadata-only evidence for owner/manager setup, but it cannot accept a file or create file-backed assurance until the secure scanner/storage path is enabled.";
    note.replaceChildren(heading,detail);
    if(input?.insertAdjacentElement)input.insertAdjacentElement("afterend",note);else input?.parentElement?.appendChild?.(note);
  }
  function enforceEvidenceBoundary(){
    if(!uploadsClosed())return;
    const input=doc.getElementById("evFile");
    if(input){input.disabled=true;input.value="";input.setAttribute("aria-disabled","true");input.title="Secure evidence file uploads are temporarily unavailable in this release.";ensureBoundaryNote(input)}
    const addCard=doc.getElementById("vaultAddCard");if(addCard)addCard.dataset.fileUploads="disabled";
  }
  function install(){
    let uiReady=false,addReady=false,openReady=false;
    if(typeof global.syncEvidenceRoleUi==="function"&&!global.syncEvidenceRoleUi.__thebeEvidenceCapabilityBoundary){
      const original=global.syncEvidenceRoleUi;
      const patched=function(){const result=original.apply(this,arguments);enforceEvidenceBoundary();return result};
      patched.__thebeEvidenceCapabilityBoundary=true;global.syncEvidenceRoleUi=patched;uiReady=true;enforceEvidenceBoundary();
    }else uiReady=typeof global.syncEvidenceRoleUi==="function";
    if(typeof global.addEvidence==="function"&&!global.addEvidence.__thebeEvidenceCapabilityBoundary){
      const original=global.addEvidence;
      const patched=async function(){
        if(uploadsClosed()){
          const file=doc.getElementById("evFile")?.files?.[0];
          if(file){message("Secure evidence file uploads are temporarily unavailable in this release. No file or evidence record was saved.");return false}
          if(role()==="reviewer"){message("Reviewer evidence requires the secure file scan and approval path, which is temporarily unavailable in this release. No evidence record was saved.");return false}
        }
        return original.apply(this,arguments);
      };
      patched.__thebeEvidenceCapabilityBoundary=true;global.addEvidence=patched;addReady=true;
    }else addReady=typeof global.addEvidence==="function";
    if(typeof global.openAddEvidence==="function"&&!global.openAddEvidence.__thebeEvidenceCapabilityBoundary){
      const original=global.openAddEvidence;
      const patched=function(){
        if(uploadsClosed()&&role()==="reviewer"){message("Reviewer evidence submission is temporarily unavailable because secure file uploads are closed in this release.");return false}
        const result=original.apply(this,arguments);enforceEvidenceBoundary();return result;
      };
      patched.__thebeEvidenceCapabilityBoundary=true;global.openAddEvidence=patched;openReady=true;
    }else openReady=typeof global.openAddEvidence==="function";
    return uiReady&&addReady&&openReady;
  }
  function start(){
    enforceEvidenceBoundary();if(install())return;
    let attempts=0;const timer=global.setInterval(()=>{attempts+=1;enforceEvidenceBoundary();if(install()||attempts>=80)global.clearInterval(timer)},250);
  }
  if(doc.readyState==="loading")doc.addEventListener("DOMContentLoaded",start,{once:true});else start();
})(window);

/**
 * Lovely quotations: a first-class entry in the existing workspace sidebar.
 * Capability discovery is a GET against the server-authorized owner/tenant
 * route, never a client-side claim that a user may create quotations.
 */
(function installLovelyQuotationWorkspaceNavigation(global){
  "use strict";
  const document=global.document;
  const ROUTE="/app/quotations/customer-ready/";
  const ID="workspaceCustomerQuotationNav";
  if(!document||typeof global.BW?.api?.createClient!=="function")return;
  function mount(){
    const nav=document.getElementById("nav");
    const after=nav?.querySelector('button[data-view="moneyhub"]');
    const shell=document.getElementById("appShell");
    const roleLabel=document.getElementById("roleLabel");
    if(!nav||!shell||!roleLabel||document.getElementById(ID))return;
    const button=document.createElement("button");
    button.id=ID;
    button.type="button";
    button.className="nav-primary nav-quotation-entry";
    button.setAttribute("aria-label","Create customer quotation");
    button.title="Create quotation";
    const icon=document.createElement("span");
    icon.className="nav-primary-icon";
    icon.setAttribute("aria-hidden","true");
    icon.textContent="▤";
    const label=document.createElement("span");
    label.textContent="Quotations";
    button.append(icon,label);
    if(after)after.after(button);else nav.append(button);
    const style=document.createElement("style");
    style.textContent="#"+ID+"[hidden]{display:none!important}#"+ID+"{width:100%;text-align:left;cursor:pointer;min-height:44px} @media(max-width:620px){#"+ID+"{display:flex!important;align-items:center;gap:10px;white-space:normal;min-height:48px!important}#"+ID+" .nav-primary-icon{flex:0 0 28px}}";
    document.head.append(style);
    let revision=0,scheduled=false,granted=false;
    const ready=()=>global.__THEBE_WORKSPACE_READY__===true&&
      roleLabel.textContent.trim().toLowerCase()==="owner"&&
      shell.style.display!=="none"&&shell.style.visibility!=="hidden"&&
      !shell.classList.contains("hidden");
    function conceal(){granted=false;button.hidden=true;button.disabled=true}
    function probe(epoch){
      if(epoch!==revision||!ready())return;
      // All network access goes through the hardened centralized transport.
      // The existing server route returns this title only after exact tenant,
      // owner role, onboarding and session authorization.
      Promise.resolve().then(()=>global.BW.api.createClient({retries:0}).request(ROUTE,{method:"GET"}))
        .then(response=>{
          if(epoch!==revision||!ready())return;
          const documentStart=String(response?.message||"");
          granted=documentStart.startsWith("<!doctype html>")&&
            documentStart.includes("<title>Customer quotation | Thebe Desk</title>");
          button.hidden=!granted;button.disabled=!granted;
        }).catch(()=>{if(epoch===revision)conceal()});
    }
    function sync(){
      revision++;
      conceal();
      if(scheduled)return;
      scheduled=true;
      Promise.resolve().then(()=>{scheduled=false;probe(revision)});
    }
    button.addEventListener("click",()=>{
      if(!granted||!ready())return;
      global.location.assign(ROUTE); // Server rechecks owner, tenant and session.
    });
    new MutationObserver(sync).observe(roleLabel,{childList:true,characterData:true,subtree:true});
    new MutationObserver(sync).observe(shell,{attributes:true,attributeFilter:["class","style"]});
    global.addEventListener("thebe:workspace-ready",sync);
    global.addEventListener("pageshow",event=>{if(event.persisted)sync()});
    conceal();
    if(global.__THEBE_WORKSPACE_READY__===true)sync();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});
  else mount();
})(window);

(function installDailyReportUi(global){
"use strict";
function renderOpsBranches(branches,{escapeHtml,moneyBwp,trendLabel}){
 const box=document.getElementById("opsBranchPerformance");if(!box)return;
 if(!Array.isArray(branches)){box.safeHTML='<div class="notice info">Location reporting is unavailable. Refresh to retry.</div>';return}
 if(!branches.length){box.safeHTML='<div class="muted small">No locations returned for this filter.</div>';return}
 const count=v=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0?v:null;
 const value=v=>count(v)===null?"—":String(v);
 const metric=(label,text,trend="")=>`<div class="ops-branch-metric"><small>${label}</small><b>${text}</b>${trend?'<small class="ops-trend">'+escapeHtml(trend)+'</small>':""}</div>`;
 box.safeHTML=branches.map(b=>{
  const expected=count(b.expected),received=count(b.submittedExpected),submitted=count(b.submitted),missing=expected!==null&&received!==null&&received<=expected?expected-received:null;
  const coverage=expected===0?"Not expected":expected!==null&&received!==null&&received<=expected&&typeof b.coverage==="number"&&b.coverage>=0&&b.coverage<=100?String(b.coverage)+"%":"—";
  const status=missing===null?"Reporting status unavailable":expected===0?"No reports expected":missing===0?"All expected reports received":"Reports awaiting follow-up";
  const optional=submitted!==null&&received!==null&&submitted>=received?submitted-received:null;
  const revenue=typeof b.revenue==="number"&&Number.isFinite(b.revenue)?escapeHtml(moneyBwp(b.revenue)):"—";
  return `<article class="ops-branch-card" aria-label="Location report: ${escapeHtml(b.name||"Location")}"><div class="ops-branch-card-head"><div><b>${escapeHtml(b.name||"Location")}</b><small>${status}</small></div><span class="badge">${coverage}</span></div><div class="ops-branch-counts">${metric("Expected",value(expected))}${metric("Received",value(received))}${metric("Missing",value(missing))}</div><div class="muted small">Optional reports: ${value(optional)} · Not expected: ${value(b.excused)}</div><div class="ops-branch-output">${metric("Tasks",value(b.tasks),typeof b.trend?.tasks==="number"?trendLabel(b.trend.tasks):"")}${metric("Customers / jobs",value(b.customers),typeof b.trend?.customers==="number"?trendLabel(b.trend.customers):"")}${metric("Revenue",revenue,typeof b.trend?.revenue==="number"?trendLabel(b.trend.revenue,"P"):"")}${metric("Incidents",value(b.incidents))}${metric("Attention",value(b.attention))}</div></article>`;
 }).join("");
}
function clearOpsDashboard(message="Reporting data unavailable. Refresh to retry.",setText){
 if(message==="Loading reporting data…"){setText("opsSummaryMode","Loading");setText("opsAiSummary","Loading management summary…");}
 for(const id of ["opsCoverage","opsReportsReceived","opsReportOrb","opsVisualReceived","opsVisualExpected","opsVisualFollowup","opsExpectedReports","opsLocationsReporting","opsLocationOrb","opsAttention","opsAttentionOrb","opsMissingCount"])setText(id,"—");
 const track=document.getElementById("opsCoverageTrack");if(track)track.style.width="0%";
 for(const id of ["opsBranchPerformance","opsMissingReports","opsReportsList","opsReportingExceptions"]){const node=document.getElementById(id);if(node)node.textContent=message}
 const wrap=document.getElementById("opsReportingExceptionsWrap");if(wrap)wrap.style.display="none";
}
function opsDashboardAvailable(dashboard){return !!dashboard&&Array.isArray(dashboard.branches)&&Array.isArray(dashboard.reports)&&Array.isArray(dashboard.missing)&&Array.isArray(dashboard.exceptions)&&Number.isSafeInteger(dashboard.reportingPopulation?.expected)&&dashboard.reportingPopulation.expected>=0&&typeof dashboard.coverage==="number"&&Number.isFinite(dashboard.coverage);}
global.BW.dailyReportUi=Object.freeze({render:renderOpsBranches,clear:clearOpsDashboard,available:opsDashboardAvailable});
})(window);
