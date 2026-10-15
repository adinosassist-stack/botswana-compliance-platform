(function installOwnerEvidenceConflictDetectionV340(global){
  "use strict";

  const RELEASE="20261015-owner-evidence-conflict-detection-v340";
  const SECTION_ID="ownerEvidenceConflictDetection";
  const STYLE_ID="ownerEvidenceConflictDetectionStyle";
  const REFRESH_MS=60000;
  const ASSESSMENTS=Object.freeze({
    continue_supported:"Continue evidence met",
    stop_or_revise_supported:"Stop / revise evidence met",
    mixed:"Mixed evidence",
    inconclusive:"Inconclusive"
  });
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
  function normalizeQuestion(value){return clean(value,280).toLowerCase().replace(/[^a-z0-9]+/g," ").trim()}
  function sourceIdentity(record){return clean(record?.value?.sourceKey,300)}
  function questionIdentity(record){return normalizeQuestion(record?.value?.experimentQuestion)}
  function recordedAt(record){
    const stamp=Date.parse(String(record?.value?.recordedAt||record?.updatedAt||record?.createdAt||""));
    return Number.isFinite(stamp)?stamp:0;
  }
  function resultRows(payload){
    const items=Array.isArray(payload?.items)?payload.items:[];
    return items.filter(row=>row?.namespace==="operations"&&row?.value?.kind==="owner_experiment_result");
  }
  function peersFor(record){
    const source=sourceIdentity(record);
    const question=questionIdentity(record);
    return rows.filter(candidate=>{
      if(candidate===record)return false;
      const sameSource=source&&sourceIdentity(candidate)===source;
      const sameQuestion=question&&questionIdentity(candidate)===question;
      return Boolean(sameSource||sameQuestion);
    }).sort((a,b)=>recordedAt(b)-recordedAt(a));
  }
  function qualityProfile(record){
    try{
      const profile=global.ThebeOwnerEvidenceQualityScoring?.qualityProfile?.(record);
      if(profile)return profile;
    }catch{}
    return Object.freeze({
      sourceQuality:"Unknown",
      recency:"Unknown",
      completeness:"Unknown",
      independence:"Unknown",
      timing:"Unknown",
      authoritative:false,
      authority:"context_only_no_execution"
    });
  }

  function installStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement("style");
    style.id=STYLE_ID;
    const nonce=document.querySelector("style[nonce],script[nonce]")?.nonce;
    if(nonce)style.nonce=nonce;
    style.textContent=`
#${SECTION_ID}{margin:10px 0 16px;padding:12px;border:1px solid var(--line,#e3e6e8);border-radius:15px;background:var(--card,#fff);min-width:0}
#${SECTION_ID} .conflict-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#${SECTION_ID} .conflict-head h4{margin:2px 0 0;font-size:14px;line-height:1.25}
#${SECTION_ID} .conflict-meta{margin-top:3px;font-size:10px;line-height:1.4;color:var(--muted,#6b7176)}
#${SECTION_ID} .conflict-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}
#${SECTION_ID} .conflict-card{min-width:0;border:1px solid var(--line,#e3e6e8);border-radius:12px;padding:10px;background:var(--card,#fff)}
#${SECTION_ID} .conflict-card h5{margin:0;font-size:11px;line-height:1.35;overflow-wrap:anywhere}
#${SECTION_ID} .conflict-card p{margin:5px 0 0;font-size:9px;line-height:1.4;color:var(--muted,#6b7176);overflow-wrap:anywhere}
#${SECTION_ID} .conflict-badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}
#${SECTION_ID} .conflict-badge{display:inline-flex;padding:3px 7px;border:1px solid var(--line,#e3e6e8);border-radius:999px;font-size:9px;font-weight:850}
#${SECTION_ID} .conflict-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
#${SECTION_ID} .conflict-actions button{min-height:34px;padding:6px 9px;border-radius:9px;font-size:9px;font-weight:850}
#${SECTION_ID} .conflict-note,#${SECTION_ID} .conflict-empty,#${SECTION_ID} .conflict-error{margin-top:8px;font-size:9px;line-height:1.45;color:var(--muted,#6b7176)}
#${SECTION_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #8f1d16}
@media(max-width:720px){#${SECTION_ID} .conflict-list{grid-template-columns:1fr}}
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
    section.setAttribute("aria-label","Evidence conflict detection");
    section.setAttribute("aria-live","polite");
    const quality=q("#ownerEvidenceQualityScoring",centre);
    const result=q("#ownerExperimentResultReview",centre);
    if(quality)quality.insertAdjacentElement("afterend",section);
    else if(result)result.insertAdjacentElement("afterend",section);
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

  function peerText(peer,index){
    const value=peer?.value||{};
    const quality=qualityProfile(peer);
    return `Comparison evidence ${index+1}: observed evidence: ${clean(value.observedEvidence,500)||"not recorded"}; source/reference: ${clean(value.evidenceSource,180)||"not recorded"}; observation period: ${clean(value.observationPeriod,140)||"not recorded"}; owner assessment: ${ASSESSMENTS[value.resultAssessment]||"Inconclusive"}; evidence-quality context: source=${clean(quality.sourceQuality,120)||"Unknown"}, recency=${clean(quality.recency,120)||"Unknown"}, completeness=${clean(quality.completeness,80)||"Unknown"}, independence=${clean(quality.independence,120)||"Unknown"}, timing=${clean(quality.timing,120)||"Unknown"}.`;
  }
  function conflictPrompt(record){
    const value=record?.value||{};
    const quality=qualityProfile(record);
    const peers=peersFor(record).slice(0,4);
    const comparisons=peers.length?peers.map(peerText).join(" "):"No other saved owner-confirmed experiment result shares this exact source identity or normalized experiment question. Compare only against current verified business context where suitable evidence exists.";
    return `Review this owner-confirmed experiment evidence for MATERIAL EVIDENCE CONFLICTS before the owner relies on it. Use current verified business evidence first. Decision: “${clean(value.title,220)||"Owner decision"}”. Experiment question: ${clean(value.experimentQuestion,280)||"not recorded"}. Primary observed evidence: ${clean(value.observedEvidence,700)||"not recorded"}. Primary source/reference: ${clean(value.evidenceSource,220)||"not recorded"}. Primary observation period: ${clean(value.observationPeriod,160)||"not recorded"}. Primary owner assessment: ${ASSESSMENTS[value.resultAssessment]||"Inconclusive"}. Primary evidence-quality context: source=${clean(quality.sourceQuality,120)||"Unknown"}, recency=${clean(quality.recency,120)||"Unknown"}, completeness=${clean(quality.completeness,80)||"Unknown"}, independence=${clean(quality.independence,120)||"Unknown"}, timing=${clean(quality.timing,120)||"Unknown"}. ${comparisons} For each comparable evidence claim, classify the relationship only as: corroborates, materially conflicts, scope/time difference, not comparable, or Unknown. A material conflict requires comparable claims that genuinely disagree. Do not call evidence contradictory merely because owner assessments differ. Do not manufacture false balance. Before declaring a conflict, normalize or explicitly compare the metric/definition, population or entity scope, sample, aggregation level, currency/unit where relevant, and observation period. Different periods, scopes, definitions, populations, samples, or aggregation levels should be classified as scope/time difference or not comparable unless verified evidence shows they address the same claim on a comparable basis. Do not infer underlying evidence recency from recordedAt or review timestamps. Use Evidence Quality Scoring only as non-authoritative context and preserve every Unknown; do not convert Unknown into a score. Do not choose a winner solely because a record is newer, has more text, or has a stronger owner assessment. If one item deserves more decision weight, state the verified reason such as provenance, comparability, completeness, independence, or decision relevance; otherwise say the conflict is unresolved. If no verified counterevidence exists, say clearly that no material conflict is currently verified. Separate observed evidence, owner interpretation, assumptions, and unknowns. Identify the exact additional evidence needed to resolve each unresolved conflict, including metric, source/provenance, scope/population, and observation period. Do not create a numeric confidence or probability. Do not infer causation from correlation. Do not alter the experiment assessment, evidence-quality label, decision outcome rating, canonical queue, approval state, or any business record. Do not execute, approve, pay, file, send, contact, or schedule anything.`;
  }
  function detectConflicts(record){
    if(!isOwner()||!record)return false;
    return setDockPrompt(conflictPrompt(record));
  }

  function card(record){
    const value=record?.value||{};
    const peers=peersFor(record);
    const quality=qualityProfile(record);
    const article=node("article",undefined,"conflict-card");
    article.append(node("h5",clean(value.title,220)||"Owner experiment result"));
    article.append(node("p",`Observed: ${clean(value.observedEvidence,220)||"No observation recorded"}`));
    const badges=node("div",undefined,"conflict-badges");
    badges.append(node("span",`${peers.length} saved comparable record${peers.length===1?"":"s"}`,"conflict-badge"));
    badges.append(node("span",`Completeness: ${clean(quality.completeness,60)||"Unknown"}`,"conflict-badge"));
    badges.append(node("span","Conflict status: not inferred","conflict-badge"));
    article.append(badges);
    const actions=node("div",undefined,"conflict-actions");
    actions.append(button("Check conflicts",()=>detectConflicts(record),"btn alt"));
    article.append(actions);
    return article;
  }

  function render(){
    const section=ensureSection();
    if(!section)return;
    section.replaceChildren();
    const head=node("div",undefined,"conflict-head");
    const copy=node("div");
    copy.append(node("div","Evidence conflict detection","section-eyebrow"),node("h4","Find contradictions without creating false balance"),node("div","Conflict is never inferred from opposite assessments alone. Scope, metric, population and observation period must be comparable first.","conflict-meta"));
    head.append(copy);section.append(head);
    if(!rows.length){
      section.append(node("div","No owner-confirmed experiment evidence is available for conflict review yet.","conflict-empty"));
      return;
    }
    const sorted=rows.slice().sort((a,b)=>recordedAt(b)-recordedAt(a));
    const list=node("div",undefined,"conflict-list");
    sorted.slice(0,4).forEach(record=>list.append(card(record)));
    section.append(list);
    if(sorted.length>4)section.append(node("div",`${sorted.length-4} more owner-confirmed experiment results are available in Business Memory.`,"conflict-empty"));
    section.append(node("div","Read-only advisory review. V340 does not automatically pick a winner, change evidence quality, alter a decision, reprioritize Owner Attention, or grant approval/execution authority.","conflict-note"));
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
      if(section)section.replaceChildren(node("div","Evidence Conflict Detection is temporarily unavailable. No business state was changed.","conflict-error"));
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

  global.ThebeOwnerEvidenceConflictDetection=Object.freeze({
    release:RELEASE,
    refresh,
    detectConflicts,
    peersFor,
    conflictPrompt
  });
})(window);