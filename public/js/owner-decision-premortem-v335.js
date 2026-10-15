(function installOwnerDecisionPremortemV335(global){
  "use strict";

  const RELEASE="20261015-owner-decision-premortem-v335";
  const SECTION_ID="ownerDecisionPremortem";
  const STYLE_ID="ownerDecisionPremortemStyle";
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
  function challengeSpec(item){
    const fallback=Object.freeze({
      title:clean(item?.title||item?.label||item?.name||"Owner decision",220),
      sourceType:clean(item?.sourceType||item?.kind||"owner_attention",80)||"owner_attention",
      currentSummary:clean(item?.summary||item?.detail||item?.description||item?.reason||"",600),
      currentStatus:clean(item?.status||item?.truthState||item?.severity||item?.priority||"",80),
      historicalAdjustment:"uncalibrated",
      historicalDirectionalSample:0,
      historicalEvidenceLevel:"insufficient",
      authoritative:false,
      authority:"context_only_no_execution"
    });
    try{return global.ThebeOwnerRecommendationChallengeMode?.challengeSpec?.(item)||fallback}
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
#${SECTION_ID} .premortem-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#${SECTION_ID} .premortem-head h4{margin:2px 0 0;font-size:14px;line-height:1.25}
#${SECTION_ID} .premortem-meta{margin-top:3px;font-size:10px;line-height:1.4;color:var(--muted,#6b7176)}
#${SECTION_ID} .premortem-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
#${SECTION_ID} .premortem-card{min-width:0;border:1px solid var(--line,#e3e6e8);border-radius:12px;padding:10px;background:var(--card,#fff)}
#${SECTION_ID} .premortem-card h5{margin:0;font-size:11px;line-height:1.35;overflow-wrap:anywhere}
#${SECTION_ID} .premortem-card p{margin:5px 0 0;font-size:9px;line-height:1.4;color:var(--muted,#6b7176);overflow-wrap:anywhere}
#${SECTION_ID} .premortem-badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}
#${SECTION_ID} .premortem-badge{display:inline-flex;padding:3px 7px;border:1px solid var(--line,#e3e6e8);border-radius:999px;font-size:9px;font-weight:850}
#${SECTION_ID} .premortem-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
#${SECTION_ID} .premortem-actions button{min-height:34px;padding:6px 9px;border-radius:9px;font-size:9px;font-weight:850}
#${SECTION_ID} .premortem-note,#${SECTION_ID} .premortem-empty,#${SECTION_ID} .premortem-unavailable{margin-top:8px;font-size:9px;line-height:1.45;color:var(--muted,#6b7176)}
#${SECTION_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #8f1d16}
@media(max-width:980px){#${SECTION_ID} .premortem-list{grid-template-columns:1fr 1fr}}
@media(max-width:680px){#${SECTION_ID} .premortem-list{grid-template-columns:1fr}}
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
    section.setAttribute("aria-label","Decision pre-mortem");
    section.setAttribute("aria-live","polite");
    const challenge=q("#ownerRecommendationChallengeMode",centre);
    const calibration=q("#ownerDecisionRecommendationCalibration",centre);
    if(challenge)challenge.insertAdjacentElement("afterend",section);
    else if(calibration)calibration.insertAdjacentElement("afterend",section);
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

  function premortemSpec(item){
    const challenge=challengeSpec(item);
    return Object.freeze({
      title:challenge.title,
      sourceType:challenge.sourceType,
      currentSummary:challenge.currentSummary,
      currentStatus:challenge.currentStatus,
      historicalAdjustment:challenge.historicalAdjustment,
      historicalDirectionalSample:Number(challenge.historicalDirectionalSample||0),
      historicalEvidenceLevel:challenge.historicalEvidenceLevel||"insufficient",
      horizon:"six_months",
      authoritative:false,
      authority:"context_only_no_execution"
    });
  }

  function premortemPrompt(item){
    const spec=premortemSpec(item);
    return `Run a pre-mortem for “${spec.title}” using current verified business context first. Assume that six months after the owner chose this path, the decision failed materially or produced a clearly disappointing result. Current canonical summary: ${spec.currentSummary||"No additional canonical summary is available"}. Current status: ${spec.currentStatus||"Not specified"}. Historical calibration: ${spec.historicalAdjustment}; ${spec.historicalDirectionalSample} directional owner-rated outcomes; evidence level ${spec.historicalEvidenceLevel}. Identify: (1) the most plausible failure modes, clearly labelled as hypotheses unless already evidenced, (2) current verified evidence that makes each failure mode more or less plausible, (3) early warning signals the owner could observe before damage becomes material, (4) safeguards or reversible tests that reduce exposure, (5) explicit exit triggers or stop conditions, (6) any irreversible commitments that deserve extra scrutiny, and (7) the smallest reversible next step. Do not invent probabilities, forecasts, evidence, or thresholds that are not supported. If a useful threshold is unavailable, state what measurement would be needed. Current verified evidence must override contradictory historical patterns. Historical outcomes are descriptive, not causal proof. This is a planning exercise only. Do not execute anything, approve anything, pay anything, file anything, send anything, or change any business record.`;
  }
  function runPremortem(item){
    if(!isOwner())return false;
    return setDockPrompt(premortemPrompt(item));
  }

  function decisionItems(snapshot){
    const items=Array.isArray(snapshot?.items)?snapshot.items:[];
    return items.filter(item=>classify(item)==="decision");
  }
  function itemCard(item){
    const spec=premortemSpec(item);
    const card=node("article",undefined,"premortem-card");
    card.append(node("h5",spec.title));
    if(spec.currentSummary)card.append(node("p",spec.currentSummary.slice(0,180)));
    const badges=node("div",undefined,"premortem-badges");
    badges.append(node("span","6-month failure lens","premortem-badge"));
    badges.append(node("span",spec.historicalDirectionalSample?`${spec.historicalDirectionalSample} historical outcomes":"History not calibrated","premortem-badge"));
    card.append(badges);
    const controls=node("div",undefined,"premortem-actions");
    controls.append(button("Run pre-mortem",()=>runPremortem(item),"btn alt"));
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

    const head=node("div",undefined,"premortem-head");
    const copy=node("div");
    copy.append(node("div","Decision pre-mortem","section-eyebrow"),node("h4","Assume the decision failed before committing"),node("div","Stress-test verified owner decisions for plausible failure modes, early warning signals, safeguards, and exit triggers before exposure grows.","premortem-meta"));
    head.append(copy);
    section.append(head);

    if(state!=="ready"){
      section.append(node("div","Canonical decision data is not verified, so Pre-Mortem will not form a failure analysis.","premortem-unavailable"));
      return;
    }
    const decisions=decisionItems(snapshot);
    if(!decisions.length){
      section.append(node("div","No verified owner decision is currently waiting for a pre-mortem.","premortem-empty"));
      return;
    }
    const list=node("div",undefined,"premortem-list");
    decisions.slice(0,3).forEach(item=>list.append(itemCard(item)));
    section.append(list);
    if(decisions.length>3)section.append(node("div",`${decisions.length-3} more verified owner decisions are available in the canonical queue.`,"premortem-empty"));
    section.append(node("div","Pre-Mortem is advisory and read-only. Failure modes are hypotheses unless supported by current evidence. It does not alter canonical business truth, create an approval, or grant execution authority.","premortem-note"));
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    global.setTimeout(render,130);
  }
  function boot(){
    schedule();
    [750,2000].forEach(delay=>global.setTimeout(schedule,delay));
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

  global.ThebeOwnerDecisionPremortem=Object.freeze({
    release:RELEASE,
    refresh:schedule,
    runPremortem,
    premortemSpec
  });
})(window);