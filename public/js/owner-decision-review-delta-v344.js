(function installOwnerDecisionReviewDeltaV344(global){
  "use strict";

  const RELEASE="20261015-owner-decision-review-delta-v344";
  const SECTION_ID="ownerDecisionReviewDelta";
  const STYLE_ID="ownerDecisionReviewDeltaStyle";
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
  function deltaSpec(item,rows=[]){
    const current=reviewSpec(item)||{};
    const decisionRow=latestMatching(rows,item,"owner_decision_note");
    const resultRow=latestMatching(rows,item,"owner_experiment_result");
    return Object.freeze({
      title:clean(current.title||item?.title||item?.label||item?.name||"Owner decision",220),
      sourceType:clean(current.sourceType||item?.sourceType||item?.kind||"owner_attention",80)||"owner_attention",
      currentSummary:clean(current.currentSummary||item?.summary||item?.detail||item?.description||item?.reason||"",700),
      currentStatus:clean(current.currentStatus||item?.status||item?.truthState||item?.severity||item?.priority||"",100),
      historicalAdjustment:clean(current.historicalAdjustment,80)||"uncalibrated",
      decisionBaseline:decisionBaseline(decisionRow),
      resultBaseline:resultBaseline(resultRow),
      authoritative:false,
      authority:"context_only_no_execution"
    });
  }

  function baselineText(spec){
    const decision=spec.decisionBaseline.available
      ?`Latest owner-confirmed decision note: decision=${spec.decisionBaseline.decision||"not recorded"}; rationale=${spec.decisionBaseline.rationale||"not recorded"}; follow-up=${spec.decisionBaseline.followUpAt||"not recorded"}; recorded=${spec.decisionBaseline.recordedAt||"timestamp unavailable"}.`
      :"No owner-confirmed decision note is available for this canonical decision. Treat the decision baseline as Unknown; absence of a note does not prove no prior decision exists.";
    const result=spec.resultBaseline.available
      ?`Latest owner-confirmed experiment/result evidence: question=${spec.resultBaseline.experimentQuestion||"not recorded"}; observed evidence=${spec.resultBaseline.observedEvidence||"not recorded"}; source=${spec.resultBaseline.evidenceSource||"not recorded"}; observation period=${spec.resultBaseline.observationPeriod||"not recorded"}; criteria predated review=${spec.resultBaseline.criteriaPredatedTest?"yes":"no"}; continue criterion=${spec.resultBaseline.continueCriterion||"not recorded"}; stop/revise criterion=${spec.resultBaseline.stopCriterion||"not recorded"}; owner interpretation=${spec.resultBaseline.ownerInterpretation||"not recorded"}; assessment=${spec.resultBaseline.resultAssessment}; recorded=${spec.resultBaseline.recordedAt||"timestamp unavailable"}.`
      :"No owner-confirmed experiment/result record is available for this canonical decision. Treat result-baseline evidence as Unknown; do not infer that no evidence exists elsewhere.";
    return `${decision} ${result}`;
  }

  function deltaPrompt(item,rows=[]){
    const spec=deltaSpec(item,rows);
    return `Create an OWNER DECISION REVIEW DELTA for “${spec.title}”. Compare the current verified business context against the latest owner-confirmed decision/result evidence supplied below. This is not automatic monitoring: perform a fresh comparison only for this owner-requested review. Current canonical summary: ${spec.currentSummary||"No additional canonical summary is available"}. Current canonical status: ${spec.currentStatus||"Not specified"}. Historical recommendation wording context: ${spec.historicalAdjustment}; historical outcomes are descriptive, not causal proof. ${baselineText(spec)} Only call something a change when current verified evidence establishes both the earlier baseline and the current state with compatible scope, metric, unit, population, and observation period. If a baseline timestamp, source, or comparable current observation is missing, mark the delta Unknown rather than guessing. Re-apply V340 comparability rules before calling new or resolved conflict. Separate observed evidence from owner interpretation and do not infer causation. Produce exactly these sections: (1) Baseline used — state the owner-confirmed decision/result records and dates actually available. (2) New supporting evidence — only evidence verified after or materially different from the baseline; otherwise say No material change verified. (3) Weakened, stale, or superseded evidence — explain what became less decision-useful and why; do not treat age alone as invalidation. (4) Conflict delta — New conflict, Resolved conflict, Unchanged conflict, or Unknown, with the compatible claims/provenance that justify the label. (5) Unknowns delta — material unknowns resolved since baseline and new material unknowns introduced; preserve every unresolved Unknown. (6) Safeguard delta — safeguards newly verified, weakened, removed, or still Unknown; do not invent controls, thresholds, limits, reviewers, or stop triggers. (7) Experiment/result delta — distinguish new observation from changed owner interpretation; if criteria were not genuinely pre-defined, do not upgrade an inconclusive result. (8) Recommendation wording delta — exactly one of Stronger wording warranted, More cautious wording warranted, Wording unchanged, or Unknown. Current verified evidence must override historical pattern wording. This wording delta does not approve, reject, or authorize the decision. (9) Materiality summary — state only the few changes that could realistically alter the owner’s review; if none are verified, say No material change verified. (10) Smallest next review step — the smallest reversible manual review action needed now, or No additional review action warranted when the verified delta is immaterial. Do not create numeric confidence, risk, probability, materiality score, or synthetic evidence score. Do not persist this delta, create a baseline snapshot, schedule another check, monitor for changes, browse external systems, collect data, request files, contact people, create tasks, launch experiments, alter evidence quality/conflict/readiness/result assessment, change the canonical queue, approve, reject, pay, file, send, or execute anything. End with: “Advisory delta only — no approval, monitoring, or execution authority.”`;
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

  async function reviewDelta(item,buttonEl){
    if(!isOwner()||!item||readBusy)return false;
    const snapshot=canonicalSnapshot();
    if(clean(snapshot?.state,40).toLowerCase()!=="ready")return false;
    readBusy=true;
    if(buttonEl)buttonEl.disabled=true;
    try{
      const payload=await apiJson("/api/business-memory");
      const rows=Array.isArray(payload?.items)?payload.items:[];
      return setDockPrompt(deltaPrompt(item,rows));
    }catch{
      return setDockPrompt(deltaPrompt(item,[]));
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
#${SECTION_ID} .delta-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#${SECTION_ID} .delta-head h4{margin:2px 0 0;font-size:14px;line-height:1.25}
#${SECTION_ID} .delta-meta{margin-top:3px;font-size:10px;line-height:1.4;color:var(--muted,#6b7176)}
#${SECTION_ID} .delta-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
#${SECTION_ID} .delta-card{min-width:0;border:1px solid var(--line,#e3e6e8);border-radius:12px;padding:10px;background:var(--card,#fff)}
#${SECTION_ID} .delta-card h5{margin:0;font-size:11px;line-height:1.35;overflow-wrap:anywhere}
#${SECTION_ID} .delta-card p{margin:5px 0 0;font-size:9px;line-height:1.4;color:var(--muted,#6b7176);overflow-wrap:anywhere}
#${SECTION_ID} .delta-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
#${SECTION_ID} .delta-actions button{min-height:34px;padding:6px 9px;border-radius:9px;font-size:9px;font-weight:850}
#${SECTION_ID} .delta-note,#${SECTION_ID} .delta-empty,#${SECTION_ID} .delta-unavailable{margin-top:8px;font-size:9px;line-height:1.45;color:var(--muted,#6b7176)}
#${SECTION_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #8f1d16}
@media(max-width:980px){#${SECTION_ID} .delta-list{grid-template-columns:1fr 1fr}}
@media(max-width:680px){#${SECTION_ID} .delta-list{grid-template-columns:1fr}}
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
    section.setAttribute("aria-label","Owner decision review delta");
    section.setAttribute("aria-live","polite");
    const brief=q("#ownerDecisionReviewBrief",centre);
    if(brief)brief.insertAdjacentElement("afterend",section);
    else centre.append(section);
    return section;
  }

  function card(item){
    const spec=deltaSpec(item,[]);
    const el=node("article",undefined,"delta-card");
    el.append(node("h5",spec.title));
    if(spec.currentSummary)el.append(node("p",spec.currentSummary.slice(0,190)));
    const actions=node("div",undefined,"delta-actions");
    let reviewButton;
    reviewButton=button("Review changes",()=>{void reviewDelta(item,reviewButton)},"btn alt");
    actions.append(reviewButton);
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
    const head=node("div",undefined,"delta-head");
    const copy=node("div");
    copy.append(node("div","Owner review delta","section-eyebrow"),node("h4","What materially changed since your last confirmed evidence?"));
    copy.append(node("div","Manual comparison only · no monitoring, persistence, approval, or execution","delta-meta"));
    head.append(copy);
    section.append(head);
    if(state!=="ready"){
      section.append(node("div","Canonical decision data is not verified, so V344 will not create a change comparison.","delta-unavailable"));
      return;
    }
    const items=decisionItems(snapshot);
    if(!items.length){
      section.append(node("div","No verified owner decisions are available for delta review.","delta-empty"));
      return;
    }
    const list=node("div",undefined,"delta-list");
    items.slice(0,6).forEach(item=>list.append(card(item)));
    section.append(list);
    section.append(node("div","V344 reads owner-confirmed decision/result evidence only when you press Review changes. It does not create a baseline snapshot or watch for future changes.","delta-note"));
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
      observer.observe(centre,{subtree:true,childList:true,attributes:true,attributeFilter:["class","hidden","data-state"]});
    }
    document.addEventListener("change",event=>{
      if(event.target?.id==="companySelect")schedule();
    });
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();

  global.ThebeOwnerDecisionReviewDelta=Object.freeze({
    release:RELEASE,
    refresh:schedule,
    reviewDelta,
    deltaSpec,
    deltaPrompt
  });
})(window);
