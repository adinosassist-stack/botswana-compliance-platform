(function installOwnerEvidenceQualityScoringV339(global){
  "use strict";

  const RELEASE="20261015-owner-evidence-quality-scoring-v339";
  const SECTION_ID="ownerEvidenceQualityScoring";
  const STYLE_ID="ownerEvidenceQualityScoringStyle";
  const REFRESH_MS=60000;
  const RESULT_ASSESSMENTS=Object.freeze({
    continue_supported:"Continue evidence met",
    stop_or_revise_supported:"Stop / revise evidence met",
    mixed:"Mixed evidence",
    inconclusive:"Inconclusive"
  });
  const q=(selector,root=document)=>root.querySelector(selector);
  let refreshBusy=false;
  let refreshTimer=null;

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

  function installStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement("style");
    style.id=STYLE_ID;
    const nonce=document.querySelector("style[nonce],script[nonce]")?.nonce;
    if(nonce)style.nonce=nonce;
    style.textContent=`
#${SECTION_ID}{margin:10px 0 16px;padding:12px;border:1px solid var(--line,#e3e6e8);border-radius:15px;background:var(--card,#fff);min-width:0}
#${SECTION_ID} .quality-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#${SECTION_ID} .quality-head h4{margin:2px 0 0;font-size:14px;line-height:1.25}
#${SECTION_ID} .quality-meta{margin-top:3px;font-size:10px;line-height:1.4;color:var(--muted,#6b7176)}
#${SECTION_ID} .quality-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}
#${SECTION_ID} .quality-card{min-width:0;border:1px solid var(--line,#e3e6e8);border-radius:12px;padding:10px;background:var(--card,#fff)}
#${SECTION_ID} .quality-card h5{margin:0;font-size:11px;line-height:1.35;overflow-wrap:anywhere}
#${SECTION_ID} .quality-card p{margin:5px 0 0;font-size:9px;line-height:1.4;color:var(--muted,#6b7176);overflow-wrap:anywhere}
#${SECTION_ID} .quality-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-top:8px}
#${SECTION_ID} .quality-dim{min-width:0;border:1px solid var(--line,#e3e6e8);border-radius:9px;padding:6px}
#${SECTION_ID} .quality-dim b{display:block;font-size:9px;line-height:1.25;overflow-wrap:anywhere}
#${SECTION_ID} .quality-dim span{display:block;margin-top:2px;font-size:8px;line-height:1.3;color:var(--muted,#6b7176);overflow-wrap:anywhere}
#${SECTION_ID} .quality-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
#${SECTION_ID} .quality-actions button{min-height:34px;padding:6px 9px;border-radius:9px;font-size:9px;font-weight:850}
#${SECTION_ID} .quality-note,#${SECTION_ID} .quality-empty,#${SECTION_ID} .quality-error{margin-top:8px;font-size:9px;line-height:1.45;color:var(--muted,#6b7176)}
#${SECTION_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #8f1d16}
@media(max-width:980px){#${SECTION_ID} .quality-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:720px){#${SECTION_ID} .quality-list{grid-template-columns:1fr}#${SECTION_ID} .quality-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
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
    section.setAttribute("aria-label","Evidence quality scoring");
    section.setAttribute("aria-live","polite");
    const result=q("#ownerExperimentResultReview",centre);
    const planner=q("#ownerDecisionExperimentPlanner",centre);
    if(result)result.insertAdjacentElement("afterend",section);
    else if(planner)planner.insertAdjacentElement("afterend",section);
    else centre.append(section);
    return section;
  }

  function resultRows(payload){
    const rows=Array.isArray(payload?.items)?payload.items:[];
    return rows.filter(row=>row?.namespace==="operations"&&row?.value?.kind==="owner_experiment_result");
  }
  function presence(value){return Boolean(clean(value,10_000))}
  function completeness(value={}){
    const observed=presence(value.observedEvidence);
    const source=presence(value.evidenceSource);
    const period=presence(value.observationPeriod);
    const criteria=value.criteriaPredatedTest===true&&presence(value.continueCriterion)&&presence(value.stopCriterion);
    const count=[observed,source,period,criteria].filter(Boolean).length;
    if(count===4)return "Strong";
    if(count>=2)return "Moderate";
    return "Weak";
  }
  function qualityProfile(record){
    const value=record?.value||{};
    return Object.freeze({
      title:clean(value.title,220)||"Owner experiment result",
      sourceQuality:presence(value.evidenceSource)?"Unknown · source named, quality unverified":"Weak · source not recorded",
      recency:presence(value.observationPeriod)?"Unknown · period recorded, recency unverified":"Weak · observation period missing",
      completeness:completeness(value),
      independence:"Unknown · provenance / independence not verified",
      timing:value.criteriaPredatedTest===true?"Unknown · criteria predated review; evidence timing unverified":"Unknown · decision/evidence timing not verified",
      authoritative:false,
      authority:"context_only_no_execution"
    });
  }
  function recordedAt(record){
    const stamp=Date.parse(String(record?.value?.recordedAt||record?.updatedAt||record?.createdAt||""));
    return Number.isFinite(stamp)?stamp:0;
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
  function qualityPrompt(record){
    const value=record?.value||{};
    const profile=qualityProfile(record);
    const criteria=value.criteriaPredatedTest===true&&value.continueCriterion&&value.stopCriterion
      ?`The owner confirms these criteria existed before result review. Continue criterion: ${clean(value.continueCriterion,400)}. Stop/revise criterion: ${clean(value.stopCriterion,400)}.`
      :"Pre-defined criteria were not fully confirmed before result review.";
    return `Score the QUALITY OF THE EVIDENCE for this owner-confirmed experiment result, not the business decision itself. Use current verified business context first. Decision: “${profile.title}”. Experiment question: ${clean(value.experimentQuestion,280)||"not recorded"}. Observed evidence: ${clean(value.observedEvidence,900)||"not recorded"}. Evidence source/reference: ${clean(value.evidenceSource,240)||"not recorded"}. Observation period: ${clean(value.observationPeriod,180)||"not recorded"}. ${criteria} Owner interpretation, which must stay separate from observed evidence: ${clean(value.ownerInterpretation,500)||"not recorded"}. Owner-confirmed result assessment: ${RESULT_ASSESSMENTS[value.resultAssessment]||"Inconclusive"}. Classify each dimension as Strong, Moderate, Weak, or Unknown: (1) source quality / provenance, (2) recency of the underlying evidence, (3) completeness for answering the experiment question, (4) independence from the person, system, or process being evaluated, and (5) timing relative to the decision and pre-defined criteria. Give the verified reason for every classification. Do not infer that a named source is trustworthy merely because it is named. Do not infer independence unless provenance or ownership is verified. Do not infer evidence recency from recordedAt or review time alone; recency concerns when the underlying observations occurred. Confirmation that criteria predated result review may support process discipline but does not prove source quality, independence, causation, or that evidence was collected before the original decision. If the record or current verified context cannot support a dimension, mark it Unknown. Then give one overall advisory label only: stronger evidence, mixed quality, weak evidence, or insufficient to score. Do not average Unknown dimensions, do not create a numeric confidence/probability, and do not turn the label into approval, blocking, or execution authority. Keep observed facts separate from interpretation and do not convert correlation into causation. Do not alter the experiment assessment, decision outcome rating, canonical queue, or any business record. Do not execute, approve, pay, file, send, contact, or schedule anything.`;
  }
  function scoreEvidence(record){
    if(!isOwner()||!record)return false;
    return setDockPrompt(qualityPrompt(record));
  }

  function dim(label,value){
    const box=node("div",undefined,"quality-dim");
    box.append(node("b",label),node("span",value));
    return box;
  }
  function card(record){
    const value=record?.value||{},profile=qualityProfile(record);
    const article=node("article",undefined,"quality-card");
    article.append(node("h5",profile.title));
    article.append(node("p",`Observed: ${clean(value.observedEvidence,220)||"No observation recorded"}`));
    const grid=node("div",undefined,"quality-grid");
    grid.append(
      dim("Source",profile.sourceQuality),
      dim("Recency",profile.recency),
      dim("Completeness",profile.completeness),
      dim("Independence",profile.independence),
      dim("Decision timing",profile.timing)
    );
    article.append(grid);
    const actions=node("div",undefined,"quality-actions");
    actions.append(button("Score evidence",()=>scoreEvidence(record),"btn alt"));
    article.append(actions);
    return article;
  }

  function render(rows){
    const section=ensureSection();
    if(!section)return;
    section.replaceChildren();
    const head=node("div",undefined,"quality-head");
    const copy=node("div");
    copy.append(node("div","Evidence quality scoring","section-eyebrow"),node("h4","Grade evidence without manufacturing certainty"),node("div","Strong / Moderate / Weak / Unknown only. Unknown dimensions are never averaged into a fake confidence score.","quality-meta"));
    head.append(copy);section.append(head);
    if(!rows.length){
      section.append(node("div","No owner-confirmed experiment result is available to score yet.","quality-empty"));
      return;
    }
    const sorted=rows.slice().sort((a,b)=>recordedAt(b)-recordedAt(a));
    const list=node("div",undefined,"quality-list");
    sorted.slice(0,4).forEach(record=>list.append(card(record)));
    section.append(list);
    if(sorted.length>4)section.append(node("div",`${sorted.length-4} more owner-confirmed experiment results are available in Business Memory.`,"quality-empty"));
    section.append(node("div","Only completeness is graded deterministically from recorded fields. Source quality, evidence recency, independence, and decision timing remain Unknown unless verified context supports them. Evidence quality is advisory context only and never changes an outcome rating, queue priority, approval state, or execution authority.","quality-note"));
  }

  async function refresh(){
    if(!isOwner()){
      document.getElementById(SECTION_ID)?.remove();
      return;
    }
    if(refreshBusy)return;
    refreshBusy=true;
    try{
      const payload=await apiJson("/api/business-memory");
      render(resultRows(payload));
    }catch{
      const section=ensureSection();
      if(section)section.replaceChildren(node("div","Evidence Quality Scoring is temporarily unavailable. No business state was changed.","quality-error"));
    }finally{refreshBusy=false}
  }
  function schedule(){
    global.clearTimeout(refreshTimer);
    refreshTimer=global.setTimeout(()=>void refresh(),120);
  }
  function boot(){
    schedule();
    [700,1800].forEach(delay=>global.setTimeout(schedule,delay));
    global.setInterval(()=>void refresh(),REFRESH_MS);
    global.addEventListener?.("thebe:auth:state",schedule);
    global.addEventListener?.("thebe:identity:ready",schedule);
    global.addEventListener?.("thebe:workspace:view",schedule);
    global.addEventListener?.("thebe:experiment-result-recorded",schedule);
    document.addEventListener("change",event=>{if(event.target?.id==="companySelect")global.setTimeout(()=>void refresh(),550)});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();

  global.ThebeOwnerEvidenceQualityScoring=Object.freeze({
    release:RELEASE,
    refresh,
    scoreEvidence,
    qualityProfile
  });
})(window);