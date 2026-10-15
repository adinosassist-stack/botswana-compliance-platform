(function installOwnerDecisionFollowThroughV331(global){
  "use strict";

  const RELEASE="20261015-owner-decision-follow-through-v331";
  const SECTION_ID="ownerDecisionFollowThrough";
  const STYLE_ID="ownerDecisionFollowThroughStyle";
  const DIALOG_ID="ownerDecisionReviewDialog";
  const REFRESH_MS=60000;
  const q=(selector,root=document)=>root.querySelector(selector);
  let refreshTimer=null;
  let refreshBusy=false;
  let reviewBusy=false;
  let currentRecord=null;

  function role(){
    try{return String(global.currentWorkspaceRole?.()||global.currentUser?.role||"").toLowerCase()}
    catch{return ""}
  }
  function isOwner(){return role()==="owner"}
  function clean(value,max=2000){return String(value??"").replace(/\s+/g," ").trim().slice(0,max)}
  function node(tag,value,className=""){
    const el=document.createElement(tag);
    if(className)el.className=className;
    if(value!==undefined)el.textContent=String(value??"");
    return el;
  }
  function button(label,handler,className="btn soft"){
    const el=node("button",label,className);
    el.type="button";
    el.addEventListener("click",handler);
    return el;
  }
  function apiJson(url,options){
    if(typeof global.apiJson!=="function")throw new Error("secure_api_unavailable");
    return global.apiJson(url,options);
  }
  function todayISO(){
    const now=new Date();
    const y=now.getFullYear(),m=String(now.getMonth()+1).padStart(2,"0"),d=String(now.getDate()).padStart(2,"0");
    return `${y}-${m}-${d}`;
  }
  function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||""))}
  function dueStatus(value){
    const date=String(value||"");
    if(!validDate(date))return "";
    const today=todayISO();
    if(date<today)return "Overdue review";
    if(date===today)return "Review today";
    return "";
  }

  function installStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement("style");
    style.id=STYLE_ID;
    const nonce=document.querySelector("style[nonce],script[nonce]")?.nonce;
    if(nonce)style.nonce=nonce;
    style.textContent=`
#${SECTION_ID}{margin:10px 0 14px;padding:12px;border:1px solid var(--line,#e3e6e8);border-radius:15px;background:var(--card,#fff)}
#${SECTION_ID} .decision-follow-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#${SECTION_ID} .decision-follow-head h4{margin:2px 0 0;font-size:14px;line-height:1.25}
#${SECTION_ID} .decision-follow-meta{font-size:10px;color:var(--muted,#6b7176);margin-top:3px}
#${SECTION_ID} .decision-follow-count{min-width:30px;text-align:center;border:1px solid var(--line,#e3e6e8);border-radius:999px;padding:4px 8px;font-size:10px;font-weight:850}
#${SECTION_ID} .decision-follow-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
#${SECTION_ID} .decision-follow-card{min-width:0;border:1px solid var(--line,#e3e6e8);border-radius:12px;padding:10px;background:var(--card,#fff)}
#${SECTION_ID} .decision-follow-card b{display:block;font-size:11px;line-height:1.3;overflow-wrap:anywhere}
#${SECTION_ID} .decision-follow-card p{margin:4px 0 0;font-size:10px;line-height:1.35;color:var(--muted,#6b7176);overflow-wrap:anywhere}
#${SECTION_ID} .decision-follow-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}
#${SECTION_ID} .decision-follow-tag{font-size:9px;font-weight:800;padding:2px 6px;border:1px solid var(--line,#e3e6e8);border-radius:999px}
#${SECTION_ID} .decision-follow-tag[data-tone="risk"]{border-color:color-mix(in srgb,#b42318 35%,var(--line,#e3e6e8));color:#8f1d16}
#${SECTION_ID} .decision-follow-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
#${SECTION_ID} .decision-follow-actions button{min-height:34px;padding:6px 8px;border-radius:9px;font-size:10px;font-weight:800}
#${SECTION_ID} .decision-follow-empty{font-size:10px;color:var(--muted,#6b7176);margin-top:8px}
#${SECTION_ID} :focus-visible,#${DIALOG_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #8f1d16}
#${DIALOG_ID}{width:min(560px,calc(100vw - 24px));max-height:min(700px,calc(100vh - 24px));border:1px solid var(--line,#e3e6e8);border-radius:18px;padding:0;background:var(--card,#fff);color:inherit;box-shadow:0 24px 72px rgba(0,0,0,.22)}
#${DIALOG_ID}::backdrop{background:rgba(0,0,0,.48)}
#${DIALOG_ID} .decision-review-form{display:grid;gap:13px;padding:18px}
#${DIALOG_ID} .decision-review-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#${DIALOG_ID} .decision-review-head h3{margin:0;font-size:18px;line-height:1.2}
#${DIALOG_ID} .decision-review-copy{font-size:10px;line-height:1.4;color:var(--muted,#6b7176);margin-top:4px}
#${DIALOG_ID} label{display:grid;gap:6px;font-size:11px;font-weight:800}
#${DIALOG_ID} textarea,#${DIALOG_ID} input{width:100%;box-sizing:border-box;border:1px solid var(--line,#d8dcdf);border-radius:11px;background:var(--card,#fff);color:inherit;padding:10px 11px;font:inherit}
#${DIALOG_ID} textarea{resize:vertical;min-height:84px}
#${DIALOG_ID} .decision-review-status{font-size:10px;line-height:1.4;color:var(--muted,#6b7176)}
#${DIALOG_ID} .decision-review-status[data-state="error"]{color:#b42318;font-weight:800}
#${DIALOG_ID} .decision-review-actions{display:flex;gap:7px;justify-content:flex-end;flex-wrap:wrap}
#${DIALOG_ID} .decision-review-actions button{min-height:40px;border-radius:10px;padding:8px 11px;font-weight:800}
@media(max-width:980px){#${SECTION_ID} .decision-follow-list{grid-template-columns:1fr 1fr}}
@media(max-width:680px){#${SECTION_ID} .decision-follow-list{grid-template-columns:1fr}#${DIALOG_ID}{margin:auto 12px;width:calc(100vw - 24px)}}
@media(max-width:430px){#${DIALOG_ID} .decision-review-actions{display:grid;grid-template-columns:1fr 1fr}#${DIALOG_ID} .decision-review-actions button{width:100%}}
`;
    document.head.append(style);
  }

  function ensureSection(){
    const centre=q("#ownerCommandCentre");
    if(!centre||!isOwner()||centre.hidden)return null;
    let section=q(`#${SECTION_ID}`,centre);
    if(section)return section;
    installStyles();
    section=node("section");
    section.id=SECTION_ID;
    section.dataset.release=RELEASE;
    section.setAttribute("aria-label","Decision follow-through");
    section.setAttribute("aria-live","polite");
    const attention=q("#ownerDecisionLanes",centre);
    if(attention)attention.insertAdjacentElement("afterend",section);
    else centre.prepend(section);
    return section;
  }

  function decisionRecords(payload){
    const today=todayISO();
    const rows=Array.isArray(payload?.items)?payload.items:[];
    return rows.filter(row=>{
      const value=row?.value||{};
      return row?.namespace==="operations"&&value?.kind==="owner_decision_note"&&value?.status!=="closed"&&validDate(value?.followUpAt)&&String(value.followUpAt)<=today;
    }).sort((a,b)=>String(a?.value?.followUpAt||"").localeCompare(String(b?.value?.followUpAt||""))||String(a?.value?.recordedAt||"").localeCompare(String(b?.value?.recordedAt||"")));
  }

  function setDockPrompt(prompt){
    const dock=q('#thebeAiDock[data-surface="workspace"]')||q("#thebeAiDock");
    const input=dock&&q('textarea,input[type="text"],input:not([type])',dock);
    if(input){
      input.value=prompt;
      input.dispatchEvent(new Event("input",{bubbles:true}));
      try{input.focus({preventScroll:true})}catch{input.focus()}
      return true;
    }
    global.ThebeOwnerFocusStrip?.focusThebe?.();
    return false;
  }

  function askThebe(record){
    const value=record?.value||{};
    const decision=clean(value.decision,600),why=clean(value.rationale,900),title=clean(value.title,220)||"Owner decision";
    const rationale=why?` The recorded reason was: ${why}.`:"";
    setDockPrompt(`Review my owner-confirmed decision “${title}”: ${decision}.${rationale} Compare it with the current verified business context. Identify evidence that supports it, evidence that conflicts with it, material unknowns, and whether keeping, revising, or closing the decision appears safest. If a measurable expected outcome was not recorded, say that clearly instead of inventing one. Treat this note as context only, not execution authority. Do not execute anything.`);
  }

  function recordAsItem(record){
    const value=record?.value||{};
    return {
      key:clean(value.sourceKey,300),
      sourceType:clean(value.sourceType,80),
      sourceId:clean(value.sourceId,160),
      title:clean(value.title,220)||"Owner decision"
    };
  }

  function card(record){
    const value=record?.value||{};
    const article=node("article",undefined,"decision-follow-card");
    article.append(node("b",clean(value.title,220)||"Owner decision"));
    const decision=clean(value.decision,600);
    if(decision)article.append(node("p",decision.slice(0,180)));
    const tags=node("div",undefined,"decision-follow-tags");
    const status=dueStatus(value.followUpAt);
    if(status){const tag=node("span",status,"decision-follow-tag");if(String(value.followUpAt)<todayISO())tag.dataset.tone="risk";tags.append(tag)}
    tags.append(node("span",String(value.followUpAt),"decision-follow-tag"));
    article.append(tags);
    const controls=node("div",undefined,"decision-follow-actions");
    controls.append(button("Ask Thebe",()=>askThebe(record),"btn alt"));
    controls.append(button("Review outcome",()=>openReview(record),"btn soft"));
    article.append(controls);
    return article;
  }

  function render(records){
    const section=ensureSection();
    if(!section)return;
    if(!records.length){section.remove();return}
    section.replaceChildren();
    const head=node("div",undefined,"decision-follow-head");
    const copy=node("div");
    copy.append(node("div","Decision follow-through","section-eyebrow"),node("h4","Check whether earlier decisions still hold"),node("div","Owner-confirmed notes due for review. Thebe can compare them with verified context but cannot change business state.","decision-follow-meta"));
    head.append(copy,node("span",String(records.length),"decision-follow-count"));
    section.append(head);
    const list=node("div",undefined,"decision-follow-list");
    records.slice(0,3).forEach(record=>list.append(card(record)));
    section.append(list);
    if(records.length>3)section.append(node("div",`${records.length-3} more owner decisions are due for review.`,"decision-follow-empty"));
  }

  async function persistReview(record,patch){
    const value={...(record?.value||{}),...patch,version:2,authority:"context_only_no_execution"};
    return apiJson("/api/business-memory",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({namespace:"operations",key:record.key,value})
    });
  }

  function setReviewBusy(dialog,busy){
    reviewBusy=busy;
    dialog?.querySelectorAll(".decision-review-actions button").forEach(control=>{control.disabled=busy});
  }

  function ensureDialog(){
    let dialog=document.getElementById(DIALOG_ID);
    if(dialog)return dialog;
    installStyles();
    dialog=document.createElement("dialog");
    dialog.id=DIALOG_ID;
    dialog.setAttribute("aria-labelledby","ownerDecisionReviewTitle");
    const form=node("form",undefined,"decision-review-form");
    form.noValidate=true;
    const head=node("div",undefined,"decision-review-head");
    const headCopy=node("div");
    const title=node("h3","Review decision outcome");
    title.id="ownerDecisionReviewTitle";
    const copy=node("div","Record what you observed, then keep, revise, or close the decision. This changes only the owner-confirmed note.","decision-review-copy");
    headCopy.append(title,copy);
    head.append(headCopy,button("×",closeDialog,"btn soft"));

    const outcomeLabel=node("label");
    outcomeLabel.append(node("span","What happened?"));
    const outcome=document.createElement("textarea");
    outcome.id="ownerDecisionObservedOutcome";
    outcome.maxLength=1200;
    outcome.placeholder="Observed result or evidence (optional)";
    outcomeLabel.append(outcome);

    const nextLabel=node("label");
    nextLabel.append(node("span","Next review date if keeping the decision"));
    const next=document.createElement("input");
    next.id="ownerDecisionNextReview";
    next.type="date";
    nextLabel.append(next);

    const status=node("div","No action will be executed.","decision-review-status");
    status.id="ownerDecisionReviewStatus";
    status.setAttribute("role","status");
    const controls=node("div",undefined,"decision-review-actions");
    controls.append(button("Cancel",closeDialog,"btn soft"));
    controls.append(button("Revise decision",reviseCurrent,"btn soft"));
    controls.append(button("Close decision",()=>void closeCurrentDecision(),"btn soft"));
    controls.append(button("Keep decision",()=>void keepCurrentDecision(),"btn alt"));
    form.append(head,outcomeLabel,nextLabel,status,controls);
    dialog.addEventListener("cancel",event=>{event.preventDefault();if(!reviewBusy)closeDialog()});
    dialog.append(form);
    document.body.append(dialog);
    return dialog;
  }

  function openReview(record){
    if(!isOwner())return;
    currentRecord=record;
    const dialog=ensureDialog();
    setReviewBusy(dialog,false);
    q("#ownerDecisionObservedOutcome",dialog).value="";
    q("#ownerDecisionNextReview",dialog).value="";
    q("#ownerDecisionReviewStatus",dialog).textContent=`Reviewing ${clean(record?.value?.title,220)||"owner decision"}. No action will be executed.`;
    q("#ownerDecisionReviewStatus",dialog).dataset.state="ready";
    try{dialog.showModal()}catch{dialog.setAttribute("open","")}
  }

  function closeDialog(){
    if(reviewBusy)return;
    currentRecord=null;
    const dialog=document.getElementById(DIALOG_ID);
    if(dialog?.open){try{dialog.close()}catch{dialog.removeAttribute("open")}}
  }

  function reviseCurrent(){
    if(reviewBusy)return;
    const record=currentRecord;
    if(!record)return;
    closeDialog();
    const item=recordAsItem(record);
    if(item.key&&typeof global.ThebeOwnerFirstHome?.openDecisionDialog==="function")global.ThebeOwnerFirstHome.openDecisionDialog(item);
  }

  async function keepCurrentDecision(){
    const record=currentRecord,dialog=document.getElementById(DIALOG_ID);
    if(!record||!dialog||!isOwner()||reviewBusy)return;
    const next=String(q("#ownerDecisionNextReview",dialog)?.value||""),outcome=clean(q("#ownerDecisionObservedOutcome",dialog)?.value,1200),status=q("#ownerDecisionReviewStatus",dialog);
    if(!validDate(next)||next<=todayISO()){
      status.textContent="Choose a future review date before keeping this decision.";
      status.dataset.state="error";
      q("#ownerDecisionNextReview",dialog)?.focus();
      return;
    }
    setReviewBusy(dialog,true);
    status.textContent="Saving follow-through note…";status.dataset.state="loading";
    try{
      await persistReview(record,{status:"active",followUpAt:next,lastReviewedAt:new Date().toISOString(),reviewState:"kept",lastOutcomeNote:outcome||null,closedAt:null});
      status.textContent="Decision kept and next review scheduled. No action was executed.";status.dataset.state="ready";
      global.setTimeout(()=>{reviewBusy=false;closeDialog();void refresh(true)},260);
    }catch{setReviewBusy(dialog,false);status.textContent="Follow-through note could not be saved. Nothing was executed.";status.dataset.state="error"}
  }

  async function closeCurrentDecision(){
    const record=currentRecord,dialog=document.getElementById(DIALOG_ID);
    if(!record||!dialog||!isOwner()||reviewBusy)return;
    const outcome=clean(q("#ownerDecisionObservedOutcome",dialog)?.value,1200),status=q("#ownerDecisionReviewStatus",dialog);
    setReviewBusy(dialog,true);
    status.textContent="Closing owner decision note…";status.dataset.state="loading";
    try{
      const now=new Date().toISOString();
      await persistReview(record,{status:"closed",followUpAt:null,lastReviewedAt:now,reviewState:"closed",lastOutcomeNote:outcome||null,closedAt:now});
      status.textContent="Decision note closed. No action was executed.";status.dataset.state="ready";
      global.setTimeout(()=>{reviewBusy=false;closeDialog();void refresh(true)},260);
    }catch{setReviewBusy(dialog,false);status.textContent="Decision note could not be closed. Nothing was executed.";status.dataset.state="error"}
  }

  async function refresh(force=false){
    if(!isOwner()){
      document.getElementById(SECTION_ID)?.remove();
      return;
    }
    if(refreshBusy)return;
    refreshBusy=true;
    try{
      const payload=await apiJson("/api/business-memory");
      render(decisionRecords(payload));
    }catch{
      const section=ensureSection();
      if(section)section.replaceChildren(node("div","Decision follow-through is temporarily unavailable. No decision state was changed.","decision-follow-empty"));
    }finally{refreshBusy=false}
  }

  function schedule(){
    global.clearTimeout(refreshTimer);
    refreshTimer=global.setTimeout(()=>void refresh(),90);
  }
  function boot(){
    schedule();
    [500,1500].forEach(delay=>global.setTimeout(schedule,delay));
    global.setInterval(()=>void refresh(),REFRESH_MS);
    global.addEventListener?.("thebe:auth:state",schedule);
    global.addEventListener?.("thebe:identity:ready",schedule);
    global.addEventListener?.("thebe:workspace:view",schedule);
    document.addEventListener("change",event=>{if(event.target?.id==="companySelect")global.setTimeout(()=>void refresh(true),550)});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();

  global.ThebeOwnerDecisionFollowThrough=Object.freeze({release:RELEASE,refresh:()=>refresh(true)});
})(window);
