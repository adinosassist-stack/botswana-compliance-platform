(function installOwnerRecommendationChallengeModeV334(global){
  "use strict";

  const RELEASE="20261015-owner-recommendation-challenge-mode-v334";
  const SECTION_ID="ownerRecommendationChallengeMode";
  const STYLE_ID="ownerRecommendationChallengeModeStyle";
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
  function sourceType(item){return clean(item?.sourceType||item?.kind||"owner_attention",80)||"owner_attention"}
  function friendlyType(value){
    const text=clean(value,80).replace(/[_-]+/g," ");
    return text?text.replace(/\b\w/g,char=>char.toUpperCase()):"Owner decision";
  }
  function calibrationFor(item){
    const fallback=Object.freeze({sourceType:sourceType(item),rated:0,directional:0,better:0,mixed:0,worse:0,insufficient:0,adjustment:"uncalibrated",evidenceLevel:"insufficient",authoritative:false,authority:"context_only_no_execution"});
    try{return global.ThebeOwnerDecisionRecommendationCalibration?.getCalibration?.(sourceType(item))||fallback}
    catch{return fallback}
  }
  function calibrationLabel(calibration){
    if(calibration.adjustment==="slightly_supportive")return "History: slightly supportive";
    if(calibration.adjustment==="more_cautious")return "History: caution";
    if(calibration.adjustment==="neutral_mixed")return "History: mixed / neutral";
    return "History: not calibrated";
  }

  function installStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement("style");
    style.id=STYLE_ID;
    const nonce=document.querySelector("style[nonce],script[nonce]")?.nonce;
    if(nonce)style.nonce=nonce;
    style.textContent=`
#${SECTION_ID}{margin:10px 0 16px;padding:12px;border:1px solid var(--line,#e3e6e8);border-radius:15px;background:var(--card,#fff);min-width:0}
#${SECTION_ID} .challenge-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#${SECTION_ID} .challenge-head h4{margin:2px 0 0;font-size:14px;line-height:1.25}
#${SECTION_ID} .challenge-meta{margin-top:3px;font-size:10px;line-height:1.4;color:var(--muted,#6b7176)}
#${SECTION_ID} .challenge-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
#${SECTION_ID} .challenge-card{min-width:0;border:1px solid var(--line,#e3e6e8);border-radius:12px;padding:10px;background:var(--card,#fff)}
#${SECTION_ID} .challenge-card h5{margin:0;font-size:11px;line-height:1.35;overflow-wrap:anywhere}
#${SECTION_ID} .challenge-card p{margin:5px 0 0;font-size:9px;line-height:1.4;color:var(--muted,#6b7176);overflow-wrap:anywhere}
#${SECTION_ID} .challenge-badge{display:inline-flex;margin-top:7px;padding:3px 7px;border:1px solid var(--line,#e3e6e8);border-radius:999px;font-size:9px;font-weight:850}
#${SECTION_ID} .challenge-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
#${SECTION_ID} .challenge-actions button{min-height:34px;padding:6px 9px;border-radius:9px;font-size:9px;font-weight:850}
#${SECTION_ID} .challenge-note,#${SECTION_ID} .challenge-empty,#${SECTION_ID} .challenge-unavailable{margin-top:8px;font-size:9px;line-height:1.45;color:var(--muted,#6b7176)}
#${SECTION_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #8f1d16}
@media(max-width:980px){#${SECTION_ID} .challenge-list{grid-template-columns:1fr 1fr}}
@media(max-width:680px){#${SECTION_ID} .challenge-list{grid-template-columns:1fr}}
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
    section.setAttribute("aria-label","Recommendation challenge mode");
    section.setAttribute("aria-live","polite");
    const calibration=q("#ownerDecisionRecommendationCalibration",centre);
    const learning=q("#ownerDecisionOutcomeLearning",centre);
    if(calibration)calibration.insertAdjacentElement("afterend",section);
    else if(learning)learning.insertAdjacentElement("afterend",section);
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

  function challengeSpec(item){
    const calibration=calibrationFor(item);
    return Object.freeze({
      title:clean(item?.title||item?.label||item?.name||"Owner decision",220),
      sourceType:sourceType(item),
      currentSummary:clean(item?.summary||item?.detail||item?.description||item?.reason||"",600),
      currentStatus:clean(item?.status||item?.truthState||item?.severity||item?.priority||"",80),
      historicalAdjustment:calibration.adjustment,
      historicalDirectionalSample:Number(calibration.directional||0),
      historicalEvidenceLevel:calibration.evidenceLevel||"insufficient",
      authoritative:false,
      authority:"context_only_no_execution"
    });
  }

  function challengePrompt(item){
    const spec=challengeSpec(item);
    return `Challenge the recommendation for “${spec.title}”. Use current verified business context first. Current canonical summary: ${spec.currentSummary||"No additional canonical summary is available"}. Current status: ${spec.currentStatus||"Not specified"}. Historical calibration for ${friendlyType(spec.sourceType)}: ${spec.historicalAdjustment}, ${spec.historicalDirectionalSample} directional owner-rated outcomes, evidence level ${spec.historicalEvidenceLevel}. First state the best current recommendation. Then construct the strongest evidence-based case AGAINST that recommendation. Show: (1) verified evidence supporting it, (2) verified evidence against it, (3) assumptions and material unknowns, (4) the specific new evidence or threshold that would reverse the recommendation, (5) whether historical calibration should affect wording strength, and (6) the safest reversible next step. Current verified evidence must override contradictory historical patterns. Historical outcomes are descriptive, not causal proof. Do not invent evidence. If evidence is unavailable, say so clearly. Do not execute anything, approve anything, pay anything, file anything, send anything, or change any business record.`;
  }
  function challenge(item){
    if(!isOwner())return false;
    return setDockPrompt(challengePrompt(item));
  }

  function decisionItems(snapshot){
    const items=Array.isArray(snapshot?.items)?snapshot.items:[];
    return items.filter(item=>classify(item)==="decision");
  }
  function itemCard(item){
    const spec=challengeSpec(item);
    const card=node("article",undefined,"challenge-card");
    card.append(node("h5",spec.title));
    if(spec.currentSummary)card.append(node("p",spec.currentSummary.slice(0,180)));
    card.append(node("span",calibrationLabel(calibrationFor(item)),"challenge-badge"));
    const controls=node("div",undefined,"challenge-actions");
    controls.append(button("Challenge recommendation",()=>challenge(item),"btn alt"));
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

    const head=node("div",undefined,"challenge-head");
    const copy=node("div");
    copy.append(node("div","Recommendation challenge mode","section-eyebrow"),node("h4","Make Thebe argue against itself"),node("div","For current verified owner decisions, Thebe must show the strongest evidence-based counter-case and what would change its conclusion.","challenge-meta"));
    head.append(copy);
    section.append(head);

    if(state!=="ready"){
      section.append(node("div","Canonical decision data is not verified, so Challenge Mode will not form or challenge a recommendation.","challenge-unavailable"));
      return;
    }
    const decisions=decisionItems(snapshot);
    if(!decisions.length){
      section.append(node("div","No verified owner decision is currently waiting to be challenged.","challenge-empty"));
      return;
    }
    const list=node("div",undefined,"challenge-list");
    decisions.slice(0,3).forEach(item=>list.append(itemCard(item)));
    section.append(list);
    if(decisions.length>3)section.append(node("div",`${decisions.length-3} more verified owner decisions are available in the canonical queue.`,"challenge-empty"));
    section.append(node("div","Challenge Mode is advisory and read-only. It does not create a second decision queue, alter canonical business truth, approve an action, or grant execution authority.","challenge-note"));
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    global.setTimeout(render,120);
  }
  function boot(){
    schedule();
    [700,1900].forEach(delay=>global.setTimeout(schedule,delay));
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

  global.ThebeOwnerRecommendationChallengeMode=Object.freeze({
    release:RELEASE,
    refresh:schedule,
    challenge,
    challengeSpec
  });
})(window);