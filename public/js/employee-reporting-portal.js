(()=>{
"use strict";
let reporterToken="";
const attachmentState=[];
let attachmentQueue=Promise.resolve();
let pendingSelections=0;
let submitting=false;
const MAX_ATTACHMENTS=3;
const MAX_FILE_BYTES=3*1024*1024;
const MAX_TOTAL_BYTES=6*1024*1024;
const MAX_IMAGE_EDGE=1920;
const IMAGE_QUALITY=.82;
const ALLOWED_DIRECT_TYPES=new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
const byId=id=>document.getElementById(id);
function setMessage(id,text,show=true){const el=byId(id);if(!el)return;el.textContent=String(text||"");el.hidden=!show}
function networkStatus(){const el=byId("reporterDraftStatus");if(!el)return;el.textContent=navigator.onLine?"Entries stay on this page until sent. Sensitive report text is not saved in browser storage.":"Offline — keep this page open. Your entries remain here; retry when connectivity returns."}
function errorMessage(error){
  const code=String(error?.code||"");
  if(code==="reporting_link_invalid_or_expired")return "This reporting link is invalid, expired or has been replaced. Ask your manager for a fresh reporting link.";
  if(code==="daily_reporting_not_in_active_plan")return "Employee reporting is currently unavailable for this company. Ask your manager to review the workspace plan.";
  if(code==="report_attachment_type_not_allowed")return "One of the attachments is not an accepted image or PDF.";
  if(code==="report_attachment_too_large")return "One of the attachments is too large. Keep each file under 3 MB.";
  if(code==="report_attachments_too_large")return "The selected attachments are too large together. Keep the total under 6 MB.";
  if(code==="report_attachment_grant_invalid")return "The attachment upload window expired. Submit the report again to get a fresh upload window.";
  if(error?.name==="AbortError")return "The connection took too long. Check your network and reopen the reporting link.";
  return String(error?.message||"The reporting link could not be verified. Check your connection and try again.");
}
const reporterApiClient=globalThis.BW?.api?.createClient?.({timeoutMs:45000,retries:1})||null;
const attachmentApiClient=globalThis.BW?.api?.createClient?.({timeoutMs:60000,retries:0})||null;
async function request(path,options={}){
  if(!reporterApiClient)throw new Error("The reporting service could not start. Reload the private reporting link.");
  return reporterApiClient.request(path,{...options,cache:"no-store",referrerPolicy:"no-referrer"});
}
async function attachmentRequest(path,options={}){
  if(!attachmentApiClient)throw new Error("The attachment service could not start. Reload the private reporting link.");
  return attachmentApiClient.request(path,{...options,cache:"no-store",referrerPolicy:"no-referrer"});
}
function readToken(){
  const hash=String(location.hash||"");
  if(!hash.startsWith("#report="))return "";
  try{return decodeURIComponent(hash.slice("#report=".length)).trim()}catch{return ""}
}
function humanBytes(bytes){
  const n=Number(bytes)||0;
  if(n<1024)return `${n} B`;
  if(n<1024*1024)return `${(n/1024).toFixed(1)} KB`;
  return `${(n/(1024*1024)).toFixed(1)} MB`;
}
function attachmentTotalBytes(){return attachmentState.reduce((sum,item)=>sum+Number(item.file?.size||0),0)}
function setAttachmentStatus(text,isError=false){
  const el=byId("reportAttachmentStatus");
  if(!el)return;
  el.textContent=String(text||"");
  el.classList.toggle("is-error",Boolean(isError));
}
function revokeItem(item){if(item?.previewUrl){try{URL.revokeObjectURL(item.previewUrl)}catch{}}}
function clearAttachments(){attachmentState.splice(0).forEach(revokeItem);renderAttachments()}
function removeAttachment(index){
  if(submitting)return;
  if(index<0||index>=attachmentState.length)return;
  revokeItem(attachmentState[index]);attachmentState.splice(index,1);renderAttachments();
}
function renderAttachments(){
  const list=byId("reportAttachmentList");if(!list)return;list.replaceChildren();
  attachmentState.forEach((item,index)=>{
    const row=document.createElement("div");row.className="report-attachment-item";
    const media=document.createElement("div");media.className="report-attachment-thumb";
    if(item.previewUrl){const img=document.createElement("img");img.src=item.previewUrl;img.alt="Selected attachment preview";media.appendChild(img)}
    else{const badge=document.createElement("span");badge.textContent="PDF";media.appendChild(badge)}
    const meta=document.createElement("div");meta.className="report-attachment-meta";
    const name=document.createElement("strong");name.textContent=item.file.name||"Attachment";
    const detail=document.createElement("small");detail.textContent=`${item.source==="camera"?"Camera photo":"File"} · ${humanBytes(item.file.size)}`;
    meta.append(name,detail);
    const remove=document.createElement("button");remove.type="button";remove.className="report-attachment-remove";remove.textContent="Remove";remove.setAttribute("aria-label",`Remove ${item.file.name||"attachment"}`);remove.addEventListener("click",()=>removeAttachment(index));
    row.append(media,meta,remove);list.appendChild(row);
  });
  if(!attachmentState.length)setAttachmentStatus("No attachments selected.");
  else setAttachmentStatus(`${attachmentState.length} of ${MAX_ATTACHMENTS} selected · ${humanBytes(attachmentTotalBytes())} total`);
}
function jpegName(name){
  const base=String(name||"photo").replace(/\.[^.]+$/,"" ).replace(/[^a-zA-Z0-9._ -]+/g,"-").trim().slice(0,90)||"photo";
  return `${base}.jpg`;
}
async function decodeImage(file){
  if("createImageBitmap" in globalThis){
    const bitmap=await createImageBitmap(file);
    return {width:bitmap.width,height:bitmap.height,draw:(ctx,w,h)=>ctx.drawImage(bitmap,0,0,w,h),close:()=>bitmap.close?.()};
  }
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const node=new Image();node.onload=()=>resolve(node);node.onerror=()=>reject(new Error("This photo format could not be opened on this device."));node.src=url});
    return {width:img.naturalWidth,height:img.naturalHeight,draw:(ctx,w,h)=>ctx.drawImage(img,0,0,w,h),close:()=>{}};
  }finally{URL.revokeObjectURL(url)}
}
async function optimizeImage(file){
  const decoded=await decodeImage(file);
  try{
    const scale=Math.min(1,MAX_IMAGE_EDGE/Math.max(decoded.width,decoded.height));
    const width=Math.max(1,Math.round(decoded.width*scale));
    const height=Math.max(1,Math.round(decoded.height*scale));
    const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext("2d",{alpha:false});if(!ctx)throw new Error("Photo processing is unavailable on this device.");
    ctx.fillStyle="#fff";ctx.fillRect(0,0,width,height);decoded.draw(ctx,width,height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",IMAGE_QUALITY));
    if(!blob)throw new Error("The photo could not be prepared for upload.");
    return new File([blob],jpegName(file.name),{type:"image/jpeg",lastModified:Date.now()});
  }finally{decoded.close()}
}
async function prepareAttachment(file,source){
  if(!(file instanceof File))throw new Error("The selected attachment could not be read.");
  let prepared=file;
  if(String(file.type||"").startsWith("image/")){
    try{prepared=await optimizeImage(file)}catch(err){if(ALLOWED_DIRECT_TYPES.has(file.type)&&file.size<=MAX_FILE_BYTES)prepared=file;else throw err}
  }else if(file.type!=="application/pdf")throw new Error("Only photos, images and PDF files are accepted.");
  if(!ALLOWED_DIRECT_TYPES.has(prepared.type))throw new Error("Only JPEG, PNG, WebP and PDF files are accepted.");
  if(prepared.size>MAX_FILE_BYTES)throw new Error("This attachment is larger than 3 MB after preparation.");
  const previewUrl=prepared.type.startsWith("image/")?URL.createObjectURL(prepared):"";
  return {file:prepared,source:source==="camera"?"camera":"file",previewUrl};
}
function addFiles(files,source){
  if(submitting)return Promise.resolve();
  const incoming=Array.from(files||[]);
  if(!incoming.length)return Promise.resolve();
  pendingSelections++;
  updateAttachmentControls();
  const task=attachmentQueue.then(()=>prepareFiles(incoming,source));
  attachmentQueue=task.catch(()=>{});
  return task.finally(()=>{pendingSelections--;updateAttachmentControls()});
}
function updateAttachmentControls(){
  const busy=submitting||pendingSelections>0;
  const button=byId("reporterSubmitBtn");if(button)button.disabled=busy;
  for(const id of ["reportCameraInput","reportFileInput"]){const input=byId(id);if(input)input.disabled=submitting}
  byId("reportAttachmentList")?.querySelectorAll?.("button").forEach(button=>{button.disabled=submitting});
}
async function prepareFiles(files,source){
  const incoming=Array.from(files||[]);if(!incoming.length)return;
  if(attachmentState.length>=MAX_ATTACHMENTS){setAttachmentStatus(`Maximum ${MAX_ATTACHMENTS} attachments per submission.`,true);return}
  setAttachmentStatus(source==="camera"?"Preparing camera photo…":"Preparing attachment…");
  for(const file of incoming){
    if(attachmentState.length>=MAX_ATTACHMENTS){setAttachmentStatus(`Maximum ${MAX_ATTACHMENTS} attachments per submission.`,true);break}
    try{
      const item=await prepareAttachment(file,source);
      if(attachmentTotalBytes()+item.file.size>MAX_TOTAL_BYTES){revokeItem(item);setAttachmentStatus("Attachments exceed the 6 MB total limit. Remove a file or choose a smaller one.",true);break}
      attachmentState.push(item);renderAttachments();
    }catch(err){setAttachmentStatus(String(err?.message||"This attachment could not be added."),true)}
  }
}
function bytesToBase64(buffer){
  const bytes=new Uint8Array(buffer);let binary="";const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
  return btoa(binary);
}
async function serializeAttachments(){
  const result=[];
  for(const item of attachmentState){const buffer=await item.file.arrayBuffer();result.push({name:item.file.name,type:item.file.type,size:item.file.size,source:item.source,data:bytesToBase64(buffer)})}
  return result;
}
const MAX_REPORT_JOBS=8;
function jobRows(){return Array.from(byId("reporterJobs")?.querySelectorAll(".thebe-delivery-job")||[])}
function createJobRow(){
  const row=document.createElement("div");row.className="thebe-delivery-job";
  const heading=document.createElement("div");heading.className="thebe-delivery-job-heading";
  const name=document.createElement("strong");name.textContent="Additional job";
  const remove=document.createElement("button");remove.type="button";remove.textContent="Remove job";remove.className="thebe-remove-job";
  remove.addEventListener("click",()=>{row.remove();updateJobCount()});
  heading.append(name,remove);row.append(heading);
  const grid=document.createElement("div");grid.className="thebe-delivery-grid";
  function field(key,title,kind,options=[]){
    const box=document.createElement("div");box.className="field";
    const label=document.createElement("label");label.textContent=title;
    const input=document.createElement(kind==="select"?"select":"input");input.dataset.jobField=key;
    if(kind==="select"){for(const [value,text] of options){const option=document.createElement("option");option.value=value;option.textContent=text;input.append(option)}}
    else{input.type=kind; if(key==="jobReference"){input.maxLength=80;input.autocomplete="off";input.placeholder="e.g. LT-1025"}}
    label.append(input);box.append(label);grid.append(box);
  }
  field("jobReference","Order / job reference","text");
  field("jobType","Work type","select",[["","Select type"],["delivery","Delivery"],["installation","Installation"]]);
  field("scheduledDate","Scheduled delivery / installation date","date");
  field("jobStatus","Job status","select",[["scheduled","Scheduled"],["completed","Completed"],["cancelled","Cancelled"]]);
  row.append(grid);return row;
}
function updateJobCount(){
  const n=jobRows().length,add=byId("reporterAddJob");
  if(add)add.disabled=n>=MAX_REPORT_JOBS;
  const status=byId("reporterJobCount");
  if(status)status.textContent=`${n} of ${MAX_REPORT_JOBS} job entries available. Leave an entry blank when there is no job to report.`;
}
function collectReportJobs(){
  const jobs=[],seen=new Set();
  for(const row of jobRows()){
    const val=key=>String(row.querySelector(`[data-job-field="${key}"]`)?.value||"").trim();
    const jobReference=val("jobReference"),jobType=val("jobType"),scheduledDate=val("scheduledDate"),jobStatus=val("jobStatus")||"scheduled";
    if(!jobReference&&!jobType&&!scheduledDate&&jobStatus==="scheduled")continue;
    if(!jobReference||!jobType||!scheduledDate)return {error:"For each delivery or installation, enter a job reference, work type and scheduled date."};
    const key=jobType+"|"+jobReference.toLocaleLowerCase("en");
    if(seen.has(key))return {error:"This job reference and work type is entered twice. Keep only one update per job."};
    seen.add(key);jobs.push({jobReference,jobType,scheduledDate,jobStatus});
  }
  return {jobs};
}
function fillJobRow(row,job){
  for(const field of ["jobReference","jobType","scheduledDate","jobStatus"]){
    const node=row.querySelector(`[data-job-field="${field}"]`);
    if(node)node.value=String(job?.[field]|| (field==="jobStatus"?"scheduled":""));
  }
}
function restoreTodayDraft(draft){
  if(!draft||typeof draft!=="object")return;
  const fields={
    reporterWorkSummary:draft.workSummary,reporterWins:draft.wins,reporterBlockers:draft.blockers,
    reporterIncidents:draft.incidents,reporterNextPlan:draft.nextPlan,
    reporterTasks:draft.kpis?.tasksCompleted,reporterCustomers:draft.kpis?.customersHandled,
    reporterRevenue:draft.kpis?.revenueBwp,reporterIncidentCount:draft.kpis?.incidentsCount,
    reporterCustomLabel:draft.kpis?.customLabel,reporterCustomValue:draft.kpis?.customValue
  };
  for(const [id,value] of Object.entries(fields)){
    const input=byId(id);if(input&&value!==null&&value!==undefined)input.value=String(value);
  }
  const attention=byId("reporterNeedsAttention");if(attention)attention.checked=Boolean(draft.needsAttention);
  if(Number(draft.revisionCount)>=7)setMessage("reporterPortalError","This day's report has nearly reached its correction limit. Review all entries carefully before another submission.");
  updateQualityGuide();
}
function restoreCurrentJobs(jobs){
  if(!Array.isArray(jobs)||!jobs.length)return;
  for(let i=0;i<Math.min(jobs.length,MAX_REPORT_JOBS);i++){
    const row=i===0?jobRows()[0]:createJobRow();
    if(!row)continue;
    if(i>0)byId("reporterJobs")?.append(row);
    fillJobRow(row,jobs[i]);
  }
  updateJobCount();
}
function selectReminderJob(item){
  const rows=jobRows();
  const key=String(item.jobReference||"").trim().toLocaleLowerCase("en");
  let row=rows.find(candidate=>
    String(candidate.querySelector('[data-job-field="jobReference"]')?.value||"").trim().toLocaleLowerCase("en")===key&&
    candidate.querySelector('[data-job-field="jobType"]')?.value===item.jobType
  );
  if(!row)row=rows.find(candidate=>{
    const ref=candidate.querySelector('[data-job-field="jobReference"]')?.value||"";
    return !String(ref).trim();
  });
  if(!row&&rows.length<MAX_REPORT_JOBS){row=createJobRow();byId("reporterJobs")?.append(row)}
  if(!row){setMessage("reporterPortalError","The report already has eight job entries. Remove an unused entry before updating this job.");return}
  fillJobRow(row,{...item,jobStatus:"scheduled"});
  updateJobCount();
  row.querySelector('[data-job-field="jobStatus"]')?.focus();
  row.scrollIntoView({block:"center",behavior:"smooth"});
}
function updateQualityGuide(){
  const summary=String(byId("reporterWorkSummary")?.value||"").trim();
  const next=String(byId("reporterNextPlan")?.value||"").trim();
  const blockers=String(byId("reporterBlockers")?.value||"").trim();
  const incidents=String(byId("reporterIncidents")?.value||"").trim();
  const count=[summary.length>=20,next.length>=12,Boolean(blockers||incidents)].filter(Boolean).length;
  const guide=byId("reporterQualityGuide");
  if(!guide)return;
  const remaining=[];
  if(summary.length<20)remaining.push("explain completed work");
  if(next.length<12)remaining.push("state the next action");
  if(!blockers&&!incidents)remaining.push("state blockers or write 'None' when applicable");
  guide.textContent=count===3?"Report guide complete — check that the details are accurate.":`Reporting guide ${count}/3: ${remaining.join("; ")}.`;
}
function bindJobsAndQuality(){
  byId("reporterAddJob")?.addEventListener("click",()=>{
    const parent=byId("reporterJobs");if(!parent||jobRows().length>=MAX_REPORT_JOBS)return;
    const row=createJobRow();parent.append(row);updateJobCount();row.querySelector("[data-job-field=jobReference]")?.focus();
  });
  for(const id of ["reporterWorkSummary","reporterNextPlan","reporterBlockers","reporterIncidents"]){
    byId(id)?.addEventListener("input",updateQualityGuide);
  }
  updateJobCount();updateQualityGuide();
}
function renderDeliveryReminders(items){
  const target=byId("reporterDeliveryReminders");if(!target)return;
  target.replaceChildren();
  for(const item of (Array.isArray(items)?items:[]).slice(0,10)){
    const line=document.createElement("div");line.className="thebe-delivery-reminder";
    line.dataset.urgent=String(item.daysUntil<=1);
    const copy=document.createElement("div");
    const heading=document.createElement("strong");
    const day=item.daysUntil<0?`Overdue by ${Math.abs(item.daysUntil)} day${item.daysUntil===-1?"":"s"}`:item.daysUntil===0?"Due today":item.daysUntil===1?"Due tomorrow":`Due in ${item.daysUntil} days`;
    heading.textContent=`${item.jobType==="installation"?"Installation":"Delivery"} · ${day}`;
    const details=document.createElement("small");
    details.textContent=`${item.jobReference||"Job"} · ${item.scheduledDate||""} · ${item.locationName||"Assigned location"}`;
    copy.append(heading,details);
    const update=document.createElement("button");update.type="button";update.className="thebe-reminder-update";update.textContent="Update";update.setAttribute("aria-label",`Update ${item.jobReference||"job"} status in today's report`);
    update.addEventListener("click",()=>selectReminderJob(item));
    const dismiss=document.createElement("button");dismiss.type="button";dismiss.textContent="×";dismiss.setAttribute("aria-label","Dismiss this reminder");
    dismiss.addEventListener("click",()=>{line.remove();if(!target.children.length)target.hidden=true});
    line.append(copy,update,dismiss);target.appendChild(line);
  }
  target.hidden=!target.children.length;
}
async function refreshDeliveryReminders(){
  if(!reporterToken||document.visibilityState==="hidden")return;
  try{
    const data=await request("/public/daily-reporting/access",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:reporterToken})});
    renderDeliveryReminders(data.deliveryReminders);
  }catch{/* Keep private reports available even if reminder refresh fails. */}
}
async function initialize(){
  reporterToken=readToken();networkStatus();renderAttachments();
  if(reporterToken.length<32||reporterToken.length>128){setMessage("reporterPortalError","This reporting link is incomplete. Open the full private link sent by your manager.");return}
  try{
    const data=await request("/public/daily-reporting/access",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:reporterToken})});
    byId("reporterEmployeeName").textContent=(data.employee?.name||"Employee")+(data.employee?.roleTitle?" · "+data.employee.roleTitle:"");
    byId("reporterLocationName").textContent=(data.location?.name||"Location")+(data.location?.town?" · "+data.location.town:"");
    byId("reporterCompanyName").textContent=data.companyName||"Company";byId("reporterDate").value=data.reportDate||"";byId("reporterDailyForm").hidden=false;restoreTodayDraft(data.currentReportDraft);restoreCurrentJobs(data.currentReportJobs);renderDeliveryReminders(data.deliveryReminders);
  }catch(error){setMessage("reporterPortalError",errorMessage(error))}
}
async function submit(event){
  event.preventDefault();
  if(submitting)return;
  if(pendingSelections){setAttachmentStatus("Please wait while your photos and files are prepared, then send the report.");return}
  const error=byId("reporterPortalError"),success=byId("reporterPortalSuccess"),button=byId("reporterSubmitBtn");error.hidden=true;success.hidden=true;
  const payload={
    token:reporterToken,reportDate:byId("reporterDate").value,workSummary:byId("reporterWorkSummary").value,wins:byId("reporterWins").value,blockers:byId("reporterBlockers").value,incidents:byId("reporterIncidents").value,nextPlan:byId("reporterNextPlan").value,needsAttention:byId("reporterNeedsAttention").checked,
    kpis:{tasksCompleted:byId("reporterTasks").value,customersHandled:byId("reporterCustomers").value,revenueBwp:byId("reporterRevenue").value,incidentsCount:byId("reporterIncidentCount").value,customLabel:byId("reporterCustomLabel").value,customValue:byId("reporterCustomValue").value}
  };
  const scheduled=collectReportJobs();
  if(scheduled.error){setMessage("reporterPortalError",scheduled.error);return}
  if(scheduled.jobs.length===1)Object.assign(payload.kpis,scheduled.jobs[0]);
  else if(scheduled.jobs.length>1)payload.kpis.jobs=scheduled.jobs;
  if(![payload.workSummary,payload.wins,payload.blockers,payload.incidents,payload.nextPlan].some(value=>String(value||"").trim())){setMessage("reporterPortalError","Add at least one report note before sending.");return}
  const hasAttachments=attachmentState.length>0;submitting=true;updateAttachmentControls();button.textContent="Sending report…";
  try{
    const headers={"content-type":"application/json"};if(hasAttachments)headers["x-thebe-report-attachments"]="1";
    const data=await request("/public/daily-reporting/submit",{method:"POST",headers,body:JSON.stringify(payload)});
    let message=(data.message||"Daily report submitted.")+" You can update the same reporting date if you need to correct something.";
    let attachmentsStored=!hasAttachments;
    if(hasAttachments){
      const grant=String(data.attachmentUploadGrant||"");
      if(data.attachmentsStored===false||!grant){
        message+=" The report was saved, but attachment upload could not start. Your selected files are still on this page.";
        setAttachmentStatus("Report saved, but attachment upload is unavailable. Keep these files selected and submit again to retry.",true);
      }else{
        button.textContent="Preparing attachments…";
        try{
          const attachments=await serializeAttachments();button.textContent="Uploading attachments…";
          const uploaded=await attachmentRequest("/public/daily-reporting/attachments",{method:"POST",headers:{"content-type":"application/json","x-report-attachment-grant":grant},body:JSON.stringify({attachments})});
          const added=Number(uploaded.attachmentsAdded||0),skipped=Number(uploaded.attachmentsSkipped||0);
          message+=` ${added} attachment${added===1?"":"s"} saved${skipped?`; ${skipped} duplicate${skipped===1?"":"s"} skipped`:""}.`;
          attachmentsStored=true;clearAttachments();
        }catch(uploadError){
          message+=" The report was saved, but its attachments were not. Your selected files are still on this page so you can retry.";
          setAttachmentStatus(errorMessage(uploadError),true);
        }
      }
    }
    setMessage("reporterPortalSuccess",message);
    refreshDeliveryReminders();
    window.dispatchEvent(new CustomEvent("thebe:daily-report-submitted",{detail:{reportDate:payload.reportDate,reportId:data.reportId||data.id||null,attachmentsStored}}));
    window.scrollTo({top:0,behavior:"smooth"});
  }catch(err){setMessage("reporterPortalError",errorMessage(err))}
  finally{submitting=false;updateAttachmentControls();button.textContent="Send daily report"}
}
function bindAttachments(){
  byId("reportCameraInput")?.addEventListener("change",async event=>{const input=event.currentTarget;await addFiles(input.files,"camera");input.value=""});
  byId("reportFileInput")?.addEventListener("change",async event=>{const input=event.currentTarget;await addFiles(input.files,"file");input.value=""});
}
window.addEventListener("online",networkStatus);window.addEventListener("offline",networkStatus);window.addEventListener("pagehide",event=>{if(!event.persisted)attachmentState.forEach(revokeItem)});
document.addEventListener("DOMContentLoaded",()=>{byId("reporterDailyForm")?.addEventListener("submit",submit);bindAttachments();bindJobsAndQuality();initialize();if(typeof setInterval==="function")setInterval(refreshDeliveryReminders,60*60*1000);document.addEventListener("visibilitychange",()=>{if(!document.hidden)refreshDeliveryReminders()})});
})();