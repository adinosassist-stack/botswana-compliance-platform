(function installOwnerDecisionChangeImpactCheckV346(global){
  "use strict";

  const RELEASE="20261015-owner-decision-change-impact-check-v346";
  const SECTION_ID="ownerDecisionChangeImpactCheck";
  const STYLE_ID="ownerDecisionChangeImpactCheckStyle";
  const DIALOG_ID="ownerDecisionChangeImpactDialog";
  const q=(selector,root=document)=>root.querySelector(selector);
  let scheduled=false;
  let readBusy=false;
  let dialogItem=null;

  function role(){
    try{return String(global.currentWorkspaceRole?.()||global.currentUser?.role||"").toLowerCase()}
    catch{return ""}
  }
  function isOwner(){return role()==="owner"}
  function clean(value,max=1200){return String(value??"").replace(/\s+/g," ").trim().slice(0,max)}
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
  function canonicalSnapshot(){
    try{return global.ThebeOwnerFocusStrip?.canonicalSnapshot?.()||null}
    catch{return null}
  }
  function classify(item){
    try{return global.ThebeOwnerFirstHome?.classify?.(item)||""}
    catch{return ""}
  }
  function reviewSpec(item){
    try{return global.ThebeOwnerDecisionReviewBrief?.reviewSpec?.(item)||null}
    catch{return null}
  }
  function decisionItems(snapshot){
    const items=Array.isArray(snapshot?.items)?snapshot.items:[];
    return items.filter(item=>classify(item)==="decision");
  }
  function sourceKey(item){
    const direct=clean(item?.key,300);
    if(direct)return direct;
    const type=clean(item?.sourceType||item?.kind||"owner_attention",80);
    const id=clean(item?.sourceId||item?.id||item?.title||"item",200);
    return `${type}:${id}`.slice(0,300);
  }
  function recordStamp(row){
    const value=row?.value||{};
    const candidates=[value.recordedAt,value.reviewedAt,value.closedAt,value.updatedAt,row?.updated_at,row?.updatedAt,row?.created_at,row?.createdAt];
    for(const candidate of candidates){
      const stamp=Date.parse(String(candidate||""));
      if(Number.isFinite(stamp))return stamp;
    }
    return 0;
  }
  function latestMatching(rows,item,kind){
    const key=sourceKey(item);
    return rows
      .filter(row=>row?.namespace==="operations"&&row?.value?.kind===kind&&clean(row?.value?.sourceKey,300)===key)
      .sort((a,b)=>recordStamp(b)-recordStamp(a))[0]||null;
  }
  function decisionBaseline(row){
    if(!row)return Object.freeze({available:false});
    const value=row?.value||{};
    return Object.freeze({
      available:true,
      decision:clean(value.decision,600),
      rationale:clean(value.rationale,1200),
      followUpAt:clean(value.followUpAt,40),
      lastReviewedAt:clean(value.lastReviewedAt,80),
      reviewState:clean(value.reviewState||value.status,80),
      observedOutcome:clean(value.observedOutcome,900),
      recordedAt:clean(value.recordedAt||row?.updated_at||row?.created_at,80),
      authority:clean(value.authority,100)||"context_only_no_execution"
    });
  }
  function resultBaseline(row){
    if(!row)return Object.freeze({available:false});
    const value=row?.value||{};
    return Object.freeze({
      available:true,
      experimentQuestion:clean(value.experimentQuestion,280),
      observedEvidence:clean(value.observedEvidence,900),
      evidenceSource:clean(value.evidenceSource,240),
      observationPeriod:clean(value.observationPeriod,180),
      ownerInterpretation:clean(value.ownerInterpretation,500),
      resultAssessment:clean(value.resultAssessment,100)||"inconclusive",
      criteriaPredatedTest:value.criteriaPredatedTest===true,
      continueCriterion:clean(value.continueCriterion,400),
      stopCriterion:clean(value.stopCriterion,400),
      recordedAt:clean(value.recordedAt||value.reviewedAt||row?.updated_at||row?.created_at,80),
      authority:clean(value.authority,100)||"context_only_no_execution"
    });
  }
  function impactSpec(item,rows=[]){
    const current=reviewSpec(item)||{};
    return Object.freeze({
      title:clean(current.title||item?.title||item?.label||item?.name||"Owner decision",220),
      sourceType:clean(current.sourceType||item?.sourceType||item?.kind||"owner_attention",80)||"owner_attention",
      currentSummary:clean(current.currentSummary||item?.summary||item?.detail||item?.description||item?.reason||"",700),
      currentStatus:clean(current.currentStatus||item?.status||item?.truthState||item?.severity||item?.priority||"",100),
      historicalAdjustment:clean(current.historicalAdjustment,80)||"uncalibrated",
      decisionBaseline:decisionBaseline(latestMatching(rows,item,"owner_decision_note")),
      resultBaseline:resultBaseline(latestMatching(rows,item,"owner_experiment_result")),
      authoritative:false,
      authority:"context_only_no_execution"
    });
  }

  function baselineText(spec){
    const decision=spec.decisionBaseline.available
      ?`Owner-confirmed decision baseline: decision=${spec.decisionBaseline.decision||"not recorded"}; rationale=${spec.decisionBaseline.rationale||"not recorded"}; follow-up=${spec.decisionBaseline.followUpAt||"not recorded"}; last reviewed=${spec.decisionBaseline.lastReviewedAt||"not recorded"}; review state=${spec.decisionBaseline.reviewState||"not recorded"}; observed outcome=${spec.decisionBaseline.observedOutcome||"not recorded"}; recorded=${spec.decisionBaseline.recordedAt||"timestamp unavailable"}.`
      :"No owner-confirmed decision baseline is available for this canonical decision. Treat the baseline as Unknown rather than inventing prior commitments.";
    const result=spec.resultBaseline.available
      ?`Latest owner-confirmed experiment/result evidence: question=${spec.resultBaseline.experimentQuestion||"not recorded"}; observed evidence=${spec.resultBaseline.observedEvidence||"not recorded"}; source=${spec.resultBaseline.evidenceSource||"not recorded"}; observation period=${spec.resultBaseline.observationPeriod||"not recorded"}; criteria predated review=${spec.resultBaseline.criteriaPredatedTest?"yes":"no"}; continue criterion=${spec.resultBaseline.continueCriterion||"not recorded"}; stop/revise criterion=${spec.resultBaseline.stopCriterion||"not recorded"}; owner interpretation=${spec.resultBaseline.ownerInterpretation||"not recorded"}; assessment=${spec.resultBaseline.resultAssessment}; recorded=${spec.resultBaseline.recordedAt||"timestamp unavailable"}.`
      :"No owner-confirmed experiment/result record is available for this canonical decision. Do not infer that no evidence exists elsewhere.";
    return `${decision} ${result}`;
  }

  function impactPrompt(item,proposedChange,rows=[]){
    const spec=impactSpec(item,rows);
    const scenario=clean(proposedChange,800);
    return `Create an OWNER DECISION CHANGE IMPACT CHECK for “${spec.title}”. Proposed owner scenario: ${scenario}. This is a manual scenario analysis only. Do not assume the scenario has been approved, adopted, scheduled, communicated, funded, or executed. Current canonical summary: ${spec.currentSummary||"No additional canonical summary is available"}. Current canonical status: ${spec.currentStatus||"Not specified"}. Historical recommendation wording context: ${spec.historicalAdjustment}; historical outcomes are descriptive, not causal proof. ${baselineText(spec)} Use current verified business context as primary evidence. Re-apply V345 reconsideration discipline: the existence of a proposed change does not prove reconsideration is warranted. Re-apply V344 before/after compatibility and V340 conflict comparability where relevant. Preserve V339 Unknowns as Unknown. Separate verified dependencies from plausible-but-unverified dependencies. Never invent a contract, payment, filing, employee action, customer promise, supplier commitment, system integration, compliance duty, deadline, budget, approval, exposure, or irreversible step. Produce exactly these sections: (1) Scenario being assessed — restate the proposed change neutrally and note that it is not approved. (2) Current decision baseline — only owner-confirmed or current verified facts. (3) Verified affected commitments — existing commitments, approvals, promises, deadlines, payments, filings, contracts, or operational obligations that verified evidence shows could be affected; otherwise say None verified. (4) Verified dependency map — systems, people, teams, customers, suppliers, finance, compliance, property, data, reporting, or other workflows with a verified dependency on the current decision; separate Unknown dependencies. (5) Reversibility check — identify what appears reversible, conditionally reversible, irreversible, or Unknown, with the verified reason. Age, effort, or inconvenience alone do not prove irreversibility. (6) Transition hazards — only verified failure modes created by switching from the current decision to the proposed scenario; label unsupported possibilities as hypotheses. (7) Evidence and safeguard carryover — state which evidence, safeguards, stop conditions, or experiment findings remain applicable, which become non-comparable, and which are Unknown. (8) Conflict and contradiction check — identify any verified conflict the proposed scenario creates or resolves; differences in scope, time, unit, population, or definition are not contradictions by themselves. (9) Smallest reversible transition path — the smallest manual sequence the owner could review before making any change. Do not perform the steps. If no safe reversible path is verified, say owner-defined transition plan required. (10) Rollback requirements — verified conditions, records, backups, approvals, or checkpoints that would be needed to reverse the change; do not invent missing controls. (11) Decision-change blockers — exact Unknowns or missing evidence that prevent a responsible owner decision. (12) Owner review questions — up to three questions that must be answered before revising or reversing the decision. Do not create numeric confidence, probability, risk, urgency, dependency, reversibility, or materiality scores. Do not persist the scenario, reopen/revise/close the decision, alter the canonical queue, change evidence quality/conflict/readiness/result assessment, request or collect data, contact anyone, create tasks, schedule work, launch experiments, approve, reject, pay, file, send, or execute anything. End with: “Advisory impact check only — no decision-change, approval, monitoring, or execution authority.”`;
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

  function installStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement("style");
    style.id=STYLE_ID;
    const nonce=document.querySelector("style[nonce],script[nonce]")?.nonce;
    if(nonce)style.nonce=nonce;
    style.textContent=`
#${SECTION_ID}{margin:10px 0 16px;padding:12px;border:1px solid var(--line,#e3e6e8);border-radius:15px;background:var(--card,#fff);min-width:0}
#${SECTION_ID} .impact-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#${SECTION_ID} .impact-head h4{margin:2px 0 0;font-size:14px;line-height:1.25}
#${SECTION_ID} .impact-meta{margin-top:3px;font-size:10px;line-height:1.4;color:var(--muted,#6b7176)}
#${SECTION_ID} .impact-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
#${SECTION_ID} .impact-card{min-width:0;border:1px solid var(--line,#e3e6e8);border-radius:12px;padding:10px;background:var(--card,#fff)}
#${SECTION_ID} .impact-card h5{margin:0;font-size:11px;line-height:1.35;overflow-wrap:anywhere}
#${SECTION_ID} .impact-card p{margin:5px 0 0;font-size:9px;line-height:1.4;color:var(--muted,#6b7176);overflow-wrap:anywhere}
#${SECTION_ID} .impact-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
#${SECTION_ID} .impact-actions button{min-height:34px;padding:6px 9px;border-radius:9px;font-size:9px;font-weight:850}
#${SECTION_ID} .impact-note,#${SECTION_ID} .impact-empty,#${SECTION_ID} .impact-unavailable{margin-top:8px;font-size:9px;line-height:1.45;color:var(--muted,#6b7176)}
#${DIALOG_ID}{width:min(620px,calc(100vw - 24px));border:1px solid var(--line,#e3e6e8);border-radius:18px;padding:0;background:var(--card,#fff);color:inherit;box-shadow:0 24px 72px rgba(0,0,0,.22)}
#${DIALOG_ID}::backdrop{background:rgba(0,0,0,.48)}
#${DIALOG_ID} .impact-form{display:grid;gap:12px;padding:18px}
#${DIALOG_ID} .impact-dialog-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#${DIALOG_ID} .impact-dialog-head h3{margin:0;font-size:17px;line-height:1.2}
#${DIALOG_ID} .impact-dialog-item{margin-top:4px;font-size:10px;color:var(--muted,#6b7176)}
#${DIALOG_ID} label{display:grid;gap:5px;font-size:10px;font-weight:800}
#${DIALOG_ID} textarea{width:100%;min-height:110px;resize:vertical;box-sizing:border-box;border:1px solid var(--line,#d8dcdf);border-radius:10px;background:var(--card,#fff);color:inherit;padding:9px 10px;font:inherit}
#${DIALOG_ID} .impact-help,#${DIALOG_ID} .impact-status{font-size:9px;line-height:1.45;color:var(--muted,#6b7176)}
#${DIALOG_ID} .impact-status[data-state="error"]{color:#b42318;font-weight:800}
#${DIALOG_ID} .impact-dialog-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
#${DIALOG_ID} .impact-dialog-actions button{min-height:40px;border-radius:10px;padding:8px 12px;font-weight:800}
#${SECTION_ID} :focus-visible,#${DIALOG_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #8f1d16}
@media(max-width:980px){#${SECTION_ID} .impact-list{grid-template-columns:1fr 1fr}}
@media(max-width:680px){#${SECTION_ID} .impact-list{grid-template-columns:1fr}}
`;
    document.head.append(style);
  }

  function closeDialog(){
    dialogItem=null;
    const dialog=document.getElementById(DIALOG_ID);
    if(dialog?.open){try{dialog.close()}catch{dialog.removeAttribute("open")}}
  }
  function ensureDialog(){
    let dialog=document.getElementById(DIALOG_ID);
    if(dialog)return dialog;
    installStyles();
    dialog=document.createElement("dialog");
    dialog.id=DIALOG_ID;
    dialog.setAttribute("aria-labelledby","ownerDecisionChangeImpactTitle");
    const form=node("form",undefined,"impact-form");
    form.noValidate=true;
    const head=node("div",undefined,"impact-dialog-head");
    const copy=node("div");
    const title=node("h3","Map decision-change impact");title.id="ownerDecisionChangeImpactTitle";
    const item=node("div","","impact-dialog-item");item.id="ownerDecisionChangeImpactItem";
    copy.append(title,item);
    head.append(copy,button("×",closeDialog,"btn soft"));
    const label=node("label");label.append(node("span","Proposed change or reversal to assess"));
    const field=document.createElement("textarea");field.id="ownerDecisionChangeImpactScenario";field.maxLength=800;field.required=true;field.placeholder="Describe the change you are considering. This is not saved or executed.";label.append(field);
    const help=node("div","V346 uses this scenario only for the current manual analysis. It does not save the scenario, change the decision, contact anyone, or execute a transition.","impact-help");
    const status=node("div","","impact-status");status.id="ownerDecisionChangeImpactStatus";status.setAttribute("role","status");
    const actions=node("div",undefined,"impact-dialog-actions");
    actions.append(button("Cancel",closeDialog,"btn soft"));
    const run=button("Map impact",()=>{},"btn alt");run.type="submit";run.id="ownerDecisionChangeImpactRun";actions.append(run);
    form.append(head,label,help,status,actions);
    form.addEventListener("submit",event=>{event.preventDefault();void runImpact(dialog)});
    dialog.addEventListener("cancel",event=>{event.preventDefault();closeDialog()});
    dialog.append(form);
    document.body.append(dialog);
    return dialog;
  }
  function openDialog(item){
    if(!isOwner()||!item)return false;
    const snapshot=canonicalSnapshot();
    if(clean(snapshot?.state,40).toLowerCase()!=="ready")return false;
    dialogItem=item;
    const dialog=ensureDialog();
    q("#ownerDecisionChangeImpactItem",dialog).textContent=clean(item?.title||item?.label||item?.name||"Owner decision",220);
    q("#ownerDecisionChangeImpactScenario",dialog).value="";
    q("#ownerDecisionChangeImpactStatus",dialog).textContent="";
    q("#ownerDecisionChangeImpactStatus",dialog).dataset.state="";
    try{dialog.showModal()}catch{dialog.setAttribute("open","")}
    global.setTimeout(()=>q("#ownerDecisionChangeImpactScenario",dialog)?.focus(),0);
    return true;
  }
  async function runImpact(dialog){
    const item=dialogItem;
    if(!isOwner()||!item||readBusy)return false;
    const scenario=clean(q("#ownerDecisionChangeImpactScenario",dialog)?.value,800);
    const status=q("#ownerDecisionChangeImpactStatus",dialog);
    if(!scenario){
      if(status){status.textContent="Describe the proposed change before mapping impact.";status.dataset.state="error"}
      return false;
    }
    const snapshot=canonicalSnapshot();
    if(clean(snapshot?.state,40).toLowerCase()!=="ready")return false;
    readBusy=true;
    const run=q("#ownerDecisionChangeImpactRun",dialog);if(run)run.disabled=true;
    try{
      let rows=[];
      try{
        const payload=await apiJson("/api/business-memory");
        rows=Array.isArray(payload?.items)?payload.items:[];
      }catch{}
      const ok=setDockPrompt(impactPrompt(item,scenario,rows));
      closeDialog();
      return ok;
    }finally{
      readBusy=false;
      if(run)run.disabled=false;
    }
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
    section.setAttribute("aria-label","Owner decision change impact check");
    section.setAttribute("aria-live","polite");
    const trigger=q("#ownerDecisionReconsiderationTrigger",centre);
    const delta=q("#ownerDecisionReviewDelta",centre);
    if(trigger)trigger.insertAdjacentElement("afterend",section);
    else if(delta)delta.insertAdjacentElement("afterend",section);
    else centre.append(section);
    return section;
  }
  function card(item){
    const spec=impactSpec(item,[]);
    const el=node("article",undefined,"impact-card");
    el.append(node("h5",spec.title));
    if(spec.currentSummary)el.append(node("p",spec.currentSummary.slice(0,190)));
    const actions=node("div",undefined,"impact-actions");
    actions.append(button("Map change impact",()=>openDialog(item),"btn alt"));
    el.append(actions);
    return el;
  }
  function render(){
    scheduled=false;
    const section=ensureSection();
    if(!section)return;
    const snapshot=canonicalSnapshot();
    const state=clean(snapshot?.state,40).toLowerCase();
    section.replaceChildren();
    const head=node("div",undefined,"impact-head");
    const copy=node("div");
    copy.append(node("div","Change impact","section-eyebrow"),node("h4","What would this decision change affect before you act?"));
    copy.append(node("div","Scenario-based manual analysis · no persistence, approval, monitoring, or execution","impact-meta"));
    head.append(copy);
    section.append(head);
    if(state!=="ready"){
      section.append(node("div","Canonical decision data is not verified, so V346 will not map downstream impact.","impact-unavailable"));
      return;
    }
    const items=decisionItems(snapshot);
    if(!items.length){
      section.append(node("div","No verified owner decisions are available for change-impact review.","impact-empty"));
      return;
    }
    const list=node("div",undefined,"impact-list");
    items.slice(0,6).forEach(item=>list.append(card(item)));
    section.append(list);
    section.append(node("div","V346 requires you to describe the proposed change first. It reads owner-confirmed decision/result context only for that manual check and does not save the scenario or change business state.","impact-note"));
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    global.requestAnimationFrame?global.requestAnimationFrame(render):global.setTimeout(render,0);
  }
  function boot(){
    schedule();
    const centre=q("#ownerCommandCentre");
    if(centre){
      const observer=new MutationObserver(schedule);
      observer.observe(centre,{subtree:true,childList:true,attributes:true,attributeFilter:["class","hidden"]});
    }
    global.addEventListener?.("thebe:auth:state",schedule);
    global.addEventListener?.("thebe:identity:ready",schedule);
    global.addEventListener?.("thebe:workspace:view",schedule);
    document.addEventListener("change",event=>{if(event.target?.id==="companySelect")global.setTimeout(schedule,550)});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();

  global.ThebeOwnerDecisionChangeImpactCheck=Object.freeze({
    release:RELEASE,
    impactSpec,
    impactPrompt,
    openDialog
  });
})(window);
