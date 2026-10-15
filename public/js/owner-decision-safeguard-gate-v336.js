(function installOwnerDecisionSafeguardGateV336(global){
  "use strict";

  const RELEASE="20261015-owner-decision-safeguard-gate-v336";
  const SECTION_ID="ownerDecisionSafeguardGate";
  const STYLE_ID="ownerDecisionSafeguardGateStyle";
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
  function premortemSpec(item){
    const fallback=Object.freeze({
      title:clean(item?.title||item?.label||item?.name||"Owner decision",220),
      sourceType:clean(item?.sourceType||item?.kind||"owner_attention",80)||"owner_attention",
      currentSummary:clean(item?.summary||item?.detail||item?.description||item?.reason||"",600),
      currentStatus:clean(item?.status||item?.truthState||item?.severity||item?.priority||"",80),
      historicalAdjustment:"uncalibrated",
      historicalDirectionalSample:0,
      historicalEvidenceLevel:"insufficient",
      horizon:"six_months",
      authoritative:false,
      authority:"context_only_no_execution"
    });
    try{return global.ThebeOwnerDecisionPremortem?.premortemSpec?.(item)||fallback}
    catch{return fallback}
  }

  function itemText(item){
    return [item?.title,item?.summary,item?.detail,item?.description,item?.reason,item?.category,item?.sourceType,item?.kind,item?.status,item?.priority,item?.severity]
      .map(value=>clean(value,400)).filter(Boolean).join(" ").toLowerCase();
  }
  function dueAt(item){
    const stamp=Date.parse(String(item?.dueAt||item?.due_at||item?.deadlineAt||item?.deadline||item?.dueDate||""));
    return Number.isFinite(stamp)?stamp:null;
  }
  function exposureSignals(item){
    const signals=[];
    const severity=clean(item?.severity||item?.priority||item?.tone,40).toLowerCase();
    const due=dueAt(item);
    const hay=itemText(item);
    if(["critical","urgent","high","red","risk"].includes(severity))signals.push("High canonical priority / risk marker");
    if(item?.overdue===true||(due!==null&&due<Date.now()))signals.push("Overdue canonical item");
    if(item?.requiresApproval===true)signals.push("Approval-sensitive decision");
    if(/(payment|payroll|cash|bank|tax|burs|cipa|compliance|licen[cs]e|regulat|property|valuation|employee|people)/.test(hay))signals.push("Material money / compliance / people / property domain");
    return Object.freeze(signals.slice(0,4));
  }
  function exposureLabel(item){
    const count=exposureSignals(item).length;
    if(count>=2)return "Higher exposure · safeguard review";
    if(count===1)return "Safeguard review";
    return "Standard safeguard review";
  }

  function installStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement("style");
    style.id=STYLE_ID;
    const nonce=document.querySelector("style[nonce],script[nonce]")?.nonce;
    if(nonce)style.nonce=nonce;
    style.textContent=`
#${SECTION_ID}{margin:10px 0 16px;padding:12px;border:1px solid var(--line,#e3e6e8);border-radius:15px;background:var(--card,#fff);min-width:0}
#${SECTION_ID} .safeguard-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#${SECTION_ID} .safeguard-head h4{margin:2px 0 0;font-size:14px;line-height:1.25}
#${SECTION_ID} .safeguard-meta{margin-top:3px;font-size:10px;line-height:1.4;color:var(--muted,#6b7176)}
#${SECTION_ID} .safeguard-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
#${SECTION_ID} .safeguard-card{min-width:0;border:1px solid var(--line,#e3e6e8);border-radius:12px;padding:10px;background:var(--card,#fff)}
#${SECTION_ID} .safeguard-card h5{margin:0;font-size:11px;line-height:1.35;overflow-wrap:anywhere}
#${SECTION_ID} .safeguard-card p{margin:5px 0 0;font-size:9px;line-height:1.4;color:var(--muted,#6b7176);overflow-wrap:anywhere}
#${SECTION_ID} .safeguard-badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}
#${SECTION_ID} .safeguard-badge{display:inline-flex;padding:3px 7px;border:1px solid var(--line,#e3e6e8);border-radius:999px;font-size:9px;font-weight:850}
#${SECTION_ID} .safeguard-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
#${SECTION_ID} .safeguard-actions button{min-height:34px;padding:6px 9px;border-radius:9px;font-size:9px;font-weight:850}
#${SECTION_ID} .safeguard-note,#${SECTION_ID} .safeguard-empty,#${SECTION_ID} .safeguard-unavailable{margin-top:8px;font-size:9px;line-height:1.45;color:var(--muted,#6b7176)}
#${SECTION_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #8f1d16}
@media(max-width:980px){#${SECTION_ID} .safeguard-list{grid-template-columns:1fr 1fr}}
@media(max-width:680px){#${SECTION_ID} .safeguard-list{grid-template-columns:1fr}}
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
    section.setAttribute("aria-label","Decision safeguard gate");
    section.setAttribute("aria-live","polite");
    const premortem=q("#ownerDecisionPremortem",centre);
    const challenge=q("#ownerRecommendationChallengeMode",centre);
    if(premortem)premortem.insertAdjacentElement("afterend",section);
    else if(challenge)challenge.insertAdjacentElement("afterend",section);
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

  function safeguardSpec(item){
    const pre=premortemSpec(item);
    return Object.freeze({
      title:pre.title,
      sourceType:pre.sourceType,
      currentSummary:pre.currentSummary,
      currentStatus:pre.currentStatus,
      exposureSignals:exposureSignals(item),
      exposureSignalCount:exposureSignals(item).length,
      authoritative:false,
      authority:"context_only_no_execution"
    });
  }

  function safeguardPrompt(item){
    const spec=safeguardSpec(item);
    const signals=spec.exposureSignals.length?spec.exposureSignals.join("; "):"No additional deterministic exposure signal beyond being a verified owner decision";
    return `Run a decision safeguard review for “${spec.title}” using current verified business context first. Current canonical summary: ${spec.currentSummary||"No additional canonical summary is available"}. Current status: ${spec.currentStatus||"Not specified"}. Deterministic presentation signals: ${signals}. These signals are not a risk score and do not prove the decision is unsafe. For each safeguard category, classify it only as Defined, Partial, Missing, or Unknown based on verified context: (1) measurable success / failure signal, (2) early warning signal, (3) reversible first step or bounded test, (4) explicit exit trigger / stop condition, (5) exposure limit or maximum downside where a verified limit exists, (6) accountable human owner / reviewer, and (7) irreversible commitment requiring extra scrutiny. Cite or describe the verified evidence behind each classification. Do not infer that a safeguard is defined merely because it would be sensible. Do not invent thresholds, limits, probabilities, approvals, or evidence. If a threshold or limit is Unknown, state what measurement or owner decision is needed to define it. End with the missing safeguards that deserve attention before exposure grows and the smallest reversible next step. This is an advisory readiness check, not a blocker, approval, or execution gate. Do not execute anything, approve anything, pay anything, file anything, send anything, or change any business record.`;
  }
  function reviewSafeguards(item){
    if(!isOwner())return false;
    return setDockPrompt(safeguardPrompt(item));
  }

  function decisionItems(snapshot){
    const items=Array.isArray(snapshot?.items)?snapshot.items:[];
    return items.filter(item=>classify(item)==="decision");
  }
  function itemCard(item){
    const spec=safeguardSpec(item);
    const card=node("article",undefined,"safeguard-card");
    card.append(node("h5",spec.title));
    if(spec.currentSummary)card.append(node("p",spec.currentSummary.slice(0,180)));
    const badges=node("div",undefined,"safeguard-badges");
    badges.append(node("span",exposureLabel(item),"safeguard-badge"));
    badges.append(node("span","Defined · Partial · Missing · Unknown","safeguard-badge"));
    card.append(badges);
    const controls=node("div",undefined,"safeguard-actions");
    controls.append(button("Review safeguards",()=>reviewSafeguards(item),"btn alt"));
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

    const head=node("div",undefined,"safeguard-head");
    const copy=node("div");
    copy.append(node("div","Decision safeguard gate","section-eyebrow"),node("h4","Check safeguards before exposure grows"),node("div","Verify what is defined, partial, missing, or unknown before relying on a higher-exposure decision. This advisory gate never blocks or executes the decision.","safeguard-meta"));
    head.append(copy);
    section.append(head);

    if(state!=="ready"){
      section.append(node("div","Canonical decision data is not verified, so the Safeguard Gate will not classify readiness or infer missing controls.","safeguard-unavailable"));
      return;
    }
    const decisions=decisionItems(snapshot);
    if(!decisions.length){
      section.append(node("div","No verified owner decision is currently waiting for a safeguard review.","safeguard-empty"));
      return;
    }
    const sorted=decisions.slice().sort((a,b)=>exposureSignals(b).length-exposureSignals(a).length);
    const list=node("div",undefined,"safeguard-list");
    sorted.slice(0,3).forEach(item=>list.append(itemCard(item)));
    section.append(list);
    if(sorted.length>3)section.append(node("div",`${sorted.length-3} more verified owner decisions are available in the canonical queue.`,"safeguard-empty"));
    section.append(node("div","Safeguard Gate is advisory and read-only. Exposure signals are presentation heuristics, not an authoritative risk score. It does not block, approve, mutate, or grant execution authority.","safeguard-note"));
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    global.setTimeout(render,140);
  }
  function boot(){
    schedule();
    [800,2100].forEach(delay=>global.setTimeout(schedule,delay));
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

  global.ThebeOwnerDecisionSafeguardGate=Object.freeze({
    release:RELEASE,
    refresh:schedule,
    reviewSafeguards,
    safeguardSpec,
    exposureSignals
  });
})(window);