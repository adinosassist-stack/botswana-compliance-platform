(function installOwnerDecisionRecommendationCalibrationV333(global){
  "use strict";

  const RELEASE="20261015-owner-decision-recommendation-calibration-v333";
  const SECTION_ID="ownerDecisionRecommendationCalibration";
  const STYLE_ID="ownerDecisionRecommendationCalibrationStyle";
  const REFRESH_MS=60000;
  const MIN_DIRECTIONAL_SAMPLE=3;
  const q=(selector,root=document)=>root.querySelector(selector);
  let refreshTimer=null;
  let refreshBusy=false;
  let calibrationSnapshot=Object.freeze([]);

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
#${SECTION_ID} .decision-calibration-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#${SECTION_ID} .decision-calibration-head h4{margin:2px 0 0;font-size:14px;line-height:1.25}
#${SECTION_ID} .decision-calibration-meta{margin-top:3px;font-size:10px;line-height:1.4;color:var(--muted,#6b7176)}
#${SECTION_ID} .decision-calibration-head-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
#${SECTION_ID} .decision-calibration-head-actions button{min-height:36px;padding:7px 10px;border-radius:10px;font-size:10px;font-weight:850}
#${SECTION_ID} .decision-calibration-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:10px}
#${SECTION_ID} .decision-calibration-kpi{min-width:0;border:1px solid var(--line,#e3e6e8);border-radius:11px;padding:8px;background:var(--card,#fff)}
#${SECTION_ID} .decision-calibration-kpi b{display:block;font-size:16px;line-height:1.1}
#${SECTION_ID} .decision-calibration-kpi span{display:block;margin-top:2px;font-size:9px;color:var(--muted,#6b7176);overflow-wrap:anywhere}
#${SECTION_ID} .decision-calibration-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:9px}
#${SECTION_ID} .decision-calibration-card{min-width:0;border:1px solid var(--line,#e3e6e8);border-radius:12px;padding:10px;background:var(--card,#fff)}
#${SECTION_ID} .decision-calibration-card h5{margin:0;font-size:11px;line-height:1.3;overflow-wrap:anywhere}
#${SECTION_ID} .decision-calibration-badge{display:inline-flex;margin-top:6px;padding:3px 7px;border:1px solid var(--line,#e3e6e8);border-radius:999px;font-size:9px;font-weight:850}
#${SECTION_ID} .decision-calibration-card p{margin:6px 0 0;font-size:9px;line-height:1.4;color:var(--muted,#6b7176);overflow-wrap:anywhere}
#${SECTION_ID} .decision-calibration-counts{margin-top:6px;font-size:9px;line-height:1.4}
#${SECTION_ID} .decision-calibration-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
#${SECTION_ID} .decision-calibration-actions button{min-height:32px;padding:5px 8px;border-radius:8px;font-size:9px;font-weight:800}
#${SECTION_ID} .decision-calibration-note,#${SECTION_ID} .decision-calibration-empty,#${SECTION_ID} .decision-calibration-error{margin-top:8px;font-size:9px;line-height:1.45;color:var(--muted,#6b7176)}
#${SECTION_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #8f1d16}
@media(max-width:980px){#${SECTION_ID} .decision-calibration-list{grid-template-columns:1fr 1fr}}
@media(max-width:700px){#${SECTION_ID} .decision-calibration-summary{grid-template-columns:repeat(2,minmax(0,1fr))}#${SECTION_ID} .decision-calibration-list{grid-template-columns:1fr}}
@media(max-width:560px){#${SECTION_ID} .decision-calibration-head{display:block}#${SECTION_ID} .decision-calibration-head-actions{justify-content:flex-start;margin-top:8px}}
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
    section.setAttribute("aria-label","Decision recommendation calibration");
    section.setAttribute("aria-live","polite");
    const learning=q("#ownerDecisionOutcomeLearning",centre);
    const follow=q("#ownerDecisionFollowThrough",centre);
    if(learning)learning.insertAdjacentElement("afterend",section);
    else if(follow)follow.insertAdjacentElement("afterend",section);
    else centre.prepend(section);
    return section;
  }

  function decisionRows(payload){
    const rows=Array.isArray(payload?.items)?payload.items:[];
    return rows.filter(row=>row?.namespace==="operations"&&row?.value?.kind==="owner_decision_note");
  }
  function outcome(row){
    const value=String(row?.value?.outcomeAssessment||"");
    return ["better","mixed","worse","insufficient"].includes(value)?value:"";
  }
  function friendlyType(value){
    const text=clean(value,80).replace(/[_-]+/g," ");
    return text?text.replace(/\b\w/g,char=>char.toUpperCase()):"Other decisions";
  }
  function evidenceLevel(directional){
    if(directional<MIN_DIRECTIONAL_SAMPLE)return "insufficient";
    if(directional<6)return "limited";
    return "developing";
  }
  function adjustmentFor(group){
    const directional=group.better+group.mixed+group.worse;
    if(directional<MIN_DIRECTIONAL_SAMPLE)return "uncalibrated";
    const betterShare=group.better/directional;
    const worseShare=group.worse/directional;
    if(group.better>=2&&betterShare>=2/3&&group.better>group.worse)return "slightly_supportive";
    if(group.worse>=2&&worseShare>=1/2&&group.worse>group.better)return "more_cautious";
    return "neutral_mixed";
  }
  function calibrationLabel(adjustment){
    if(adjustment==="slightly_supportive")return "Slightly supportive history";
    if(adjustment==="more_cautious")return "Caution history";
    if(adjustment==="neutral_mixed")return "Mixed history · neutral";
    return "Not calibrated yet";
  }
  function calibrationCopy(calibration){
    if(calibration.adjustment==="slightly_supportive")return "Past owner-rated outcomes can slightly strengthen phrasing only when current verified evidence independently supports the recommendation.";
    if(calibration.adjustment==="more_cautious")return "Past owner-rated outcomes should make the recommendation more cautious and surface contrary evidence before suggesting a next step.";
    if(calibration.adjustment==="neutral_mixed")return "Past owner-rated outcomes are mixed, so historical outcomes should not strengthen or weaken the recommendation.";
    return `At least ${MIN_DIRECTIONAL_SAMPLE} directional owner-rated outcomes are required before historical outcomes may adjust recommendation phrasing.`;
  }
  function buildCalibrations(rows){
    const groups=new Map();
    rows.forEach(row=>{
      const result=outcome(row);
      if(!result)return;
      const sourceType=clean(row?.value?.sourceType,80)||"other";
      if(!groups.has(sourceType))groups.set(sourceType,{sourceType,better:0,mixed:0,worse:0,insufficient:0,total:0});
      const group=groups.get(sourceType);
      group[result]+=1;
      group.total+=1;
    });
    return [...groups.values()].map(group=>{
      const directional=group.better+group.mixed+group.worse;
      const adjustment=adjustmentFor(group);
      return Object.freeze({
        sourceType:group.sourceType,
        rated:group.total,
        directional,
        better:group.better,
        mixed:group.mixed,
        worse:group.worse,
        insufficient:group.insufficient,
        adjustment,
        evidenceLevel:evidenceLevel(directional),
        authoritative:false,
        authority:"context_only_no_execution"
      });
    }).sort((a,b)=>b.directional-a.directional||b.rated-a.rated||a.sourceType.localeCompare(b.sourceType));
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
  function recommendationPrompt(calibration){
    const type=friendlyType(calibration.sourceType);
    return `Calibrate a recommendation for ${type} using current verified business context first. Historical owner-rated outcomes for this decision type: ${calibration.better} better, ${calibration.mixed} mixed, ${calibration.worse} worse, ${calibration.insufficient} not enough evidence; ${calibration.directional} directional outcomes. Historical adjustment: ${calibration.adjustment}; evidence level: ${calibration.evidenceLevel}. Use history only to calibrate wording strength, never as causal proof and never to override contradictory current evidence. State the current evidence, material unknowns, historical sample size, why the recommendation strength is appropriate, and the safest next step. Separate evidence from hypothesis. Do not execute anything, approve anything, or change any business record.`;
  }
  function askThebe(calibration){setDockPrompt(recommendationPrompt(calibration))}
  function askThebeAll(calibrations){
    const usable=calibrations.filter(item=>item.directional>=MIN_DIRECTIONAL_SAMPLE).slice(0,5);
    const summary=usable.length?usable.map(item=>`${friendlyType(item.sourceType)}: ${item.adjustment}, ${item.directional} directional outcomes`).join("; "):"No decision type yet has enough directional owner-rated outcomes for calibration";
    setDockPrompt(`Review my recommendation calibration map. ${summary}. Use current verified business context first. Historical outcome counts may only adjust recommendation wording strength; they are not causal proof and must not override contradictory current evidence. Identify where history is supportive, cautionary, mixed, or still insufficient, and explain the uncertainty. Do not execute anything, approve anything, or change any business record.`);
  }

  function kpi(label,value){
    const card=node("div",undefined,"decision-calibration-kpi");
    card.append(node("b",String(value)),node("span",label));
    return card;
  }
  function card(calibration){
    const item=node("article",undefined,"decision-calibration-card");
    item.append(node("h5",friendlyType(calibration.sourceType)));
    item.append(node("span",calibrationLabel(calibration.adjustment),"decision-calibration-badge"));
    item.append(node("div",`${calibration.directional} directional · ${calibration.better} better · ${calibration.mixed} mixed · ${calibration.worse} worse`,"decision-calibration-counts"));
    if(calibration.insufficient)item.append(node("div",`${calibration.insufficient} additional rating${calibration.insufficient===1?"":"s"} marked not enough evidence`,"decision-calibration-counts"));
    item.append(node("p",calibrationCopy(calibration)));
    const controls=node("div",undefined,"decision-calibration-actions");
    controls.append(button("Ask Thebe",()=>askThebe(calibration),"btn alt"));
    item.append(controls);
    return item;
  }

  function render(calibrations){
    const section=ensureSection();
    if(!section)return;
    if(!calibrations.length){section.remove();return}
    section.replaceChildren();
    const calibrated=calibrations.filter(item=>item.directional>=MIN_DIRECTIONAL_SAMPLE);
    const supportive=calibrated.filter(item=>item.adjustment==="slightly_supportive").length;
    const cautious=calibrated.filter(item=>item.adjustment==="more_cautious").length;
    const neutral=calibrated.filter(item=>item.adjustment==="neutral_mixed").length;

    const head=node("div",undefined,"decision-calibration-head");
    const copy=node("div");
    copy.append(node("div","Recommendation calibration","section-eyebrow"),node("h4","Tune recommendation strength from reviewed outcomes"),node("div",`Current verified evidence stays primary. At least ${MIN_DIRECTIONAL_SAMPLE} directional owner-rated outcomes are required before history can adjust wording strength.`,"decision-calibration-meta"));
    const actions=node("div",undefined,"decision-calibration-head-actions");
    actions.append(button("Ask Thebe",()=>askThebeAll(calibrations),"btn alt"));
    head.append(copy,actions);
    section.append(head);

    const summary=node("div",undefined,"decision-calibration-summary");
    summary.append(kpi("Calibrated types",calibrated.length),kpi("Supportive history",supportive),kpi("Caution history",cautious),kpi("Mixed / neutral",neutral));
    section.append(summary);

    const list=node("div",undefined,"decision-calibration-list");
    calibrations.slice(0,6).forEach(item=>list.append(card(item)));
    section.append(list);
    if(calibrations.length>6)section.append(node("div",`${calibrations.length-6} more decision types have owner-rated history.`,"decision-calibration-empty"));
    section.append(node("div","Calibration is descriptive and non-authoritative. It does not prove causation, create an approval, grant execution authority, or replace current verified business evidence.","decision-calibration-note"));
  }

  async function refresh(force=false){
    if(!isOwner()){
      calibrationSnapshot=Object.freeze([]);
      document.getElementById(SECTION_ID)?.remove();
      return;
    }
    if(refreshBusy)return;
    refreshBusy=true;
    try{
      const payload=await apiJson("/api/business-memory");
      calibrationSnapshot=Object.freeze(buildCalibrations(decisionRows(payload)));
      render(calibrationSnapshot);
    }catch{
      calibrationSnapshot=Object.freeze([]);
      const section=ensureSection();
      if(section)section.replaceChildren(node("div","Recommendation calibration is temporarily unavailable. No recommendation or business state was changed.","decision-calibration-error"));
    }finally{refreshBusy=false}
  }

  function getCalibration(sourceType){
    const key=clean(sourceType,80)||"other";
    const found=calibrationSnapshot.find(item=>item.sourceType===key);
    return found||Object.freeze({sourceType:key,rated:0,directional:0,better:0,mixed:0,worse:0,insufficient:0,adjustment:"uncalibrated",evidenceLevel:"insufficient",authoritative:false,authority:"context_only_no_execution"});
  }
  function schedule(){
    global.clearTimeout(refreshTimer);
    refreshTimer=global.setTimeout(()=>void refresh(),110);
  }
  function boot(){
    schedule();
    [650,1800].forEach(delay=>global.setTimeout(schedule,delay));
    global.setInterval(()=>void refresh(),REFRESH_MS);
    global.addEventListener?.("thebe:auth:state",schedule);
    global.addEventListener?.("thebe:identity:ready",schedule);
    global.addEventListener?.("thebe:workspace:view",schedule);
    document.addEventListener("change",event=>{if(event.target?.id==="companySelect")global.setTimeout(()=>void refresh(true),550)});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();

  global.ThebeOwnerDecisionRecommendationCalibration=Object.freeze({
    release:RELEASE,
    minDirectionalSample:MIN_DIRECTIONAL_SAMPLE,
    refresh:()=>refresh(true),
    getCalibration
  });
})(window);