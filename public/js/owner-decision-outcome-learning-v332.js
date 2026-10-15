(function installOwnerDecisionOutcomeLearningV332(global){
  "use strict";

  const RELEASE="20261015-owner-decision-outcome-learning-v332";
  const SECTION_ID="ownerDecisionOutcomeLearning";
  const STYLE_ID="ownerDecisionOutcomeLearningStyle";
  const REFRESH_MS=60000;
  const ASSESSMENTS=Object.freeze({
    better:"Better outcome",
    mixed:"Mixed outcome",
    worse:"Worse outcome",
    insufficient:"Not enough evidence"
  });
  const EXPERIMENT_ASSESSMENTS=Object.freeze({
    continue_supported:"Continue evidence met",
    stop_or_revise_supported:"Stop / revise evidence met",
    mixed:"Mixed evidence",
    inconclusive:"Inconclusive"
  });
  const q=(selector,root=document)=>root.querySelector(selector);
  let refreshTimer=null;
  let refreshBusy=false;
  const writeBusy=new Set();

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
#${SECTION_ID} .decision-learning-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#${SECTION_ID} .decision-learning-head h4{margin:2px 0 0;font-size:14px;line-height:1.25}
#${SECTION_ID} .decision-learning-meta{margin-top:3px;font-size:10px;line-height:1.35;color:var(--muted,#6b7176)}
#${SECTION_ID} .decision-learning-head-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
#${SECTION_ID} .decision-learning-head-actions button{min-height:36px;padding:7px 10px;border-radius:10px;font-size:10px;font-weight:850}
#${SECTION_ID} .decision-learning-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin-top:10px}
#${SECTION_ID} .decision-learning-kpi{min-width:0;border:1px solid var(--line,#e3e6e8);border-radius:11px;padding:8px;background:var(--card,#fff)}
#${SECTION_ID} .decision-learning-kpi b{display:block;font-size:16px;line-height:1.1}
#${SECTION_ID} .decision-learning-kpi span{display:block;margin-top:2px;font-size:9px;color:var(--muted,#6b7176);overflow-wrap:anywhere}
#${SECTION_ID} .decision-learning-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:8px;margin-top:9px}
#${SECTION_ID} .decision-learning-panel{min-width:0;border:1px solid var(--line,#e3e6e8);border-radius:12px;padding:10px;background:var(--card,#fff)}
#${SECTION_ID} .decision-learning-panel h5{margin:0;font-size:11px;line-height:1.3}
#${SECTION_ID} .decision-learning-list{display:grid;gap:7px;margin-top:8px}
#${SECTION_ID} .decision-learning-item{border-top:1px solid var(--line,#e3e6e8);padding-top:7px;min-width:0}
#${SECTION_ID} .decision-learning-item:first-child{border-top:0;padding-top:0}
#${SECTION_ID} .decision-learning-item b{display:block;font-size:10px;line-height:1.35;overflow-wrap:anywhere}
#${SECTION_ID} .decision-learning-item p{margin:3px 0 0;font-size:9px;line-height:1.35;color:var(--muted,#6b7176);overflow-wrap:anywhere}
#${SECTION_ID} .decision-learning-rating{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}
#${SECTION_ID} .decision-learning-rating button{min-height:32px;padding:5px 7px;border-radius:8px;font-size:9px;font-weight:800}
#${SECTION_ID} .decision-learning-pattern{padding:7px 0;border-top:1px solid var(--line,#e3e6e8);font-size:9px;line-height:1.4}
#${SECTION_ID} .decision-learning-pattern:first-child{border-top:0;padding-top:0}
#${SECTION_ID} .decision-learning-pattern b{font-size:10px}
#${SECTION_ID} .decision-learning-note{margin-top:7px;font-size:9px;line-height:1.4;color:var(--muted,#6b7176)}
#${SECTION_ID} .decision-learning-empty{margin-top:7px;font-size:9px;line-height:1.4;color:var(--muted,#6b7176)}
#${SECTION_ID} .decision-learning-error{font-size:10px;line-height:1.4;color:var(--muted,#6b7176)}
#${SECTION_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #8f1d16}
@media(max-width:900px){#${SECTION_ID} .decision-learning-summary{grid-template-columns:repeat(3,minmax(0,1fr))}#${SECTION_ID} .decision-learning-grid{grid-template-columns:1fr}}
@media(max-width:560px){#${SECTION_ID} .decision-learning-head{display:block}#${SECTION_ID} .decision-learning-head-actions{justify-content:flex-start;margin-top:8px}#${SECTION_ID} .decision-learning-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
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
    section.setAttribute("aria-label","Decision outcome learning");
    section.setAttribute("aria-live","polite");
    const follow=q("#ownerDecisionFollowThrough",centre);
    const attention=q("#ownerDecisionLanes",centre);
    if(follow)follow.insertAdjacentElement("afterend",section);
    else if(attention)attention.insertAdjacentElement("afterend",section);
    else centre.prepend(section);
    return section;
  }

  function decisionRows(payload){
    const rows=Array.isArray(payload?.items)?payload.items:[];
    return rows.filter(row=>row?.namespace==="operations"&&row?.value?.kind==="owner_decision_note");
  }
  function experimentRows(payload){
    const rows=Array.isArray(payload?.items)?payload.items:[];
    return rows.filter(row=>row?.namespace==="operations"&&row?.value?.kind==="owner_experiment_result");
  }
  function reviewedRows(rows){
    return rows.filter(row=>Boolean(row?.value?.lastReviewedAt)||["kept","closed"].includes(String(row?.value?.reviewState||"")));
  }
  function assessment(row){
    const value=String(row?.value?.outcomeAssessment||"");
    return Object.hasOwn(ASSESSMENTS,value)?value:"";
  }
  function counts(rows){
    const reviewed=reviewedRows(rows);
    const result={reviewed:reviewed.length,better:0,mixed:0,worse:0,insufficient:0,unrated:0};
    reviewed.forEach(row=>{
      const key=assessment(row);
      if(key)result[key]+=1;
      else result.unrated+=1;
    });
    return result;
  }
  function experimentCounts(rows){
    const result={total:rows.length,continue_supported:0,stop_or_revise_supported:0,mixed:0,inconclusive:0};
    rows.forEach(row=>{
      const key=String(row?.value?.resultAssessment||"inconclusive");
      if(Object.hasOwn(EXPERIMENT_ASSESSMENTS,key))result[key]+=1;
      else result.inconclusive+=1;
    });
    return result;
  }
  function friendlyType(value){
    const text=clean(value,80).replace(/[_-]+/g," ");
    return text?text.replace(/\b\w/g,char=>char.toUpperCase()):"Other decisions";
  }
  function patterns(rows){
    const groups=new Map();
    reviewedRows(rows).forEach(row=>{
      const result=assessment(row);
      if(!result)return;
      const key=clean(row?.value?.sourceType,80)||"other";
      if(!groups.has(key))groups.set(key,{sourceType:key,total:0,better:0,mixed:0,worse:0,insufficient:0});
      const group=groups.get(key);
      group.total+=1;
      group[result]+=1;
    });
    return [...groups.values()].filter(group=>group.total>=2).sort((a,b)=>b.total-a.total||a.sourceType.localeCompare(b.sourceType)).slice(0,4);
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
  function askThebeLearning(rows,experiments=[]){
    const totals=counts(rows);
    const experimentTotals=experimentCounts(experiments);
    const grouped=patterns(rows).map(group=>`${friendlyType(group.sourceType)}: ${group.better} better, ${group.mixed} mixed, ${group.worse} worse, ${group.insufficient} not enough evidence`).join("; ")||"No decision type has at least two owner-rated outcomes yet";
    const experimentEvidence=experiments.slice(0,4).map(row=>{
      const value=row?.value||{};
      return `${clean(value.title,120)||"Decision"}: ${EXPERIMENT_ASSESSMENTS[value.resultAssessment]||"Inconclusive"}; observed ${clean(value.observedEvidence,220)||"no observation recorded"}`;
    }).join("; ")||"No owner-confirmed experiment result is recorded";
    setDockPrompt(`Review my owner-confirmed decision outcomes. Reviewed: ${totals.reviewed}; better: ${totals.better}; mixed: ${totals.mixed}; worse: ${totals.worse}; not enough evidence: ${totals.insufficient}; awaiting owner rating: ${totals.unrated}. Descriptive groups: ${grouped}. Owner-confirmed experiment evidence is a separate evidence stream and must not be automatically converted into Better, Mixed, or Worse decision ratings. Experiment results: ${experimentTotals.total}; continue evidence met: ${experimentTotals.continue_supported}; stop/revise evidence met: ${experimentTotals.stop_or_revise_supported}; mixed: ${experimentTotals.mixed}; inconclusive: ${experimentTotals.inconclusive}. Latest experiment evidence: ${experimentEvidence}. Use current verified business context and owner-confirmed notes to explain possible patterns, but do not claim causation from these counts or experiments. Separate evidence, hypotheses, and unknowns. Do not execute anything or change any business record.`);
  }

  async function saveAssessment(row,value){
    if(!isOwner()||!Object.hasOwn(ASSESSMENTS,value)||!row?.key||writeBusy.has(row.key))return;
    writeBusy.add(row.key);
    try{
      const next={...(row.value||{}),version:3,outcomeAssessment:value,outcomeAssessedAt:new Date().toISOString(),authority:"context_only_no_execution"};
      await apiJson("/api/business-memory",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({namespace:"operations",key:row.key,value:next})
      });
      await refresh(true);
    }catch{
      const section=ensureSection();
      if(section){
        const notice=q(".decision-learning-note",section)||node("div",undefined,"decision-learning-note");
        notice.textContent="Outcome rating could not be saved. No business state was changed.";
        if(!notice.parentElement)section.append(notice);
      }
    }finally{writeBusy.delete(row.key)}
  }

  function kpi(label,value){
    const card=node("div",undefined,"decision-learning-kpi");
    card.append(node("b",String(value)),node("span",label));
    return card;
  }
  function pendingItem(row){
    const value=row?.value||{};
    const item=node("article",undefined,"decision-learning-item");
    item.append(node("b",clean(value.title,220)||"Owner decision"));
    const outcome=clean(value.lastOutcomeNote,600);
    item.append(node("p",outcome?`Observed: ${outcome.slice(0,180)}`:"No structured outcome rating has been recorded yet."));
    const rating=node("div",undefined,"decision-learning-rating");
    rating.append(
      button("Better",()=>void saveAssessment(row,"better"),"btn soft"),
      button("Mixed",()=>void saveAssessment(row,"mixed"),"btn soft"),
      button("Worse",()=>void saveAssessment(row,"worse"),"btn soft"),
      button("Not enough evidence",()=>void saveAssessment(row,"insufficient"),"btn soft")
    );
    item.append(rating);
    return item;
  }

  function render(rows,experiments=[]){
    const section=ensureSection();
    if(!section)return;
    const reviewed=reviewedRows(rows);
    if(!reviewed.length&&!experiments.length){section.remove();return}
    const totals=counts(rows);
    const experimentTotals=experimentCounts(experiments);
    const grouped=patterns(rows);
    section.replaceChildren();

    const head=node("div",undefined,"decision-learning-head");
    const copy=node("div");
    copy.append(node("div","Decision outcome learning","section-eyebrow"),node("h4","Learn from owner-confirmed outcomes"),node("div","Descriptive learning from decisions you reviewed and owner-confirmed experiment evidence. It does not change canonical business data or create execution authority.","decision-learning-meta"));
    const actions=node("div",undefined,"decision-learning-head-actions");
    actions.append(button("Ask Thebe",()=>askThebeLearning(rows,experiments),"btn alt"));
    head.append(copy,actions);
    section.append(head);

    const summary=node("div",undefined,"decision-learning-summary");
    summary.append(kpi("Reviewed",totals.reviewed),kpi("Better",totals.better),kpi("Mixed",totals.mixed),kpi("Worse",totals.worse),kpi("Need evidence",totals.insufficient+totals.unrated));
    section.append(summary);

    const grid=node("div",undefined,"decision-learning-grid");
    const pending=node("section",undefined,"decision-learning-panel");
    pending.append(node("h5","Rate reviewed outcomes"));
    const unrated=reviewed.filter(row=>!assessment(row));
    if(unrated.length){
      const list=node("div",undefined,"decision-learning-list");
      unrated.slice(0,3).forEach(row=>list.append(pendingItem(row)));
      pending.append(list);
      if(unrated.length>3)pending.append(node("div",`${unrated.length-3} more reviewed decisions still need an owner outcome rating.`,"decision-learning-empty"));
    }else pending.append(node("div",reviewed.length?"All currently reviewed decisions have an owner-confirmed outcome rating.":"No reviewed decision is currently waiting for an outcome rating.","decision-learning-empty"));

    const patternPanel=node("section",undefined,"decision-learning-panel");
    patternPanel.append(node("h5","Observed decision patterns"));
    if(grouped.length){
      const list=node("div",undefined,"decision-learning-list");
      grouped.forEach(group=>{
        const item=node("div",undefined,"decision-learning-pattern");
        item.append(node("b",friendlyType(group.sourceType)),node("div",`${group.total} rated · ${group.better} better · ${group.mixed} mixed · ${group.worse} worse · ${group.insufficient} not enough evidence`));
        list.append(item);
      });
      patternPanel.append(list,node("div","Owner-confirmed descriptive pattern only. These counts do not prove that a decision caused the later outcome.","decision-learning-note"));
    }else patternPanel.append(node("div","At least two owner-rated outcomes in the same decision type are required before a pattern is shown.","decision-learning-empty"));
    if(experimentTotals.total){
      patternPanel.append(node("div",`Owner-confirmed experiment evidence · ${experimentTotals.total} result${experimentTotals.total===1?"":"s"} · ${experimentTotals.continue_supported} continue · ${experimentTotals.stop_or_revise_supported} stop/revise · ${experimentTotals.mixed} mixed · ${experimentTotals.inconclusive} inconclusive. Experiment results remain separate evidence and are not automatically converted into Better, Mixed, or Worse decision outcome ratings.`,"decision-learning-note"));
    }else patternPanel.append(node("div","No owner-confirmed experiment result has been recorded yet.","decision-learning-note"));
    grid.append(pending,patternPanel);
    section.append(grid);
  }

  async function refresh(force=false){
    if(!isOwner()){
      document.getElementById(SECTION_ID)?.remove();
      return;
    }
    if(refreshBusy)return;
    refreshBusy=true;
    try{
      const payload=await apiJson("/api/business-memory");
      render(decisionRows(payload),experimentRows(payload));
    }catch{
      const section=ensureSection();
      if(section)section.replaceChildren(node("div","Decision outcome learning is temporarily unavailable. No business state was changed.","decision-learning-error"));
    }finally{refreshBusy=false}
  }

  function schedule(){
    global.clearTimeout(refreshTimer);
    refreshTimer=global.setTimeout(()=>void refresh(),100);
  }
  function boot(){
    schedule();
    [600,1700].forEach(delay=>global.setTimeout(schedule,delay));
    global.setInterval(()=>void refresh(),REFRESH_MS);
    global.addEventListener?.("thebe:auth:state",schedule);
    global.addEventListener?.("thebe:identity:ready",schedule);
    global.addEventListener?.("thebe:workspace:view",schedule);
    document.addEventListener("change",event=>{if(event.target?.id==="companySelect")global.setTimeout(()=>void refresh(true),550)});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();

  global.ThebeOwnerDecisionOutcomeLearning=Object.freeze({release:RELEASE,refresh:()=>refresh(true)});
})(window);