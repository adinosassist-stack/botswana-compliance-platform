(function installOwnerDecisionReconsiderationTriggerV345(global){
  "use strict";

  const RELEASE="20261015-owner-decision-reconsideration-trigger-v345";
  const SECTION_ID="ownerDecisionReconsiderationTrigger";
  const STYLE_ID="ownerDecisionReconsiderationTriggerStyle";
  const q=(selector,root=document)=>root.querySelector(selector);
  let scheduled=false;
  let readBusy=false;

  function role(){
    try{return String(global.currentWorkspaceRole?.()||global.currentUser?.role||"").toLowerCase()}
    catch{return ""}
  }
  function isOwner(){return role()==="owner"}
  function clean(value,max=1000){return String(value??"").replace(/\s+/g," ").trim().slice(0,max)}
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
  function triggerSpec(item,rows=[]){
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
      ?`Latest owner-confirmed decision baseline: decision=${spec.decisionBaseline.decision||"not recorded"}; rationale=${spec.decisionBaseline.rationale||"not recorded"}; follow-up=${spec.decisionBaseline.followUpAt||"not recorded"}; last reviewed=${spec.decisionBaseline.lastReviewedAt||"not recorded"}; review state=${spec.decisionBaseline.reviewState||"not recorded"}; observed outcome=${spec.decisionBaseline.observedOutcome||"not recorded"}; recorded=${spec.decisionBaseline.recordedAt||"timestamp unavailable"}.`
      :"No owner-confirmed decision baseline is available for this canonical decision. Absence of a note does not prove no earlier decision exists.";
    const result=spec.resultBaseline.available
      ?`Latest owner-confirmed experiment/result evidence: question=${spec.resultBaseline.experimentQuestion||"not recorded"}; observed evidence=${spec.resultBaseline.observedEvidence||"not recorded"}; source=${spec.resultBaseline.evidenceSource||"not recorded"}; observation period=${spec.resultBaseline.observationPeriod||"not recorded"}; criteria predated review=${spec.resultBaseline.criteriaPredatedTest?"yes":"no"}; continue criterion=${spec.resultBaseline.continueCriterion||"not recorded"}; stop/revise criterion=${spec.resultBaseline.stopCriterion||"not recorded"}; owner interpretation=${spec.resultBaseline.ownerInterpretation||"not recorded"}; assessment=${spec.resultBaseline.resultAssessment}; recorded=${spec.resultBaseline.recordedAt||"timestamp unavailable"}.`
      :"No owner-confirmed experiment/result record is available for this canonical decision. Do not infer that no evidence exists elsewhere.";
    return `${decision} ${result}`;
  }

  function triggerPrompt(item,rows=[]){
    const spec=triggerSpec(item,rows);
    return `Assess the OWNER DECISION RECONSIDERATION TRIGGER for “${spec.title}”. This is a manual owner-requested review only, not monitoring and not a state change. Current canonical summary: ${spec.currentSummary||"No additional canonical summary is available"}. Current canonical status: ${spec.currentStatus||"Not specified"}. Historical recommendation wording context: ${spec.historicalAdjustment}; historical outcomes are descriptive, not causal proof. ${baselineText(spec)} First re-apply the V344 review-delta discipline: compare only compatible before-and-after evidence with the same relevant metric/definition, entity or population scope, unit, aggregation level, and observation period. Re-apply V340 conflict comparability before relying on any disagreement. Preserve V339 Unknowns as Unknown. Do not treat a newer timestamp, changed wording, longer note, opposite owner assessment, or different period/scope as a material change by itself. Then return exactly one reconsideration state: (A) Owner review warranted now, (B) Owner review warranted when specified evidence arrives, (C) No reconsideration trigger verified, or (D) Unknown. Use A only when current verified evidence establishes a material change that could reasonably alter the recommendation wording, invalidate a material baseline premise, create or resolve a verified material conflict, materially change a safeguard, or materially change the meaning of a pre-defined experiment result. Use B only when a specific missing evidence item is the clear blocker to deciding whether such a material change occurred; name that exact evidence and why it matters. Use C only when a comparable baseline exists and no material change is verified. Use D when the baseline, current evidence, provenance, scope, period, metric, unit, or comparability is insufficient. Produce these sections: (1) Reconsideration state. (2) Baseline premise being tested — quote or summarize only the owner-confirmed premise actually available. (3) Verified change candidate — facts only, or No material change verified. (4) Comparability check — metric/definition, entity/population, unit, aggregation, observation period, provenance. (5) Why the change is or is not material to owner review — no numeric materiality score. (6) Conflict/safeguard/experiment implications — only verified changes; keep observations separate from owner interpretation. (7) Blocking unknowns — exact missing evidence, if any. (8) Smallest manual next review step — review only; do not create tasks, requests, schedules, experiments, or external actions. If the state is B, state the exact evidence that should be available before another owner review, but do not collect or request it. Do not reopen, revise, close, approve, reject, persist, schedule, monitor, browse external systems, collect data, request files, contact people, create tasks, launch experiments, alter evidence quality/conflict/readiness/result assessment, change the canonical queue, pay, file, send, or execute anything. Do not create numeric confidence, probability, risk, urgency, or materiality scores. End with: “Advisory reconsideration trigger only — no decision, monitoring, approval, or execution authority.”`;
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

  async function checkTrigger(item,buttonEl){
    if(!isOwner()||!item||readBusy)return false;
    const snapshot=canonicalSnapshot();
    if(clean(snapshot?.state,40).toLowerCase()!=="ready")return false;
    readBusy=true;
    if(buttonEl)buttonEl.disabled=true;
    try{
      const payload=await apiJson("/api/business-memory");
      const rows=Array.isArray(payload?.items)?payload.items:[];
      return setDockPrompt(triggerPrompt(item,rows));
    }catch{
      return setDockPrompt(triggerPrompt(item,[]));
    }finally{
      readBusy=false;
      if(buttonEl)buttonEl.disabled=false;
    }
  }

  function installStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement("style");
    style.id=STYLE_ID;
    const nonce=document.querySelector("style[nonce],script[nonce]")?.nonce;
    if(nonce)style.nonce=nonce;
    style.textContent=`
#${SECTION_ID}{margin:10px 0 16px;padding:12px;border:1px solid var(--line,#e3e6e8);border-radius:15px;background:var(--card,#fff);min-width:0}
#${SECTION_ID} .trigger-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#${SECTION_ID} .trigger-head h4{margin:2px 0 0;font-size:14px;line-height:1.25}
#${SECTION_ID} .trigger-meta{margin-top:3px;font-size:10px;line-height:1.4;color:var(--muted,#6b7176)}
#${SECTION_ID} .trigger-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
#${SECTION_ID} .trigger-card{min-width:0;border:1px solid var(--line,#e3e6e8);border-radius:12px;padding:10px;background:var(--card,#fff)}
#${SECTION_ID} .trigger-card h5{margin:0;font-size:11px;line-height:1.35;overflow-wrap:anywhere}
#${SECTION_ID} .trigger-card p{margin:5px 0 0;font-size:9px;line-height:1.4;color:var(--muted,#6b7176);overflow-wrap:anywhere}
#${SECTION_ID} .trigger-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
#${SECTION_ID} .trigger-actions button{min-height:34px;padding:6px 9px;border-radius:9px;font-size:9px;font-weight:850}
#${SECTION_ID} .trigger-note,#${SECTION_ID} .trigger-empty,#${SECTION_ID} .trigger-unavailable{margin-top:8px;font-size:9px;line-height:1.45;color:var(--muted,#6b7176)}
#${SECTION_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #8f1d16}
@media(max-width:980px){#${SECTION_ID} .trigger-list{grid-template-columns:1fr 1fr}}
@media(max-width:680px){#${SECTION_ID} .trigger-list{grid-template-columns:1fr}}
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
    section.setAttribute("aria-label","Owner decision reconsideration trigger");
    section.setAttribute("aria-live","polite");
    const delta=q("#ownerDecisionReviewDelta",centre);
    const brief=q("#ownerDecisionReviewBrief",centre);
    if(delta)delta.insertAdjacentElement("afterend",section);
    else if(brief)brief.insertAdjacentElement("afterend",section);
    else centre.append(section);
    return section;
  }

  function card(item){
    const spec=triggerSpec(item,[]);
    const el=node("article",undefined,"trigger-card");
    el.append(node("h5",spec.title));
    if(spec.currentSummary)el.append(node("p",spec.currentSummary.slice(0,190)));
    const actions=node("div",undefined,"trigger-actions");
    let triggerButton;
    triggerButton=button("Check reconsideration",()=>{void checkTrigger(item,triggerButton)},"btn alt");
    actions.append(triggerButton);
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
    const head=node("div",undefined,"trigger-head");
    const copy=node("div");
    copy.append(node("div","Reconsideration trigger","section-eyebrow"),node("h4","Has enough verified evidence changed to justify another owner review?"));
    copy.append(node("div","Manual check only · no reopening, monitoring, persistence, approval, or execution","trigger-meta"));
    head.append(copy);
    section.append(head);
    if(state!=="ready"){
      section.append(node("div","Canonical decision data is not verified, so V345 will not assess a reconsideration trigger.","trigger-unavailable"));
      return;
    }
    const items=decisionItems(snapshot);
    if(!items.length){
      section.append(node("div","No verified owner decisions are available for reconsideration review.","trigger-empty"));
      return;
    }
    const list=node("div",undefined,"trigger-list");
    items.slice(0,6).forEach(item=>list.append(card(item)));
    section.append(list);
    section.append(node("div","V345 reads owner-confirmed decision/result evidence only when you press Check reconsideration. It does not reopen a decision or watch for future changes.","trigger-note"));
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

  global.ThebeOwnerDecisionReconsiderationTrigger=Object.freeze({
    release:RELEASE,
    triggerSpec,
    triggerPrompt,
    checkTrigger
  });
})(window);
