(function installOwnerDecisionReviewBriefV343(global){
  "use strict";

  const RELEASE="20261015-owner-decision-review-brief-v343";
  const SECTION_ID="ownerDecisionReviewBrief";
  const STYLE_ID="ownerDecisionReviewBriefStyle";
  const REFRESH_MS=60000;
  const q=(selector,root=document)=>root.querySelector(selector);
  let scheduled=false;
  let resultRows=[];
  let refreshBusy=false;

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
  function sourceKey(item){
    const direct=clean(item?.key,300);
    if(direct)return direct;
    const type=clean(item?.sourceType||item?.kind||"owner_attention",80);
    const id=clean(item?.sourceId||item?.id||item?.title||"item",200);
    return `${type}:${id}`.slice(0,300);
  }
  function tinyHash(value){
    let hash=2166136261;
    for(const char of String(value??"")){
      hash^=char.codePointAt(0)||0;
      hash=Math.imul(hash,16777619);
    }
    return (hash>>>0).toString(36);
  }
  function resultKey(item){
    const source=sourceKey(item);
    const slug=source.toLowerCase().replace(/[^a-z0-9.-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,42)||"item";
    return `experiment-result.${tinyHash(source)}.${slug}`.slice(0,80);
  }
  function linkedResult(item){
    const key=resultKey(item),source=sourceKey(item);
    return resultRows.find(row=>row?.namespace==="operations"&&row?.value?.kind==="owner_experiment_result"&&(row?.key===key||clean(row?.value?.sourceKey,300)===source))||null;
  }
  function decisionItems(snapshot){
    const items=Array.isArray(snapshot?.items)?snapshot.items:[];
    return items.filter(item=>classify(item)==="decision");
  }
  function challengeSpec(item){
    try{return global.ThebeOwnerRecommendationChallengeMode?.challengeSpec?.(item)||null}
    catch{return null}
  }
  function premortemSpec(item){
    try{return global.ThebeOwnerDecisionPremortem?.premortemSpec?.(item)||null}
    catch{return null}
  }
  function safeguardSpec(item){
    try{return global.ThebeOwnerDecisionSafeguardGate?.safeguardSpec?.(item)||null}
    catch{return null}
  }
  function qualityProfile(record){
    try{return record?global.ThebeOwnerEvidenceQualityScoring?.qualityProfile?.(record)||null:null}
    catch{return null}
  }
  function peersFor(record){
    try{return record?global.ThebeOwnerEvidenceConflictDetection?.peersFor?.(record)||[]:[]}
    catch{return []}
  }
  function readinessSpec(record){
    try{return record?global.ThebeOwnerDecisionEvidenceReadiness?.readinessSpec?.(record)||null:null}
    catch{return null}
  }
  function calibration(sourceType){
    try{return global.ThebeOwnerDecisionRecommendationCalibration?.getCalibration?.(sourceType)||null}
    catch{return null}
  }

  function installStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement("style");
    style.id=STYLE_ID;
    const nonce=document.querySelector("style[nonce],script[nonce]")?.nonce;
    if(nonce)style.nonce=nonce;
    style.textContent=`
#${SECTION_ID}{margin:10px 0 16px;padding:12px;border:1px solid var(--line,#e3e6e8);border-radius:15px;background:var(--card,#fff);min-width:0}
#${SECTION_ID} .brief-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#${SECTION_ID} .brief-head h4{margin:2px 0 0;font-size:14px;line-height:1.25}
#${SECTION_ID} .brief-meta{margin-top:3px;font-size:10px;line-height:1.4;color:var(--muted,#6b7176)}
#${SECTION_ID} .brief-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
#${SECTION_ID} .brief-card{min-width:0;border:1px solid var(--line,#e3e6e8);border-radius:12px;padding:10px;background:var(--card,#fff)}
#${SECTION_ID} .brief-card h5{margin:0;font-size:11px;line-height:1.35;overflow-wrap:anywhere}
#${SECTION_ID} .brief-card p{margin:5px 0 0;font-size:9px;line-height:1.4;color:var(--muted,#6b7176);overflow-wrap:anywhere}
#${SECTION_ID} .brief-badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}
#${SECTION_ID} .brief-badge{display:inline-flex;padding:3px 7px;border:1px solid var(--line,#e3e6e8);border-radius:999px;font-size:9px;font-weight:850}
#${SECTION_ID} .brief-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
#${SECTION_ID} .brief-actions button{min-height:34px;padding:6px 9px;border-radius:9px;font-size:9px;font-weight:850}
#${SECTION_ID} .brief-note,#${SECTION_ID} .brief-empty,#${SECTION_ID} .brief-unavailable,#${SECTION_ID} .brief-error{margin-top:8px;font-size:9px;line-height:1.45;color:var(--muted,#6b7176)}
#${SECTION_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #8f1d16}
@media(max-width:980px){#${SECTION_ID} .brief-list{grid-template-columns:1fr 1fr}}
@media(max-width:680px){#${SECTION_ID} .brief-list{grid-template-columns:1fr}}
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
    section.setAttribute("aria-label","Owner decision review brief");
    section.setAttribute("aria-live","polite");
    const readiness=q("#ownerDecisionEvidenceReadiness",centre);
    const resolution=q("#ownerEvidenceResolutionPlan",centre);
    if(readiness)readiness.insertAdjacentElement("afterend",section);
    else if(resolution)resolution.insertAdjacentElement("afterend",section);
    else centre.append(section);
    return section;
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

  function resultContext(record){
    if(!record)return Object.freeze({available:false});
    const value=record?.value||{};
    const quality=qualityProfile(record)||{};
    const readiness=readinessSpec(record)||{};
    return Object.freeze({
      available:true,
      experimentQuestion:clean(value.experimentQuestion,280),
      observedEvidence:clean(value.observedEvidence,700),
      evidenceSource:clean(value.evidenceSource,220),
      observationPeriod:clean(value.observationPeriod,160),
      ownerInterpretation:clean(value.ownerInterpretation,500),
      ownerAssessment:clean(value.resultAssessment,80)||"inconclusive",
      criteriaPredatedTest:value.criteriaPredatedTest===true,
      continueCriterion:clean(value.continueCriterion,400),
      stopCriterion:clean(value.stopCriterion,400),
      quality:Object.freeze({
        sourceQuality:clean(quality.sourceQuality,120)||"Unknown",
        recency:clean(quality.recency,120)||"Unknown",
        completeness:clean(quality.completeness,80)||"Unknown",
        independence:clean(quality.independence,120)||"Unknown",
        timing:clean(quality.timing,120)||"Unknown"
      }),
      localReadiness:clean(readiness.localState,80)||"Unknown",
      localReadinessReason:clean(readiness.localReason,500),
      comparablePeerCount:peersFor(record).length
    });
  }

  function reviewSpec(item){
    const challenge=challengeSpec(item)||{};
    const pre=premortemSpec(item)||{};
    const safeguard=safeguardSpec(item)||{};
    const sourceType=clean(pre.sourceType||challenge.sourceType||item?.sourceType||item?.kind||"owner_attention",80)||"owner_attention";
    const history=calibration(sourceType)||{};
    const record=linkedResult(item);
    return Object.freeze({
      title:clean(pre.title||challenge.title||item?.title||item?.label||item?.name||"Owner decision",220),
      sourceType,
      currentSummary:clean(pre.currentSummary||challenge.currentSummary||item?.summary||item?.detail||item?.description||item?.reason||"",700),
      currentStatus:clean(pre.currentStatus||challenge.currentStatus||item?.status||item?.truthState||item?.severity||item?.priority||"",100),
      historicalAdjustment:clean(history.adjustment||history.wordingAdjustment||pre.historicalAdjustment,80)||"uncalibrated",
      historicalDirectionalSample:Number(history.directionalSample??pre.historicalDirectionalSample??0)||0,
      historicalEvidenceLevel:clean(history.evidenceLevel||pre.historicalEvidenceLevel,80)||"insufficient",
      exposureSignals:Object.freeze(Array.isArray(safeguard.exposureSignals)?safeguard.exposureSignals.map(value=>clean(value,180)).filter(Boolean):[]),
      result:resultContext(record),
      authoritative:false,
      authority:"context_only_no_execution"
    });
  }

  function reviewPrompt(item){
    const spec=reviewSpec(item),result=spec.result;
    const experiment=result.available
      ?`Owner-confirmed experiment result exists. Question: ${result.experimentQuestion||"not recorded"}. Observed evidence: ${result.observedEvidence||"not recorded"}. Source/reference: ${result.evidenceSource||"not recorded"}. Observation period: ${result.observationPeriod||"not recorded"}. Criteria predated review: ${result.criteriaPredatedTest?"yes":"no"}. Continue criterion: ${result.continueCriterion||"not recorded"}. Stop/revise criterion: ${result.stopCriterion||"not recorded"}. Owner interpretation: ${result.ownerInterpretation||"not recorded"}. Owner assessment: ${result.ownerAssessment}. Evidence quality context: source=${result.quality.sourceQuality}, recency=${result.quality.recency}, completeness=${result.quality.completeness}, independence=${result.quality.independence}, timing=${result.quality.timing}. Deterministic local readiness: ${result.localReadiness}${result.localReadinessReason?`: ${result.localReadinessReason}`:""}. Comparable saved peer count: ${result.comparablePeerCount}.`
      :"No owner-confirmed experiment result is currently linked to this canonical decision. Do not infer that no evidence exists; treat experiment-result evidence as unavailable unless current verified business context supplies it.";
    const exposure=spec.exposureSignals.length?spec.exposureSignals.join("; "):"No additional deterministic exposure signal beyond being a verified owner decision.";
    return `Create a concise OWNER DECISION REVIEW BRIEF for “${spec.title}”. Use current verified business context first and re-evaluate every non-persisted analysis fresh; do not assume an earlier AI pre-mortem, safeguard review, conflict review, resolution plan, or readiness answer is still valid. Canonical decision summary: ${spec.currentSummary||"No additional canonical summary is available"}. Canonical status: ${spec.currentStatus||"Not specified"}. Source type: ${spec.sourceType}. Historical recommendation-calibration context is descriptive only: adjustment=${spec.historicalAdjustment}, directional sample=${spec.historicalDirectionalSample}, evidence level=${spec.historicalEvidenceLevel}. Deterministic presentation exposure signals: ${exposure}. These are not a risk score. ${experiment} Produce exactly these sections in this order: (1) Decision in one sentence — what the owner is actually deciding now. (2) Current recommendation — the best current recommendation supported by verified evidence, with wording strength calibrated to evidence; if evidence cannot support a recommendation, say Unknown rather than inventing one. (3) Evidence supporting the recommendation — verified facts only, with source/provenance and observation period where available. (4) Evidence against / material conflict — re-apply V340 comparability rules before calling anything contradictory; different scope, metric, population, unit, or period is not automatically a conflict. Do not manufacture false balance and do not choose a winner without a verified reason. (5) Evidence quality and readiness — classify quality dimensions as Strong, Moderate, Weak, or Unknown only where supported, then state exactly one readiness state: Ready for review, Needs evidence, Material conflict unresolved, or Unknown. Ready for review means suitable for human owner review only, not approval, safety, correctness, or authorization. (6) Material unknowns — only unknowns that could change the decision. (7) Pre-mortem — assume six months later the decision disappointed materially; list the strongest plausible failure modes as hypotheses unless currently evidenced, early warning signals, irreversible commitments, and exit triggers. Do not invent probabilities or thresholds. (8) Safeguards — classify each relevant safeguard as Defined, Partial, Missing, or Unknown: measurable success/failure signal, early warning, reversible first step, exit trigger, verified exposure limit, accountable human reviewer, irreversible commitment. (9) Experiment/result interpretation — if a linked owner-confirmed result exists, keep observed evidence separate from owner interpretation and do not infer causation; if criteria were not genuinely pre-defined, do not upgrade an inconclusive result. If no result exists, say unavailable. (10) Smallest next step — the smallest reversible manual action that most reduces the decision-relevant uncertainty. Prefer existing authoritative records over a new experiment and say “No additional evidence action warranted” when current verified evidence is already sufficient for review. (11) Owner review questions — at most three crisp questions the owner should answer before deciding. End with: “Advisory review only — no approval or execution authority.” Do not create a numeric confidence, risk score, probability, or synthetic evidence score. Preserve every Unknown. Historical outcomes are descriptive, not causal proof. Do not persist this brief or readiness state. Do not alter evidence quality, conflict classification, resolution status, experiment assessment, decision outcome rating, canonical queue, approval state, or any business record. Do not collect data, browse external systems, request files, contact people, create tasks, schedule work, launch experiments, execute, approve, pay, file, or send anything.`;
  }

  function generateBrief(item){
    if(!isOwner()||!item)return false;
    return setDockPrompt(reviewPrompt(item));
  }

  function itemCard(item){
    const spec=reviewSpec(item);
    const card=node("article",undefined,"brief-card");
    card.append(node("h5",spec.title));
    if(spec.currentSummary)card.append(node("p",spec.currentSummary.slice(0,190)));
    const badges=node("div",undefined,"brief-badges");
    badges.append(node("span",spec.result.available?"Experiment evidence linked":"Experiment evidence unavailable","brief-badge"));
    badges.append(node("span",`History: ${spec.historicalEvidenceLevel}`,"brief-badge"));
    badges.append(node("span","Final brief: not inferred","brief-badge"));
    card.append(badges);
    const controls=node("div",undefined,"brief-actions");
    controls.append(button("Generate review brief",()=>generateBrief(item),"btn alt"));
    card.append(controls);
    return card;
  }

  function render(){
    scheduled=false;
    if(!isOwner()){
      document.getElementById(SECTION_ID)?.remove();
      return;
    }
    const centre=q("#ownerCommandCentre");
    if(!centre||centre.hidden)return;
    const section=ensureSection();
    if(!section)return;
    const snapshot=canonicalSnapshot();
    const state=clean(snapshot?.state,40).toLowerCase();
    section.replaceChildren();
    const head=node("div",undefined,"brief-head");
    const copy=node("div");
    copy.append(node("div","Owner decision review brief","section-eyebrow"),node("h4","Put the whole decision on one page"),node("div","Fresh synthesis of recommendation, evidence, conflicts, risks, safeguards, experiment results and readiness. Advisory only.","brief-meta"));
    head.append(copy);section.append(head);
    if(state!=="ready"){
      section.append(node("div","Canonical decision data is not verified, so V343 will not create a decision brief.","brief-unavailable"));
      return;
    }
    const decisions=decisionItems(snapshot);
    if(!decisions.length){
      section.append(node("div","No verified owner decision is currently available for a review brief.","brief-empty"));
      return;
    }
    const list=node("div",undefined,"brief-list");
    decisions.slice(0,3).forEach(item=>list.append(itemCard(item)));
    section.append(list);
    if(decisions.length>3)section.append(node("div",`${decisions.length-3} more verified owner decisions are available in the canonical queue.`,"brief-empty"));
    section.append(node("div","V343 is a read-only synthesis layer. It re-evaluates non-persisted analyses from current verified context and never treats a generated brief as approval, safety certification, or execution authority.","brief-note"));
  }

  async function refreshEvidence(){
    if(!isOwner())return;
    if(refreshBusy)return;
    refreshBusy=true;
    try{
      const payload=await apiJson("/api/business-memory");
      const items=Array.isArray(payload?.items)?payload.items:[];
      resultRows=items.filter(row=>row?.namespace==="operations"&&row?.value?.kind==="owner_experiment_result");
    }catch{
      resultRows=[];
    }finally{
      refreshBusy=false;
      schedule();
    }
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    global.setTimeout(render,140);
  }
  function boot(){
    void refreshEvidence();
    [800,2100].forEach(delay=>global.setTimeout(()=>{schedule();void refreshEvidence()},delay));
    global.setInterval(()=>void refreshEvidence(),REFRESH_MS);
    const root=q("#homeDecisionCenter")||document.body;
    new MutationObserver(schedule).observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:["class","hidden","data-state","data-release","data-canonical-version"]});
    global.addEventListener?.("thebe:auth:state",()=>void refreshEvidence());
    global.addEventListener?.("thebe:identity:ready",()=>void refreshEvidence());
    global.addEventListener?.("thebe:workspace:view",schedule);
    global.addEventListener?.("thebe:experiment-result-recorded",()=>void refreshEvidence());
    document.addEventListener("change",event=>{if(event.target?.id==="companySelect")global.setTimeout(()=>void refreshEvidence(),550)});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();

  global.ThebeOwnerDecisionReviewBrief=Object.freeze({
    release:RELEASE,
    refresh:()=>{void refreshEvidence()},
    generateBrief,
    reviewSpec,
    reviewPrompt
  });
})(window);