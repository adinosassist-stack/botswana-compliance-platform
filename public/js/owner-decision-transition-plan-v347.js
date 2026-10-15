(function installOwnerDecisionTransitionPlanV347(global){
  "use strict";

  const RELEASE="20261015-owner-decision-transition-plan-v347";
  const SECTION_ID="ownerDecisionTransitionPlan";
  const STYLE_ID="ownerDecisionTransitionPlanStyle";
  const DIALOG_ID="ownerDecisionTransitionPlanDialog";
  const q=(selector,root=document)=>root.querySelector(selector);
  let scheduled=false;
  let readBusy=false;
  let dialogItem=null;

  function role(){
    try{return String(global.currentWorkspaceRole?.()||global.currentUser?.role||"").toLowerCase()}
    catch{return ""}
  }
  function isOwner(){return role()==="owner"}
  function clean(value,max=1400){return String(value??"").replace(/\s+/g," ").trim().slice(0,max)}
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
  function transitionSpec(item,rows=[]){
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

  function transitionPrompt(item,proposedTransition,rows=[]){
    const spec=transitionSpec(item,rows);
    const scenario=clean(proposedTransition,900);
    return `Draft an OWNER DECISION TRANSITION PLAN for “${spec.title}”. Proposed owner transition scenario: ${scenario}. This is a planning draft for human review only. The scenario is not approved, adopted, scheduled, communicated, funded, or executed. Current canonical summary: ${spec.currentSummary||"No additional canonical summary is available"}. Current canonical status: ${spec.currentStatus||"Not specified"}. Historical recommendation wording context: ${spec.historicalAdjustment}; historical outcomes are descriptive, not causal proof. ${baselineText(spec)} Use current verified business context as primary evidence. Re-apply V346 change-impact discipline before proposing any stage: separate verified commitments/dependencies from hypotheses and Unknowns, preserve reversibility, and do not cross an irreversible boundary unless verified evidence says one exists and the owner would need a separate explicit approval. Re-apply V345 reconsideration discipline: the existence of a proposed transition does not prove the decision should change. Re-apply V344 before/after compatibility and V340 conflict comparability where relevant. Preserve V339 Unknowns as Unknown. Never invent a contract, payment, filing, employee action, customer promise, supplier commitment, system integration, compliance duty, deadline, budget, approval, exposure, owner, assignee, duration, date, dependency, backup, rollback mechanism, or irreversible step. Produce exactly these sections: (1) Transition scenario — restate the proposed transition neutrally and state that it is not approved. (2) Planning status — choose exactly one: Draftable with verified gates; Blocked pending specified evidence; or Unknown. Use Draftable with verified gates only if a staged reversible draft can be written without inventing material prerequisites. Use Blocked pending specified evidence only when exact missing evidence prevents a responsible staged draft, and name it. Use Unknown when the baseline or impact is too uncertain to classify. (3) Current-state baseline — owner-confirmed/current verified facts only. (4) Preconditions before any stage — verified evidence, records, approvals, backups, reconciliations, safeguards, or dependencies that must already exist before the owner could consider Stage 1; otherwise say None verified and list Unknowns separately. (5) Staged transition draft — maximum five stages. For each stage provide: objective; verified prerequisites; manual action to be considered; explicit owner approval gate before action; evidence/checkpoint required after action; stop condition; rollback gate; irreversible-boundary check; and what must remain unchanged. Phrase every action as a proposal for later human approval, never as an instruction already authorized or scheduled. Do not create tasks or assign people. (6) Cross-stage invariants — safeguards, compliance duties, controls, records, data integrity, cash constraints, customer commitments, or other verified conditions that must remain intact through every stage. (7) Rollback architecture — the verified state/records/checkpoints needed to return to the prior stage, plus any Unknown rollback capability. Do not invent backups or restoration mechanisms. (8) Evidence checkpoints — specify what verified evidence the owner should inspect at each checkpoint before considering the next stage; do not collect it. (9) Hold points — exact conditions that require the owner to stop progression and review again. Include evidence conflict, safeguard breach, non-comparable outcome, unexpected irreversible boundary, missing approval, or material dependency change when applicable. (10) Completion definition — verified conditions that would allow the owner to say the transition is complete; do not equate completion with success unless verified outcome criteria exist. (11) Residual Unknowns — unresolved items that remain after the draft. (12) Owner approval sequence — list the separate human approval decisions that would be required, stage by stage. No bulk approval and no implied approval. Do not create numeric confidence, probability, risk, urgency, readiness, dependency, reversibility, or materiality scores. Do not persist the scenario or plan, reopen/revise/close the decision, alter the canonical queue, change evidence quality/conflict/readiness/result assessment, request or collect data, contact anyone, create tasks, assign work, schedule work, launch experiments, approve, reject, pay, file, send, mutate systems, or execute anything. End with: “Advisory transition plan only — no decision-change, approval, scheduling, monitoring, or execution authority.”`;
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
#${SECTION_ID} .transition-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#${SECTION_ID} .transition-head h4{margin:2px 0 0;font-size:14px;line-height:1.25}
#${SECTION_ID} .transition-meta{margin-top:3px;font-size:10px;line-height:1.4;color:var(--muted,#6b7176)}
#${SECTION_ID} .transition-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
#${SECTION_ID} .transition-card{min-width:0;border:1px solid var(--line,#e3e6e8);border-radius:12px;padding:10px;background:var(--card,#fff)}
#${SECTION_ID} .transition-card h5{margin:0;font-size:11px;line-height:1.35;overflow-wrap:anywhere}
#${SECTION_ID} .transition-card p{margin:5px 0 0;font-size:9px;line-height:1.4;color:var(--muted,#6b7176);overflow-wrap:anywhere}
#${SECTION_ID} .transition-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
#${SECTION_ID} .transition-actions button{min-height:34px;padding:6px 9px;border-radius:9px;font-size:9px;font-weight:850}
#${SECTION_ID} .transition-note,#${SECTION_ID} .transition-empty,#${SECTION_ID} .transition-unavailable{margin-top:8px;font-size:9px;line-height:1.45;color:var(--muted,#6b7176)}
#${DIALOG_ID}{width:min(640px,calc(100vw - 24px));border:1px solid var(--line,#e3e6e8);border-radius:18px;padding:0;background:var(--card,#fff);color:inherit;box-shadow:0 24px 72px rgba(0,0,0,.22)}
#${DIALOG_ID}::backdrop{background:rgba(0,0,0,.48)}
#${DIALOG_ID} .transition-form{display:grid;gap:12px;padding:18px}
#${DIALOG_ID} .transition-dialog-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#${DIALOG_ID} .transition-dialog-head h3{margin:0;font-size:17px;line-height:1.2}
#${DIALOG_ID} .transition-dialog-item{margin-top:4px;font-size:10px;color:var(--muted,#6b7176)}
#${DIALOG_ID} label{display:grid;gap:5px;font-size:10px;font-weight:800}
#${DIALOG_ID} textarea{width:100%;min-height:120px;resize:vertical;box-sizing:border-box;border:1px solid var(--line,#d8dcdf);border-radius:10px;background:var(--card,#fff);color:inherit;padding:9px 10px;font:inherit}
#${DIALOG_ID} .transition-help,#${DIALOG_ID} .transition-status{font-size:9px;line-height:1.45;color:var(--muted,#6b7176)}
#${DIALOG_ID} .transition-status[data-state="error"]{color:#b42318;font-weight:800}
#${DIALOG_ID} .transition-dialog-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
#${DIALOG_ID} .transition-dialog-actions button{min-height:40px;border-radius:10px;padding:8px 12px;font-weight:800}
#${SECTION_ID} :focus-visible,#${DIALOG_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #8f1d16}
@media(max-width:980px){#${SECTION_ID} .transition-list{grid-template-columns:1fr 1fr}}
@media(max-width:680px){#${SECTION_ID} .transition-list{grid-template-columns:1fr}}
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
    dialog.setAttribute("aria-labelledby","ownerDecisionTransitionPlanTitle");
    const form=node("form",undefined,"transition-form");
    form.noValidate=true;
    const head=node("div",undefined,"transition-dialog-head");
    const copy=node("div");
    const title=node("h3","Draft reversible transition plan");title.id="ownerDecisionTransitionPlanTitle";
    const item=node("div","","transition-dialog-item");item.id="ownerDecisionTransitionPlanItem";
    copy.append(title,item);
    head.append(copy,button("×",closeDialog,"btn soft"));
    const label=node("label");label.append(node("span","Proposed transition to plan"));
    const textarea=document.createElement("textarea");
    textarea.id="ownerDecisionTransitionPlanScenario";
    textarea.maxLength=900;
    textarea.placeholder="Describe the decision change and the end state you want Thebe to plan for. This is not an approval or instruction to execute.";
    label.append(textarea);
    const help=node("div","Thebe will draft stages, approval gates, checkpoints, hold points and rollback gates only. The text is not saved.","transition-help");
    const status=node("div","","transition-status");status.id="ownerDecisionTransitionPlanStatus";
    const actions=node("div",undefined,"transition-dialog-actions");
    const cancel=button("Cancel",closeDialog,"btn soft");
    let run;
    run=button("Draft transition plan",()=>{void runTransition(dialog)},"btn alt");
    run.id="ownerDecisionTransitionPlanRun";
    actions.append(cancel,run);
    form.append(head,label,help,status,actions);
    dialog.append(form);
    dialog.addEventListener("cancel",event=>{event.preventDefault();closeDialog()});
    dialog.addEventListener("close",()=>{dialogItem=null});
    document.body.append(dialog);
    return dialog;
  }
  function openDialog(item){
    if(!isOwner()||!item)return false;
    const snapshot=canonicalSnapshot();
    if(clean(snapshot?.state,40).toLowerCase()!=="ready")return false;
    dialogItem=item;
    const dialog=ensureDialog();
    q("#ownerDecisionTransitionPlanItem",dialog).textContent=clean(item?.title||item?.label||item?.name||"Owner decision",220);
    q("#ownerDecisionTransitionPlanScenario",dialog).value="";
    q("#ownerDecisionTransitionPlanStatus",dialog).textContent="";
    q("#ownerDecisionTransitionPlanStatus",dialog).dataset.state="";
    try{dialog.showModal()}catch{dialog.setAttribute("open","")}
    global.setTimeout(()=>q("#ownerDecisionTransitionPlanScenario",dialog)?.focus(),0);
    return true;
  }
  async function runTransition(dialog){
    const item=dialogItem;
    if(!isOwner()||!item||readBusy)return false;
    const scenario=clean(q("#ownerDecisionTransitionPlanScenario",dialog)?.value,900);
    const status=q("#ownerDecisionTransitionPlanStatus",dialog);
    if(!scenario){
      if(status){status.textContent="Describe the proposed transition before drafting the plan.";status.dataset.state="error"}
      return false;
    }
    const snapshot=canonicalSnapshot();
    if(clean(snapshot?.state,40).toLowerCase()!=="ready")return false;
    readBusy=true;
    const run=q("#ownerDecisionTransitionPlanRun",dialog);if(run)run.disabled=true;
    try{
      let rows=[];
      try{
        const payload=await apiJson("/api/business-memory");
        rows=Array.isArray(payload?.items)?payload.items:[];
      }catch{}
      const ok=setDockPrompt(transitionPrompt(item,scenario,rows));
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
    section.setAttribute("aria-label","Owner decision transition plan");
    section.setAttribute("aria-live","polite");
    const impact=q("#ownerDecisionChangeImpactCheck",centre);
    const trigger=q("#ownerDecisionReconsiderationTrigger",centre);
    if(impact)impact.insertAdjacentElement("afterend",section);
    else if(trigger)trigger.insertAdjacentElement("afterend",section);
    else centre.append(section);
    return section;
  }
  function card(item){
    const spec=transitionSpec(item,[]);
    const el=node("article",undefined,"transition-card");
    el.append(node("h5",spec.title));
    if(spec.currentSummary)el.append(node("p",spec.currentSummary.slice(0,190)));
    const actions=node("div",undefined,"transition-actions");
    actions.append(button("Draft transition plan",()=>openDialog(item),"btn alt"));
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
    const head=node("div",undefined,"transition-head");
    const copy=node("div");
    copy.append(node("div","Transition plan","section-eyebrow"),node("h4","How could this decision change be staged without skipping human gates?"));
    copy.append(node("div","Manual planning only · staged approvals, checkpoints and rollback gates · no persistence or execution","transition-meta"));
    head.append(copy);
    section.append(head);
    if(state!=="ready"){
      section.append(node("div","Canonical decision data is not verified, so V347 will not draft a transition plan.","transition-unavailable"));
      return;
    }
    const items=decisionItems(snapshot);
    if(!items.length){
      section.append(node("div","No verified owner decisions are available for transition planning.","transition-empty"));
      return;
    }
    const list=node("div",undefined,"transition-list");
    items.slice(0,6).forEach(item=>list.append(card(item)));
    section.append(list);
    section.append(node("div","V347 requires an explicit transition scenario each time. It drafts review gates only, reads owner-confirmed decision/result context for that manual check, and does not save, schedule, approve or execute the plan.","transition-note"));
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

  global.ThebeOwnerDecisionTransitionPlan=Object.freeze({
    release:RELEASE,
    transitionSpec,
    transitionPrompt,
    openDialog
  });
})(window);
