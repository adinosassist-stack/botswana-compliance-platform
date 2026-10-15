(function installOwnerDecisionEvidenceReadinessV342(global){
  "use strict";

  const RELEASE="20261015-owner-decision-evidence-readiness-v342";
  const SECTION_ID="ownerDecisionEvidenceReadiness";
  const STYLE_ID="ownerDecisionEvidenceReadinessStyle";
  const REFRESH_MS=60000;
  const STATES=Object.freeze([
    "Ready for review",
    "Needs evidence",
    "Material conflict unresolved",
    "Unknown"
  ]);
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
  function qualityProfile(record){
    try{return global.ThebeOwnerEvidenceQualityScoring?.qualityProfile?.(record)||null}
    catch{return null}
  }
  function peersFor(record){
    try{return global.ThebeOwnerEvidenceConflictDetection?.peersFor?.(record)||[]}
    catch{return []}
  }
  function resolutionSpec(record){
    try{return global.ThebeOwnerEvidenceResolutionPlan?.resolutionSpec?.(record)||null}
    catch{return null}
  }
  function presence(value){return Boolean(clean(value,10_000))}

  function localReadiness(record){
    const value=record?.value||{};
    const profile=qualityProfile(record)||{};
    const missing=[];
    if(!presence(value.observedEvidence))missing.push("observed evidence");
    if(!presence(value.evidenceSource))missing.push("source / provenance reference");
    if(!presence(value.observationPeriod))missing.push("observation period");
    if(!(value.criteriaPredatedTest===true&&presence(value.continueCriterion)&&presence(value.stopCriterion)))missing.push("pre-defined continue / stop criteria");
    if(missing.length){
      return Object.freeze({
        state:"Needs evidence",
        reason:`Recorded evidence is missing ${missing.join(", ")}.`,
        missing:Object.freeze(missing.slice()),
        authoritative:false,
        authority:"context_only_no_execution"
      });
    }
    return Object.freeze({
      state:"Unknown",
      reason:`Recorded fields are complete enough for assessment, but readiness is not inferred from completeness${profile.completeness?` (${clean(profile.completeness,40)})`:""}, peer count, or owner assessment.`,
      missing:Object.freeze([]),
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
#${SECTION_ID} .readiness-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#${SECTION_ID} .readiness-head h4{margin:2px 0 0;font-size:14px;line-height:1.25}
#${SECTION_ID} .readiness-meta{margin-top:3px;font-size:10px;line-height:1.4;color:var(--muted,#6b7176)}
#${SECTION_ID} .readiness-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}
#${SECTION_ID} .readiness-card{min-width:0;border:1px solid var(--line,#e3e6e8);border-radius:12px;padding:10px;background:var(--card,#fff)}
#${SECTION_ID} .readiness-card h5{margin:0;font-size:11px;line-height:1.35;overflow-wrap:anywhere}
#${SECTION_ID} .readiness-card p{margin:5px 0 0;font-size:9px;line-height:1.4;color:var(--muted,#6b7176);overflow-wrap:anywhere}
#${SECTION_ID} .readiness-badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}
#${SECTION_ID} .readiness-badge{display:inline-flex;padding:3px 7px;border:1px solid var(--line,#e3e6e8);border-radius:999px;font-size:9px;font-weight:850}
#${SECTION_ID} .readiness-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
#${SECTION_ID} .readiness-actions button{min-height:34px;padding:6px 9px;border-radius:9px;font-size:9px;font-weight:850}
#${SECTION_ID} .readiness-note,#${SECTION_ID} .readiness-empty,#${SECTION_ID} .readiness-error{margin-top:8px;font-size:9px;line-height:1.45;color:var(--muted,#6b7176)}
#${SECTION_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #8f1d16}
@media(max-width:720px){#${SECTION_ID} .readiness-list{grid-template-columns:1fr}}
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
    section.setAttribute("aria-label","Decision evidence readiness");
    section.setAttribute("aria-live","polite");
    const resolution=q("#ownerEvidenceResolutionPlan",centre);
    const conflict=q("#ownerEvidenceConflictDetection",centre);
    if(resolution)resolution.insertAdjacentElement("afterend",section);
    else if(conflict)conflict.insertAdjacentElement("afterend",section);
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
    return `Saved comparison ${index+1}: observation=${clean(value.observedEvidence,360)||"not recorded"}; source=${clean(value.evidenceSource,160)||"not recorded"}; period=${clean(value.observationPeriod,120)||"not recorded"}; question=${clean(value.experimentQuestion,180)||"not recorded"}.`;
  }
  function readinessSpec(record){
    const value=record?.value||{};
    const quality=qualityProfile(record)||{};
    const peers=peersFor(record).slice(0,4);
    const resolution=resolutionSpec(record)||{};
    const local=localReadiness(record);
    return Object.freeze({
      title:clean(value.title,220)||"Owner experiment result",
      experimentQuestion:clean(value.experimentQuestion,280),
      observedEvidence:clean(value.observedEvidence,700),
      evidenceSource:clean(value.evidenceSource,220),
      observationPeriod:clean(value.observationPeriod,160),
      criteriaPredatedTest:value.criteriaPredatedTest===true,
      ownerAssessment:clean(value.resultAssessment,80)||"inconclusive",
      localState:local.state,
      localReason:local.reason,
      evidenceQuality:Object.freeze({
        sourceQuality:clean(quality.sourceQuality,120)||"Unknown",
        recency:clean(quality.recency,120)||"Unknown",
        completeness:clean(quality.completeness,80)||"Unknown",
        independence:clean(quality.independence,120)||"Unknown",
        timing:clean(quality.timing,120)||"Unknown"
      }),
      comparableSavedEvidence:Object.freeze(peers.map((peer,index)=>peerEvidence(peer,index))),
      resolutionContextAvailable:Boolean(resolution&&Object.keys(resolution).length),
      authoritative:false,
      authority:"context_only_no_execution"
    });
  }

  function readinessPrompt(record){
    const spec=readinessSpec(record);
    const comparisons=spec.comparableSavedEvidence.length?spec.comparableSavedEvidence.join(" "):"No saved peer evidence shares the same source identity or normalized experiment question.";
    return `Assess DECISION EVIDENCE READINESS for owner review. Return exactly one readiness state from: Ready for review; Needs evidence; Material conflict unresolved; Unknown. This is readiness for HUMAN REVIEW only, not approval, correctness, safety, or permission to execute. Use current verified business context first. Decision/evidence title: “${spec.title}”. Experiment question: ${spec.experimentQuestion||"not recorded"}. Observed evidence: ${spec.observedEvidence||"not recorded"}. Source/reference: ${spec.evidenceSource||"not recorded"}. Observation period: ${spec.observationPeriod||"not recorded"}. Pre-defined criteria confirmed before result review: ${spec.criteriaPredatedTest?"yes":"no"}. Owner assessment: ${spec.ownerAssessment}. Deterministic local readiness is ${spec.localState}: ${spec.localReason} Evidence-quality context is non-authoritative: source=${spec.evidenceQuality.sourceQuality}, recency=${spec.evidenceQuality.recency}, completeness=${spec.evidenceQuality.completeness}, independence=${spec.evidenceQuality.independence}, timing=${spec.evidenceQuality.timing}. ${comparisons} Apply this precedence: (1) Material conflict unresolved only when current verified evidence establishes a genuine V340 material conflict between comparable claims AND the evidence needed to resolve it is still outstanding; peer count or opposite owner assessments alone never qualify. A V341 resolution plan existing or being possible does not mean the conflict is resolved. (2) Needs evidence when a known evidence gap could materially affect owner review and no higher-precedence unresolved material conflict is verified. (3) Ready for review only when the available verified evidence is sufficient for a human owner to review the decision, there is no verified unresolved material conflict, and material evidence gaps are not known to block meaningful review. Ready for review does NOT mean approve, proceed, correct, safe, low-risk, or authorized. (4) Unknown when verified context is insufficient to establish any other state. Strong field completeness alone does not make evidence ready. A newer record, more text, a stronger owner assessment, or a higher peer count does not make evidence ready. Preserve every V339 Unknown and do not manufacture a numeric confidence score. Re-apply V340 comparability before treating claims as conflicting. Re-apply V341's minimal-resolution principle when evidence is missing. After the state, give: verified reasons; material unknowns; any exact evidence gap that prevents readiness; and the safest reversible manual next step. Do not persist the readiness state. Do not change evidence quality, conflict classification, resolution status, experiment assessment, decision outcome, canonical queue, approval state, or any business record. Do not collect data, browse external systems, request files, contact people, create tasks, schedule work, launch experiments, execute, approve, pay, file, or send anything.`;
  }
  function assessReadiness(record){
    if(!isOwner()||!record)return false;
    return setDockPrompt(readinessPrompt(record));
  }

  function card(record){
    const spec=readinessSpec(record);
    const article=node("article",undefined,"readiness-card");
    article.append(node("h5",spec.title));
    article.append(node("p",`Question: ${spec.experimentQuestion||"Not recorded"}`));
    const badges=node("div",undefined,"readiness-badges");
    badges.append(node("span",`Local state: ${spec.localState}`,"readiness-badge"));
    badges.append(node("span",`${spec.comparableSavedEvidence.length} comparable saved record${spec.comparableSavedEvidence.length===1?"":"s"}`,"readiness-badge"));
    badges.append(node("span","Final readiness: not inferred","readiness-badge"));
    article.append(badges,node("p",spec.localReason));
    const actions=node("div",undefined,"readiness-actions");
    actions.append(button("Assess readiness",()=>assessReadiness(record),"btn alt"));
    article.append(actions);
    return article;
  }

  function render(){
    const section=ensureSection();
    if(!section)return;
    section.replaceChildren();
    const head=node("div",undefined,"readiness-head");
    const copy=node("div");
    copy.append(node("div","Decision evidence readiness","section-eyebrow"),node("h4","Know whether the evidence is ready for owner review"),node("div",`${STATES.join(" · ")}. Readiness is advisory and never means approval or permission to act.`,"readiness-meta"));
    head.append(copy);section.append(head);
    if(!rows.length){
      section.append(node("div","No owner-confirmed experiment evidence is available for readiness assessment yet.","readiness-empty"));
      return;
    }
    const sorted=rows.slice().sort((a,b)=>recordedAt(b)-recordedAt(a));
    const list=node("div",undefined,"readiness-list");
    sorted.slice(0,4).forEach(record=>list.append(card(record)));
    section.append(list);
    if(sorted.length>4)section.append(node("div",`${sorted.length-4} more owner-confirmed experiment results are available in Business Memory.`,"readiness-empty"));
    section.append(node("div","V342 never infers a material conflict from peer count and never infers Ready for review from completeness alone. Final readiness is generated only through a governed review of current verified context and is not persisted.","readiness-note"));
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
      if(section)section.replaceChildren(node("div","Decision Evidence Readiness is temporarily unavailable. No business state was changed.","readiness-error"));
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

  global.ThebeOwnerDecisionEvidenceReadiness=Object.freeze({
    release:RELEASE,
    states:STATES,
    refresh,
    assessReadiness,
    localReadiness,
    readinessSpec,
    readinessPrompt
  });
})(window);