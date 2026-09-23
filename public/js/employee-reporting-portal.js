(()=>{
"use strict";
let reporterToken="";
const byId=id=>document.getElementById(id);
function setMessage(id,text,show=true){const el=byId(id);if(!el)return;el.textContent=String(text||"");el.hidden=!show}
function networkStatus(){const el=byId("reporterDraftStatus");if(!el)return;el.textContent=navigator.onLine?"Entries stay on this page until sent. Sensitive report text is not saved in browser storage.":"Offline — keep this page open. Your entries remain here; retry when connectivity returns."}
function errorMessage(error){
  const code=String(error?.code||"");
  if(code==="reporting_link_invalid_or_expired")return "This reporting link is invalid, expired or has been replaced. Ask your manager for a fresh reporting link.";
  if(code==="daily_reporting_not_in_active_plan")return "Employee reporting is currently unavailable for this company. Ask your manager to review the workspace plan.";
  if(error?.name==="AbortError")return "The connection took too long. Check your network and reopen the reporting link.";
  return String(error?.message||"The reporting link could not be verified. Check your connection and try again.");
}
async function request(path,options={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(path,{...options,credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer",signal:controller.signal,headers:{accept:"application/json",...(options.headers||{})}});
    let body={};try{body=await response.json()}catch{}
    if(!response.ok){const error=new Error(String(body?.message||body?.error||("Request failed ("+response.status+")")));error.code=String(body?.error||"");error.status=response.status;throw error}
    return body;
  }finally{clearTimeout(timer)}
}
function readToken(){
  const hash=String(location.hash||"");
  if(!hash.startsWith("#report="))return "";
  try{return decodeURIComponent(hash.slice("#report=".length)).trim()}catch{return ""}
}
async function initialize(){
  reporterToken=readToken();
  networkStatus();
  if(reporterToken.length<32||reporterToken.length>128){
    setMessage("reporterPortalError","This reporting link is incomplete. Open the full private link sent by your manager.");
    return;
  }
  try{
    const data=await request("/public/daily-reporting/access",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:reporterToken})});
    byId("reporterEmployeeName").textContent=(data.employee?.name||"Employee")+(data.employee?.roleTitle?" · "+data.employee.roleTitle:"");
    byId("reporterLocationName").textContent=(data.location?.name||"Location")+(data.location?.town?" · "+data.location.town:"");
    byId("reporterCompanyName").textContent=data.companyName||"Company";
    byId("reporterDate").value=data.reportDate||"";
    byId("reporterDailyForm").hidden=false;
  }catch(error){setMessage("reporterPortalError",errorMessage(error))}
}
async function submit(event){
  event.preventDefault();
  const error=byId("reporterPortalError"),success=byId("reporterPortalSuccess"),button=byId("reporterSubmitBtn");
  error.hidden=true;success.hidden=true;
  const payload={
    token:reporterToken,
    reportDate:byId("reporterDate").value,
    workSummary:byId("reporterWorkSummary").value,
    wins:byId("reporterWins").value,
    blockers:byId("reporterBlockers").value,
    incidents:byId("reporterIncidents").value,
    nextPlan:byId("reporterNextPlan").value,
    needsAttention:byId("reporterNeedsAttention").checked,
    kpis:{
      tasksCompleted:byId("reporterTasks").value,
      customersHandled:byId("reporterCustomers").value,
      revenueBwp:byId("reporterRevenue").value,
      incidentsCount:byId("reporterIncidentCount").value,
      customLabel:byId("reporterCustomLabel").value,
      customValue:byId("reporterCustomValue").value
    }
  };
  if(![payload.workSummary,payload.wins,payload.blockers,payload.incidents,payload.nextPlan].some(value=>String(value||"").trim())){
    setMessage("reporterPortalError","Add at least one report note before sending.");return;
  }
  button.disabled=true;button.textContent="Sending…";
  try{
    const data=await request("/public/daily-reporting/submit",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
    setMessage("reporterPortalSuccess",(data.message||"Daily report submitted.")+" You can update the same reporting date if you need to correct something.");
    window.scrollTo({top:0,behavior:"smooth"});
  }catch(err){setMessage("reporterPortalError",errorMessage(err))}
  finally{button.disabled=false;button.textContent="Send daily report"}
}
window.addEventListener("online",networkStatus);
window.addEventListener("offline",networkStatus);
document.addEventListener("DOMContentLoaded",()=>{byId("reporterDailyForm")?.addEventListener("submit",submit);initialize()});
})();
