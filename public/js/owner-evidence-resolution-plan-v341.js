(function installOwnerEvidenceResolutionPlanV341(global){
  "use strict";

  const RELEASE="20261015-owner-evidence-resolution-plan-v341";
  const SECTION_ID="ownerEvidenceResolutionPlan";
  const STYLE_ID="ownerEvidenceResolutionPlanStyle";
  const REFRESH_MS=60000;
  const q=(selector,root=document)=>root.querySelector(selector);
  let refreshBusy=false;
  let refreshTimer=null;
  let rows=[];

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
  function resultRows(payload){
    const items=Array.isArray(payload?.items)?payload.items:[];
    return items.filter(row=>row?.namespace==="operations"&&row?.value?.kind==="owner_experiment_result");
  }
  function recordedAt(record){
    const stamp=Date.parse(String(record?.value?.recordedAt||record?.updatedAt||record?.createdAt||""));
    return Number.isFinite(stamp)?stamp:0;
  }
  function peersFor(record){
    try{return global.ThebeOwnerEvidenceConflictDetection?.peersFor?.(record)||[]}
    catch{return []}
  }
  function qualityProfile(record){
    try{return global.ThebeOwnerEvidenceQualityScoring?.qualityProfile?.(record)||null}
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
#${SECTION_ID} .resolution-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#${SECTION_ID} .resolution-head h4{margin:2px 0 0;font-size:14px;line-height:1.25}
#${SECTION_ID} .resolution-meta{margin-top:3px;font-size:10px;line-height:1.4;color:var(--muted,#6b7176)}
#${SECTION_ID} .resolution-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}
#${SECTION_ID} .resolution-card{min-width:0;border:1px solid var(--line,#e3e6e8);border-radius:12px;padding:10px;background:var(--card,#fff)}
#${SECTION_ID} .resolution-card h5{margin:0;font-size:11px;line-height:1.35;overflow-wrap:anywhere}
#${SECTION_ID} .resolution-card p{margin:5px 0 0;font-size:9px;line-height:1.4;color:var(--muted,#6b7176);overflow-wrap:anywhere}
#${SECTION_ID} .resolution-badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}
#${SECTION_ID} .resolution-badge{display:inline-flex;padding:3px 7px;border:1px solid var(--line,#e3e6e8);border-radius:999px;font-size:9px;font-weight:850}
#${SECTION_ID} .resolution-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
#${SECTION_ID} .resolution-actions button{min-height:34px;padding:6px 9px;border-radius:9px;font-size:9px;font-weight:850}
#${SECTION_ID} .resolution-note,#${SECTION_ID} .resolution-empty,#${SECTION_ID} .resolution-error{margin-top:8px;font-size:9px;line-height:1.45;color:var(--muted,#6b7176)}
#${SECTION_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #8f1d16}
@media(max-width:720px){#${SECTION_ID} .resolution-list{grid-template-columns:1fr}}
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
    section.setAttribute("aria-label","Evidence resolution plan");
    section.setAttribute("aria-live","polite");
    const conflict=q("#ownerEvidenceConflictDetection",centre);
    const quality=q("#ownerEvidenceQualityScoring",centre);
    if(conflict)conflict.insertAdjacentElement("afterend",section);
    else if(quality)quality.insertAdjacentElement("afterend",section);
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

  function peerEvidence(peer,index){
    const value=peer?.value||{};
    return `Saved comparison ${index+1}: observation=${clean(value.observedEvidence,420)||"not recorded"}; source=${clean(value.evidenceSource,180)||"not recorded"}; period=${clean(value.observationPeriod,140)||"not recorded"}; question=${clean(value.experimentQuestion,220)||"not recorded"}.`;
  }
  function resolutionSpec(record){
    const value=record?.value||{};
    const peers=peersFor(record).slice(0,4);
    const quality=qualityProfile(record)||{};
    return Object.freeze({
      title:clean(value.title,220)||"Owner experiment result",
      experimentQuestion:clean(value.experimentQuestion,280),
      observedEvidence:clean(value.observedEvidence,700),
      evidenceSource:clean(value.evidenceSource,220),
      observationPeriod:clean(value.observationPeriod,160),
      comparableSavedEvidence:peers.map((peer,index)=>peerEvidence(peer,index)),
      evidenceQuality:Object.freeze({
        sourceQuality:clean(quality.sourceQuality,120)||"Unknown",
        recency:clean(quality.recency,120)||"Unknown",
        completeness:clean(quality.completeness,80)||"Unknown",
        independence:clean(quality.independence,120)||"Unknown",
        timing:clean(quality.timing,120)||"Unknown"
      }),
      authoritative:false,
      authority:"context_only_no_execution"
    });
  }
  function resolutionPrompt(record){
    const spec=resolutionSpec(record);
    const comparisons=spec.comparableSavedEvidence.length?spec.comparableSavedEvidence.join(" "):"No saved peer evidence shares the same source identity or normalized experiment question; use only current verified business context if it contains genuinely comparable evidence.";
    return `Create the SMALLEST EVIDENCE RESOLUTION PLAN for this owner evidence question, but only if a material conflict remains genuinely unresolved after applying V340 comparability rules. First re-check whether the evidence relationship is materially conflicts, scope/time difference, not comparable, corroborates, or Unknown. Do not treat different owner assessments as a conflict. Primary decision/evidence title: “${spec.title}”. Experiment question: ${spec.experimentQuestion||"not recorded"}. Primary observed evidence: ${spec.observedEvidence||"not recorded"}. Primary source/reference: ${spec.evidenceSource||"not recorded"}. Primary observation period: ${spec.observationPeriod||"not recorded"}. Evidence-quality context is non-authoritative: source=${spec.evidenceQuality.sourceQuality}, recency=${spec.evidenceQuality.recency}, completeness=${spec.evidenceQuality.completeness}, independence=${spec.evidenceQuality.independence}, timing=${spec.evidenceQuality.timing}. ${comparisons} Use current verified business context first. If no material unresolved conflict is verified, or if the apparent disagreement is only a scope/time/definition difference that is already explainable, state exactly: “No resolution plan warranted.” If a genuine unresolved conflict remains, identify: (1) the exact disputed claim; (2) the comparability gap that prevents resolution now — metric/definition, entity/population scope, sample, aggregation level, currency/unit, observation period, or provenance; (3) the minimum additional evidence needed — collect no more than is necessary to resolve that claim; (4) the required source/provenance characteristics, without inventing access to a source that is not verified available; (5) the exact population/entity scope and unit/definition that must match; (6) the observation window only when an authoritative cadence, contractual period, or owner-defined period exists — otherwise say “owner-defined observation period required”; (7) the resolution criterion: what evidence relationship would allow the owner to classify the conflict as corroborates, materially conflicts, scope/time difference, not comparable, or still Unknown; (8) the stop condition for evidence gathering, including stopping once the resolution criterion is met or when additional collection would not change the decision; (9) the accountable human reviewer needed to confirm provenance and comparability; and (10) the safest reversible next step to obtain or inspect the evidence manually. Prefer existing authoritative records over creating a new experiment. Do not invent a budget, sample size, numeric threshold, confidence percentage, probability, source availability, observation period, or statistical significance rule. Do not collect data, browse external systems, request files, contact people, schedule work, create tasks, or launch an experiment. Do not alter the conflict classification, evidence-quality label, experiment assessment, decision outcome rating, canonical queue, approval state, or any business record. Do not execute, approve, pay, file, send, contact, or schedule anything.`;
  }
  function planResolution(record){
    if(!isOwner()||!record)return false;
    return setDockPrompt(resolutionPrompt(record));
  }

  function card(record){
    const value=record?.value||{};
    const peers=peersFor(record);
    const article=node("article",undefined,"resolution-card");
    article.append(node("h5",clean(value.title,220)||"Owner experiment result"));
    article.append(node("p",`Question: ${clean(value.experimentQuestion,220)||"Not recorded"}`));
    const badges=node("div",undefined,"resolution-badges");
    badges.append(node("span",`${peers.length} saved comparable record${peers.length===1?"":"s"}`,"resolution-badge"));
    badges.append(node("span","Conflict must be re-verified","resolution-badge"));
    article.append(badges);
    const actions=node("div",undefined,"resolution-actions");
    actions.append(button("Plan resolution",()=>planResolution(record),"btn alt"));
    article.append(actions);
    return article;
  }

  function render(){
    const section=ensureSection();
    if(!section)return;
    section.replaceChildren();
    const head=node("div",undefined,"resolution-head");
    const copy=node("div");
    copy.append(node("div","Evidence resolution plan","section-eyebrow"),node("h4","Resolve only the evidence gap that changes the decision"),node("div","A plan is generated only after the conflict is re-verified. If no genuine unresolved conflict remains, Thebe must say: No resolution plan warranted.","resolution-meta"));
    head.append(copy);section.append(head);
    if(!rows.length){
      section.append(node("div","No owner-confirmed experiment evidence is available for resolution planning yet.","resolution-empty"));
      return;
    }
    const sorted=rows.slice().sort((a,b)=>recordedAt(b)-recordedAt(a));
    const list=node("div",undefined,"resolution-list");
    sorted.slice(0,4).forEach(record=>list.append(card(record)));
    section.append(list);
    if(sorted.length>4)section.append(node("div",`${sorted.length-4} more owner-confirmed experiment results are available in Business Memory.`,"resolution-empty"));
    section.append(node("div","Planning-only advisory layer. V341 does not gather evidence, browse external systems, create tasks, schedule work, launch experiments, change classifications, or grant approval/execution authority.","resolution-note"));
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
      rows=resultRows(payload);
      render();
    }catch{
      const section=ensureSection();
      if(section)section.replaceChildren(node("div","Evidence Resolution Plan is temporarily unavailable. No business state was changed.","resolution-error"));
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

  global.ThebeOwnerEvidenceResolutionPlan=Object.freeze({
    release:RELEASE,
    refresh,
    planResolution,
    resolutionSpec,
    resolutionPrompt
  });
})(window);