(()=>{
"use strict";
const RELEASE="20261011-reporter-evidence-v332";
const MAX_BYTES=Math.floor(3.5*1024*1024);
const ALLOWED=new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
const byId=id=>document.getElementById(id);
function readToken(){const hash=String(location.hash||"");if(!hash.startsWith("#report="))return "";try{return decodeURIComponent(hash.slice(8)).trim()}catch{return ""}}
function setStatus(text,state=""){const el=byId("reporterEvidenceStatus");if(!el)return;el.textContent=String(text||"");el.dataset.state=state}
function api(){return globalThis.BW?.api?.createClient?.({timeoutMs:30000,retries:0})||null}
function injectCss(){if(document.querySelector('link[data-reporter-evidence-v332]'))return;const link=document.createElement("link");link.rel="stylesheet";link.href="/assets/reporter-evidence-v332.css?v=20261011a";link.dataset.reporterEvidenceV332="1";document.head.appendChild(link)}
function rowLabel(category){return {receipt:"Receipt",payment_proof:"Payment proof",work_photo:"Work photo",other:"Other"}[category]||"Evidence"}
function addQueueItem(file,category,result){const list=byId("reporterEvidenceQueue");if(!list)return;const li=document.createElement("li"),strong=document.createElement("strong"),span=document.createElement("span");strong.textContent=`${rowLabel(category)} · ${file.name}`;span.textContent=result.scanStatus==="clean"?"Scan clean":"Queued for scan";li.append(strong,span);list.prepend(li)}
function mount(){
  if(byId("reporterEvidenceV332"))return;
  const form=byId("reporterDailyForm");if(!form)return;
  injectCss();
  const section=document.createElement("section");section.id="reporterEvidenceV332";section.className="reporter-evidence-v332";section.dataset.release=RELEASE;
  section.innerHTML=`<h3>Receipts & photos</h3><p>Attach proof to this daily report. Evidence stays <strong>Reported</strong> and quarantined until Thebe's malware scan and management review clear it. Uploading proof does not automatically verify revenue.</p><div class="reporter-evidence-grid"><label>Evidence type<select id="reporterEvidenceCategory"><option value="receipt">Receipt</option><option value="payment_proof">Payment / deposit proof</option><option value="work_photo">Work / site photo</option><option value="other">Other</option></select></label><label>Amount (P), optional<input id="reporterEvidenceAmount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00"></label><label class="reporter-evidence-file">Photo or PDF<input id="reporterEvidenceFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label><label>Reference, optional<input id="reporterEvidenceReference" maxlength="160" autocomplete="off" placeholder="Receipt / deposit reference"></label><label class="reporter-evidence-note">Note, optional<textarea id="reporterEvidenceNote" maxlength="500" placeholder="What this evidence supports"></textarea></label></div><div class="reporter-evidence-actions"><button id="reporterEvidenceUpload" class="reporter-evidence-upload" type="button">Attach evidence</button><span id="reporterEvidenceStatus" class="reporter-evidence-status">Submit the daily report first if it has not been saved yet.</span></div><ul id="reporterEvidenceQueue" class="reporter-evidence-queue" aria-live="polite"></ul><p class="reporter-evidence-privacy">Accepted: JPG, PNG, WebP or PDF up to 3.5 MB. Files are private evidence; no public file URL is created.</p>`;
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
