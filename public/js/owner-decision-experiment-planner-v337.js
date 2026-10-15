(function installOwnerDecisionExperimentPlannerV337(global){
  "use strict";

  const RELEASE="20261015-owner-decision-experiment-planner-v337";
  const SECTION_ID="ownerDecisionExperimentPlanner";
  const STYLE_ID="ownerDecisionExperimentPlannerStyle";
  const REFRESH_MS=60000;
  const q=(selector,root=document)=>root.querySelector(selector);
  let scheduled=false;

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
  function canonicalSnapshot(){
    try{return global.ThebeOwnerFocusStrip?.canonicalSnapshot?.()||null}
    catch{return null}
  }
  function classify(item){
    try{return global.ThebeOwnerFirstHome?.classify?.(item)||""}
    catch{return ""}
  }
  function safeguardSpec(item){
    const fallback=Object.freeze({
      title:clean(item?.title||item?.label||item?.name||"Owner decision",220),
      sourceType:clean(item?.sourceType||item?.kind||"owner_attention",80)||"owner_attention",
      currentSummary:clean(item?.summary||item?.detail||item?.description||item?.reason||"",600),
      currentStatus:clean(item?.status||item?.truthState||item?.severity||item?.priority||"",80),
      exposureSignals:Object.freeze([]),
      exposureSignalCount:0,
      authoritative:false,
      authority:"context_only_no_execution"
    });
    try{return global.ThebeOwnerDecisionSafeguardGate?.safeguardSpec?.(item)||fallback}
    catch{return fallback}
  }

  function installStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement("style");
    style.id=STYLE_ID;
    const nonce=document.querySelector("style[nonce],script[nonce]")?.nonce;
    if(nonce)style.nonce=nonce;
    style.textContent=`
#${SECTION_ID}{margin:10px 0 16px;padding:12px;border:1px solid var(--line,#e3e6e8);border-radius:15px;background:var(--card,#fff);min-width:0}
#${SECTION_ID} .experiment-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#${SECTION_ID} .experiment-head h4{margin:2px 0 0;font-size:14px;line-height:1.25}
#${SECTION_ID} .experiment-meta{margin-top:3px;font-size:10px;line-height:1.4;color:var(--muted,#6b7176)}
#${SECTION_ID} .experiment-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
#${SECTION_ID} .experiment-card{min-width:0;border:1px solid var(--line,#e3e6e8);border-radius:12px;padding:10px;background:var(--card,#fff)}
#${SECTION_ID} .experiment-card h5{margin:0;font-size:11px;line-height:1.35;overflow-wrap:anywhere}
#${SECTION_ID} .experiment-card p{margin:5px 0 0;font-size:9px;line-height:1.4;color:var(--muted,#6b7176);overflow-wrap:anywhere}
#${SECTION_ID} .experiment-badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}
#${SECTION_ID} .experiment-badge{display:inline-flex;padding:3px 7px;border:1px solid var(--line,#e3e6e8);border-radius:999px;font-size:9px;font-weight:850}
#${SECTION_ID} .experiment-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
#${SECTION_ID} .experiment-actions button{min-height:34px;padding:6px 9px;border-radius:9px;font-size:9px;font-weight:850}
#${SECTION_ID} .experiment-note,#${SECTION_ID} .experiment-empty,#${SECTION_ID} .experiment-unavailable{margin-top:8px;font-size:9px;line-height:1.45;color:var(--muted,#6b7176)}
#${SECTION_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #8f1d16}
@media(max-width:980px){#${SECTION_ID} .experiment-list{grid-template-columns:1fr 1fr}}
@media(max-width:680px){#${SECTION_ID} .experiment-list{grid-template-columns:1fr}}
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
    section.setAttribute("aria-label","Decision experiment planner");
    section.setAttribute("aria-live","polite");
    const safeguard=q("#ownerDecisionSafeguardGate",centre);
    const premortem=q("#ownerDecisionPremortem",centre);
    if(safeguard)safeguard.insertAdjacentElement("afterend",section);
    else if(premortem)premortem.insertAdjacentElement("afterend",section);
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

  function experimentSpec(item){
    const safeguard=safeguardSpec(item);
    return Object.freeze({
      title:safeguard.title,
      sourceType:safeguard.sourceType,
      currentSummary:safeguard.currentSummary,
      currentStatus:safeguard.currentStatus,
      exposureSignals:Object.freeze(Array.isArray(safeguard.exposureSignals)?safeguard.exposureSignals.slice(0,4):[]),
      exposureSignalCount:Number(safeguard.exposureSignalCount||0),
      authoritative:false,
      authority:"context_only_no_execution"
    });
  }

  function experimentPrompt(item){
    const spec=experimentSpec(item);
    const signals=spec.exposureSignals.length?spec.exposureSignals.join("; "):"No additional deterministic exposure signal beyond being a verified owner decision";
    return `Plan the smallest reversible decision experiment for “${spec.title}” using current verified business context first. Current canonical summary: ${spec.currentSummary||"No additional canonical summary is available"}. Current status: ${spec.currentStatus||"Not specified"}. Deterministic presentation signals: ${signals}. First identify the single most decision-relevant Unknown, Missing, or Partial safeguard that a reversible experiment could genuinely reduce. Do not invent a gap merely to create an experiment. If the important unknown cannot be resolved safely through a bounded reversible test, say clearly that no experiment is warranted and state what evidence or owner decision is needed instead. If an experiment is warranted, specify: (1) the decision question / hypothesis, clearly labelled as a hypothesis rather than fact, (2) the smallest reversible test that changes as little business state as possible, (3) the exact metric or observation to collect and its verified source when available, (4) the shortest observation window justified by the business cycle or existing evidence, (5) what evidence would support continuing, (6) what evidence would support stopping or revising, (7) the maximum exposure or downside cap only where a verified limit exists; otherwise state “owner-defined cap required”, (8) an early stop condition, (9) the accountable human owner / reviewer, and (10) how the result would update the recommendation. Do not invent numeric thresholds, budgets, probabilities, sample sizes, or time windows without a verified basis. If a candidate threshold or window would be useful but lacks a verified basis, label it as an owner decision required rather than presenting it as fact. Keep irreversible commitments outside the experiment. This is a planning exercise only. Do not launch the experiment, approve anything, pay anything, file anything, send anything, contact anyone, schedule anything, or change any business record.`;
  }
  function planExperiment(item){
    if(!isOwner())return false;
    return setDockPrompt(experimentPrompt(item));
  }

  function decisionItems(snapshot){
    const items=Array.isArray(snapshot?.items)?snapshot.items:[];
    return items.filter(item=>classify(item)==="decision");
  }
  function itemCard(item){
    const spec=experimentSpec(item);
    const card=node("article",undefined,"experiment-card");
    card.append(node("h5",spec.title));
    if(spec.currentSummary)card.append(node("p",spec.currentSummary.slice(0,180)));
    const badges=node("div",undefined,"experiment-badges");
    badges.append(node("span","Smallest reversible test","experiment-badge"));
    badges.append(node("span",spec.exposureSignalCount?`${spec.exposureSignalCount} presentation signal${spec.exposureSignalCount===1?"":"s"}`:"No extra exposure signal","experiment-badge"));
    card.append(badges);
    const controls=node("div",undefined,"experiment-actions");
    controls.append(button("Plan experiment",()=>planExperiment(item),"btn alt"));
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

    const head=node("div",undefined,"experiment-head");
    const copy=node("div");
    copy.append(node("div","Decision experiment planner","section-eyebrow"),node("h4","Resolve the biggest unknown with the smallest test"),node("div","Plan a bounded reversible experiment only when verified decision uncertainty can actually be reduced. Thebe never launches the experiment itself.","experiment-meta"));
    head.append(copy);
    section.append(head);

    if(state!=="ready"){
      section.append(node("div","Canonical decision data is not verified, so the Experiment Planner will not infer an unknown or propose a test.","experiment-unavailable"));
      return;
    }
    const decisions=decisionItems(snapshot);
    if(!decisions.length){
      section.append(node("div","No verified owner decision is currently waiting for an experiment plan.","experiment-empty"));
      return;
    }
    const sorted=decisions.slice().sort((a,b)=>Number(safeguardSpec(b).exposureSignalCount||0)-Number(safeguardSpec(a).exposureSignalCount||0));
    const list=node("div",undefined,"experiment-list");
    sorted.slice(0,3).forEach(item=>list.append(itemCard(item)));
    section.append(list);
    if(sorted.length>3)section.append(node("div",`${sorted.length-3} more verified owner decisions are available in the canonical queue.`,"experiment-empty"));
    section.append(node("div","Experiment Planner is advisory and read-only. It may propose a plan, but it cannot create, schedule, launch, approve, fund, or execute an experiment. Unsupported thresholds remain owner decisions, not inferred facts.","experiment-note"));
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    global.setTimeout(render,150);
  }
  function boot(){
    schedule();
    [850,2200].forEach(delay=>global.setTimeout(schedule,delay));
    global.setInterval(schedule,REFRESH_MS);
    const root=q("#homeDecisionCenter")||document.body;
    new MutationObserver(schedule).observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:["class","hidden","data-state","data-release","data-canonical-version"]});
    global.addEventListener?.("thebe:auth:state",schedule);
    global.addEventListener?.("thebe:identity:ready",schedule);
    global.addEventListener?.("thebe:workspace:view",schedule);
    document.addEventListener("change",event=>{if(event.target?.id==="companySelect")global.setTimeout(schedule,550)});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();

  global.ThebeOwnerDecisionExperimentPlanner=Object.freeze({
    release:RELEASE,
    refresh:schedule,
    planExperiment,
    experimentSpec
  });
})(window);