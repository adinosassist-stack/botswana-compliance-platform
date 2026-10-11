(()=>{
"use strict";
const RELEASE="20261011-reporter-evidence-v332";
const MAX_BYTES=Math.floor(3.5*1024*1024);
const ALLOWED=new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
const byId=id=>document.getElementById(id);
const node=(tag,{id="",className="",text="",attrs={}}={})=>{
  const el=document.createElement(tag);
  if(id)el.id=id;
  if(className)el.className=className;
  if(text)el.textContent=text;
  for(const [name,value] of Object.entries(attrs)){
    if(value===true)el.setAttribute(name,"");
    else if(value!==false&&value!=null)el.setAttribute(name,String(value));
  }
  return el;
};
function readToken(){const hash=String(location.hash||"");if(!hash.startsWith("#report="))return "";try{return decodeURIComponent(hash.slice(8)).trim()}catch{return ""}}
function setStatus(text,state=""){const el=byId("reporterEvidenceStatus");if(!el)return;el.textContent=String(text||"");el.dataset.state=state}
function api(){return globalThis.BW?.api?.createClient?.({timeoutMs:30000,retries:0})||null}
function injectCss(){if(document.querySelector('link[data-reporter-evidence-v332]'))return;const link=document.createElement("link");link.rel="stylesheet";link.href="/assets/reporter-evidence-v332.css?v=20261011a";link.dataset.reporterEvidenceV332="1";document.head.appendChild(link)}
function rowLabel(category){return {receipt:"Receipt",payment_proof:"Payment proof",work_photo:"Work photo",other:"Other"}[category]||"Evidence"}
function addQueueItem(file,category,result){const list=byId("reporterEvidenceQueue");if(!list)return;const li=node("li"),strong=node("strong",{text:`${rowLabel(category)} · ${file.name}`}),span=node("span",{text:result.scanStatus==="clean"?"Scan clean":"Queued for scan"});li.append(strong,span);list.prepend(li)}
function field(labelText,control,{className=""}={}){const label=node("label",{className,text:labelText});label.appendChild(control);return label}
function option(value,text){const item=node("option",{text});item.value=value;return item}
function buildEvidenceSection(){
  const section=node("section",{id:"reporterEvidenceV332",className:"reporter-evidence-v332"});section.dataset.release=RELEASE;
  section.appendChild(node("h3",{text:"Receipts & photos"}));
  const intro=node("p");intro.append("Attach proof to this daily report. Evidence stays ",node("strong",{text:"Reported"})," and quarantined until Thebe's malware scan and management review clear it. Uploading proof does not automatically verify revenue.");section.appendChild(intro);
  const grid=node("div",{className:"reporter-evidence-grid"});
  const category=node("select",{id:"reporterEvidenceCategory"});category.append(option("receipt","Receipt"),option("payment_proof","Payment / deposit proof"),option("work_photo","Work / site photo"),option("other","Other"));
  const amount=node("input",{id:"reporterEvidenceAmount",attrs:{type:"number",min:"0",step:"0.01",inputmode:"decimal",placeholder:"0.00"}});
  const file=node("input",{id:"reporterEvidenceFile",attrs:{type:"file",accept:"image/jpeg,image/png,image/webp,application/pdf"}});
  const reference=node("input",{id:"reporterEvidenceReference",attrs:{maxlength:"160",autocomplete:"off",placeholder:"Receipt / deposit reference"}});
  const note=node("textarea",{id:"reporterEvidenceNote",attrs:{maxlength:"500",placeholder:"What this evidence supports"}});
  grid.append(field("Evidence type",category),field("Amount (P), optional",amount),field("Photo or PDF",file,{className:"reporter-evidence-file"}),field("Reference, optional",reference),field("Note, optional",note,{className:"reporter-evidence-note"}));section.appendChild(grid);
  const actions=node("div",{className:"reporter-evidence-actions"});actions.append(node("button",{id:"reporterEvidenceUpload",className:"reporter-evidence-upload",text:"Attach evidence",attrs:{type:"button"}}),node("span",{id:"reporterEvidenceStatus",className:"reporter-evidence-status",text:"Submit the daily report first if it has not been saved yet."}));section.appendChild(actions);
  section.append(node("ul",{id:"reporterEvidenceQueue",className:"reporter-evidence-queue",attrs:{"aria-live":"polite"}}),node("p",{className:"reporter-evidence-privacy",text:"Accepted: JPG, PNG, WebP or PDF up to 3.5 MB. Files are private evidence; no public file URL is created."}));
  return section;
}
function mount(){
  if(byId("reporterEvidenceV332"))return;
  const form=byId("reporterDailyForm");if(!form)return;
  injectCss();
  const section=buildEvidenceSection();
  const submit=byId("reporterSubmitBtn");if(submit?.parentNode)submit.parentNode.insertBefore(section,submit);else form.appendChild(section);
  byId("reporterEvidenceUpload")?.addEventListener("click",upload);
}
async function upload(){
  const client=api(),button=byId("reporterEvidenceUpload"),file=byId("reporterEvidenceFile")?.files?.[0],token=readToken(),reportDate=byId("reporterDate")?.value||"";
  if(!client){setStatus("Evidence service could not start. Reload the private report link.","error");return}
  if(token.length<32||token.length>128){setStatus("The private reporting link is incomplete.","error");return}
  if(!file){setStatus("Choose a receipt, proof document or photo first.","error");return}
  if(!ALLOWED.has(String(file.type||"").toLowerCase())){setStatus("Use JPG, PNG, WebP or PDF evidence.","error");return}
  if(file.size<=0||file.size>MAX_BYTES){setStatus("Evidence must be smaller than 3.5 MB.","error");return}
  const category=byId("reporterEvidenceCategory")?.value||"other",amount=byId("reporterEvidenceAmount")?.value||"",reference=byId("reporterEvidenceReference")?.value||"",note=byId("reporterEvidenceNote")?.value||"";
  const headers=new Headers({"content-type":file.type,"x-report-token":token,"x-report-date":reportDate,"x-evidence-category":category,"x-file-name":file.name,"x-evidence-reference":reference,"x-evidence-note":note});if(amount)headers.set("x-evidence-amount-bwp",amount);
  button.disabled=true;button.textContent="Uploading…";setStatus("Uploading private evidence…");
  try{
    const result=await client.request("/public/daily-reporting/evidence",{method:"POST",headers,body:file,cache:"no-store",referrerPolicy:"no-referrer"});
    addQueueItem(file,category,result);setStatus("Evidence attached. It is reported and queued for security scanning.","success");byId("reporterEvidenceFile").value="";byId("reporterEvidenceReference").value="";byId("reporterEvidenceNote").value="";byId("reporterEvidenceAmount").value="";
  }catch(error){
    const code=String(error?.code||error?.data?.error||"");
    if(code==="report_required_before_evidence")setStatus("Send the daily report first, then attach this evidence.","error");
    else if(code==="evidence_uploads_disabled"||code==="evidence_scanner_not_configured")setStatus("Evidence upload is temporarily unavailable while secure scanning is being configured.","error");
    else if(code==="invalid_or_expired_report_link")setStatus("This private reporting link is invalid or expired. Ask your manager for a new link.","error");
    else setStatus(String(error?.message||"Evidence could not be uploaded. Check your connection and try again."),"error");
  }finally{button.disabled=false;button.textContent="Attach evidence"}
}
window.addEventListener("thebe:daily-report-submitted",()=>setStatus("Report saved. You can now attach receipts, payment proof or work photos."));
document.addEventListener("DOMContentLoaded",()=>{const tryMount=()=>{mount();if(!byId("reporterEvidenceV332"))setTimeout(tryMount,80)};tryMount()});
})();
