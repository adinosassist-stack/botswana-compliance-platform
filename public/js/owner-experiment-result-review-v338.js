(function installOwnerExperimentResultReviewV338(global){
  "use strict";

  const RELEASE="20261015-owner-experiment-result-review-v338";
  const SECTION_ID="ownerExperimentResultReview";
  const STYLE_ID="ownerExperimentResultReviewStyle";
  const DIALOG_ID="ownerExperimentResultDialog";
  const REFRESH_MS=60000;
  const ASSESSMENTS=Object.freeze({
    continue_supported:"Continue evidence met",
    stop_or_revise_supported:"Stop / revise evidence met",
    mixed:"Mixed evidence",
    inconclusive:"Inconclusive"
  });
  const q=(selector,root=document)=>root.querySelector(selector);
  let scheduled=false;
  let refreshBusy=false;
  let dialogItem=null;
  let dialogRecord=null;
  const writeBusy=new Set();
  let resultRows=[];

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
  function canonicalSnapshot(){
    try{return global.ThebeOwnerFocusStrip?.canonicalSnapshot?.()||null}
    catch{return null}
  }
  function classify(item){
    try{return global.ThebeOwnerFirstHome?.classify?.(item)||""}
    catch{return ""}
  }
  function experimentSpec(item){
    const fallback=Object.freeze({
      title:clean(item?.title||item?.label||item?.name||"Owner decision",220),
      sourceType:clean(item?.sourceType||item?.kind||"owner_attention",80)||"owner_attention",
      currentSummary:clean(item?.summary||item?.detail||item?.description||item?.reason||"",600),
      currentStatus:clean(item?.status||item?.truthState||item?.severity||item?.priority||"",80),
      authoritative:false,
      authority:"context_only_no_execution"
    });
    try{return global.ThebeOwnerDecisionExperimentPlanner?.experimentSpec?.(item)||fallback}
    catch{return fallback}
  }
  function sourceKey(item){
    const direct=clean(item?.key,300);
    if(direct)return direct;
    const type=clean(item?.sourceType||item?.kind||"owner_attention",80);
    const id=clean(item?.sourceId||item?.id||item?.title||"item",200);
    return `${type}:${id}`.slice(0,300);
  }
  function tinyHash(value){
    let hash=2166136261;
    for(const char of String(value??"")){
      hash^=char.codePointAt(0)||0;
      hash=Math.imul(hash,16777619);
    }
    return (hash>>>0).toString(36);
  }
  function resultKey(item){
    const source=sourceKey(item);
    const slug=source.toLowerCase().replace(/[^a-z0-9.-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,42)||"item";
    return `experiment-result.${tinyHash(source)}.${slug}`.slice(0,80);
  }
  function resultRecord(item){
    const key=resultKey(item);
    return resultRows.find(row=>row?.namespace==="operations"&&row?.key===key&&row?.value?.kind==="owner_experiment_result")||null;
  }

  function installStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement("style");
    style.id=STYLE_ID;
    const nonce=document.querySelector("style[nonce],script[nonce]")?.nonce;
    if(nonce)style.nonce=nonce;
    style.textContent=`
#${SECTION_ID}{margin:10px 0 16px;padding:12px;border:1px solid var(--line,#e3e6e8);border-radius:15px;background:var(--card,#fff);min-width:0}
#${SECTION_ID} .result-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#${SECTION_ID} .result-head h4{margin:2px 0 0;font-size:14px;line-height:1.25}
#${SECTION_ID} .result-meta{margin-top:3px;font-size:10px;line-height:1.4;color:var(--muted,#6b7176)}
#${SECTION_ID} .result-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
#${SECTION_ID} .result-card{min-width:0;border:1px solid var(--line,#e3e6e8);border-radius:12px;padding:10px;background:var(--card,#fff)}
#${SECTION_ID} .result-card h5{margin:0;font-size:11px;line-height:1.35;overflow-wrap:anywhere}
#${SECTION_ID} .result-card p{margin:5px 0 0;font-size:9px;line-height:1.4;color:var(--muted,#6b7176);overflow-wrap:anywhere}
#${SECTION_ID} .result-badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}
#${SECTION_ID} .result-badge{display:inline-flex;padding:3px 7px;border:1px solid var(--line,#e3e6e8);border-radius:999px;font-size:9px;font-weight:850}
#${SECTION_ID} .result-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
#${SECTION_ID} .result-actions button{min-height:34px;padding:6px 9px;border-radius:9px;font-size:9px;font-weight:850}
#${SECTION_ID} .result-note,#${SECTION_ID} .result-empty,#${SECTION_ID} .result-unavailable{margin-top:8px;font-size:9px;line-height:1.45;color:var(--muted,#6b7176)}
#${DIALOG_ID}{width:min(620px,calc(100vw - 24px));max-height:min(820px,calc(100vh - 24px));border:1px solid var(--line,#e3e6e8);border-radius:18px;padding:0;background:var(--card,#fff);color:inherit;box-shadow:0 24px 72px rgba(0,0,0,.22)}
#${DIALOG_ID}::backdrop{background:rgba(0,0,0,.48)}
#${DIALOG_ID} .result-form{display:grid;gap:12px;padding:18px}
#${DIALOG_ID} .result-dialog-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
#${DIALOG_ID} .result-dialog-head h3{margin:0;font-size:17px;line-height:1.2}
#${DIALOG_ID} .result-dialog-item{margin-top:4px;font-size:10px;color:var(--muted,#6b7176)}
#${DIALOG_ID} label{display:grid;gap:5px;font-size:10px;font-weight:800}
#${DIALOG_ID} textarea,#${DIALOG_ID} input,#${DIALOG_ID} select{width:100%;box-sizing:border-box;border:1px solid var(--line,#d8dcdf);border-radius:10px;background:var(--card,#fff);color:inherit;padding:9px 10px;font:inherit}
#${DIALOG_ID} textarea{resize:vertical;min-height:72px}
#${DIALOG_ID} .result-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
#${DIALOG_ID} .result-check{display:flex;align-items:flex-start;gap:8px;font-weight:700}
#${DIALOG_ID} .result-check input{width:auto;margin-top:2px}
#${DIALOG_ID} .result-help,#${DIALOG_ID} .result-status{font-size:9px;line-height:1.45;color:var(--muted,#6b7176)}
#${DIALOG_ID} .result-status[data-state="error"]{color:#b42318;font-weight:800}
#${DIALOG_ID} .result-dialog-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
#${DIALOG_ID} .result-dialog-actions button{min-height:40px;border-radius:10px;padding:8px 12px;font-weight:800}
#${SECTION_ID} :focus-visible,#${DIALOG_ID} :focus-visible{outline:3px solid #fff;outline-offset:2px;box-shadow:0 0 0 6px #8f1d16}
@media(max-width:980px){#${SECTION_ID} .result-list{grid-template-columns:1fr 1fr}}
@media(max-width:680px){#${SECTION_ID} .result-list,#${DIALOG_ID} .result-grid{grid-template-columns:1fr}}
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
    section.setAttribute("aria-label","Experiment result review");
    section.setAttribute("aria-live","polite");
    const planner=q("#ownerDecisionExperimentPlanner",centre);
    const safeguard=q("#ownerDecisionSafeguardGate",centre);
    if(planner)planner.insertAdjacentElement("afterend",section);
    else if(safeguard)safeguard.insertAdjacentElement("afterend",section);
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

  function ensureDialog(){
    let dialog=document.getElementById(DIALOG_ID);
    if(dialog)return dialog;
    installStyles();
    dialog=document.createElement("dialog");
    dialog.id=DIALOG_ID;
    dialog.setAttribute("aria-labelledby","ownerExperimentResultTitle");
    const form=node("form",undefined,"result-form");
    form.noValidate=true;
    const head=node("div",undefined,"result-dialog-head");
    const copy=node("div");
    const title=node("h3","Record experiment result");title.id="ownerExperimentResultTitle";
    const item=node("div","","result-dialog-item");item.id="ownerExperimentResultItem";
    copy.append(title,item);
    head.append(copy,button("×",closeDialog,"btn soft"));

    const questionLabel=node("label");questionLabel.append(node("span","Experiment question / hypothesis"));
    const question=document.createElement("textarea");question.id="ownerExperimentResultQuestion";question.maxLength=280;question.required=true;questionLabel.append(question);
    const observedLabel=node("label");observedLabel.append(node("span","Observed evidence · facts only"));
    const observed=document.createElement("textarea");observed.id="ownerExperimentResultObserved";observed.maxLength=900;observed.required=true;observed.placeholder="What was actually observed? Keep interpretation out of this field.";observedLabel.append(observed);
    const sourceLabel=node("label");sourceLabel.append(node("span","Evidence source / reference"));
    const source=document.createElement("input");source.id="ownerExperimentResultSource";source.maxLength=240;source.placeholder="Report, dashboard, invoice set, dates, sample, etc.";sourceLabel.append(source);
    const periodLabel=node("label");periodLabel.append(node("span","Observation period"));
    const period=document.createElement("input");period.id="ownerExperimentResultPeriod";period.maxLength=180;period.placeholder="e.g. dates actually observed";periodLabel.append(period);
    const criteriaGrid=node("div",undefined,"result-grid");
    const continueLabel=node("label");continueLabel.append(node("span","Continue evidence defined before test"));
    const continueField=document.createElement("textarea");continueField.id="ownerExperimentResultContinue";continueField.maxLength=400;continueLabel.append(continueField);
    const stopLabel=node("label");stopLabel.append(node("span","Stop / revise evidence defined before test"));
    const stopField=document.createElement("textarea");stopField.id="ownerExperimentResultStop";stopField.maxLength=400;stopLabel.append(stopField);
    criteriaGrid.append(continueLabel,stopLabel);
    const predatedLabel=node("label",undefined,"result-check");
    const predated=document.createElement("input");predated.type="checkbox";predated.id="ownerExperimentResultPredated";
    predatedLabel.append(predated,node("span","I confirm the continue and stop/revise criteria above were defined before I reviewed the result."));
    const interpretationLabel=node("label");interpretationLabel.append(node("span","Owner interpretation · separate from observation"));
    const interpretation=document.createElement("textarea");interpretation.id="ownerExperimentResultInterpretation";interpretation.maxLength=500;interpretationLabel.append(interpretation);
    const assessmentLabel=node("label");assessmentLabel.append(node("span","Owner-confirmed result assessment"));
    const assessment=document.createElement("select");assessment.id="ownerExperimentResultAssessment";
    Object.entries(ASSESSMENTS).forEach(([value,label])=>{const option=document.createElement("option");option.value=value;option.textContent=label;assessment.append(option)});
    assessment.value="inconclusive";assessmentLabel.append(assessment);
    const help=node("div","Observed evidence is stored separately from interpretation. If criteria were not genuinely defined before reviewing the result, save the assessment as Inconclusive. This record is owner-confirmed context only; it does not prove causation, change the source record, or grant execution authority.","result-help");
    const status=node("div","","result-status");status.id="ownerExperimentResultStatus";status.setAttribute("role","status");
    const actions=node("div",undefined,"result-dialog-actions");
    actions.append(button("Cancel",closeDialog,"btn soft"));
    const save=button("Save result",()=>{},"btn alt");save.type="submit";save.id="ownerExperimentResultSave";actions.append(save);
    form.append(head,questionLabel,observedLabel,sourceLabel,periodLabel,criteriaGrid,predatedLabel,interpretationLabel,assessmentLabel,help,status,actions);
    form.addEventListener("submit",event=>{event.preventDefault();void saveResult()});
    dialog.addEventListener("cancel",event=>{event.preventDefault();closeDialog()});
    dialog.append(form);
    document.body.append(dialog);
    return dialog;
  }

  function closeDialog(){
    const dialog=document.getElementById(DIALOG_ID);
    dialogItem=null;dialogRecord=null;
    if(dialog?.open){try{dialog.close()}catch{dialog.removeAttribute("open")}}
  }
  function fillDialog(dialog,value={}){
    q("#ownerExperimentResultQuestion",dialog).value=clean(value.experimentQuestion,280);
    q("#ownerExperimentResultObserved",dialog).value=clean(value.observedEvidence,900);
    q("#ownerExperimentResultSource",dialog).value=clean(value.evidenceSource,240);
    q("#ownerExperimentResultPeriod",dialog).value=clean(value.observationPeriod,180);
    q("#ownerExperimentResultContinue",dialog).value=clean(value.continueCriterion,400);
    q("#ownerExperimentResultStop",dialog).value=clean(value.stopCriterion,400);
    q("#ownerExperimentResultPredated",dialog).checked=value.criteriaPredatedTest===true;
    q("#ownerExperimentResultInterpretation",dialog).value=clean(value.ownerInterpretation,500);
    const assessment=String(value.resultAssessment||"inconclusive");
    q("#ownerExperimentResultAssessment",dialog).value=Object.hasOwn(ASSESSMENTS,assessment)?assessment:"inconclusive";
  }
  function openDialog(item){
    if(!isOwner())return;
    dialogItem=item;dialogRecord=resultRecord(item);
    const dialog=ensureDialog();
    q("#ownerExperimentResultItem",dialog).textContent=clean(item?.title||item?.label||"Owner decision",220);
    q("#ownerExperimentResultTitle",dialog).textContent=dialogRecord?"Update experiment result":"Record experiment result";
    fillDialog(dialog,dialogRecord?.value||{});
    const status=q("#ownerExperimentResultStatus",dialog);
    status.textContent=dialogRecord?"Earlier owner-confirmed result loaded. Saving will supersede the active copy and preserve audit history.":"Record the observed evidence after the experiment was run manually.";
    status.dataset.state="ready";
    try{dialog.showModal()}catch{dialog.setAttribute("open","")}
    q("#ownerExperimentResultQuestion",dialog).focus();
  }

  async function saveResult(){
    const item=dialogItem,dialog=document.getElementById(DIALOG_ID);
    if(!item||!dialog||!isOwner())return;
    const key=resultKey(item);
    if(writeBusy.has(key))return;
    const question=clean(q("#ownerExperimentResultQuestion",dialog).value,280);
    const observed=clean(q("#ownerExperimentResultObserved",dialog).value,900);
    const evidenceSource=clean(q("#ownerExperimentResultSource",dialog).value,240)||null;
    const observationPeriod=clean(q("#ownerExperimentResultPeriod",dialog).value,180)||null;
    const continueCriterion=clean(q("#ownerExperimentResultContinue",dialog).value,400)||null;
    const stopCriterion=clean(q("#ownerExperimentResultStop",dialog).value,400)||null;
    const criteriaPredatedTest=q("#ownerExperimentResultPredated",dialog).checked===true;
    const ownerInterpretation=clean(q("#ownerExperimentResultInterpretation",dialog).value,500)||null;
    const requestedAssessment=String(q("#ownerExperimentResultAssessment",dialog).value||"inconclusive");
    const status=q("#ownerExperimentResultStatus",dialog),save=q("#ownerExperimentResultSave",dialog);
    if(question.length<3||observed.length<3){status.textContent="Add the experiment question and observed evidence before saving.";status.dataset.state="error";return}
    if(!Object.hasOwn(ASSESSMENTS,requestedAssessment)){status.textContent="Choose a valid owner assessment.";status.dataset.state="error";return}
    const criteriaComplete=Boolean(criteriaPredatedTest&&continueCriterion&&stopCriterion);
    if(requestedAssessment!=="inconclusive"&&!criteriaComplete){
      status.textContent="Without confirmed pre-defined continue and stop/revise criteria, the saved assessment must remain Inconclusive.";
      status.dataset.state="error";
      return;
    }
    writeBusy.add(key);save.disabled=true;status.textContent="Saving owner-confirmed experiment evidence…";status.dataset.state="loading";
    const spec=experimentSpec(item);
    try{
      await apiJson("/api/business-memory",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({
          namespace:"operations",
          key,
          value:{
            kind:"owner_experiment_result",
            version:1,
            sourceKey:sourceKey(item),
            sourceType:clean(spec.sourceType||item?.sourceType||item?.kind||"owner_attention",80),
            sourceId:clean(item?.sourceId||item?.id||"",160)||null,
            title:clean(spec.title||item?.title||item?.label||"Owner decision",220),
            experimentQuestion:question,
            observedEvidence:observed,
            evidenceSource,
            observationPeriod,
            criteriaPredatedTest,
            continueCriterion,
            stopCriterion,
            ownerInterpretation,
            resultAssessment:criteriaComplete?requestedAssessment:"inconclusive",
            recordedAt:new Date().toISOString(),
            authoritative:false,
            authority:"context_only_no_execution"
          }
        })
      });
      status.textContent="Experiment result saved. No business record or action was changed.";
      status.dataset.state="ready";
      await refresh(true);
      global.setTimeout(closeDialog,450);
    }catch{
      status.textContent="Experiment result could not be saved. No business state was changed.";
      status.dataset.state="error";
    }finally{writeBusy.delete(key);save.disabled=false}
  }

  function reviewPrompt(record){
    const value=record?.value||{};
    const criteria=value.criteriaPredatedTest===true&&value.continueCriterion&&value.stopCriterion
      ?`Pre-defined continue evidence: ${clean(value.continueCriterion,400)}. Pre-defined stop/revise evidence: ${clean(value.stopCriterion,400)}.`
      :"Pre-defined criteria are incomplete or were not confirmed as existing before result review; treat the result as inconclusive.";
    return `Review this owner-confirmed experiment result using current verified business context. Decision: “${clean(value.title,220)}”. Experiment question: ${clean(value.experimentQuestion,280)}. Observed evidence only: ${clean(value.observedEvidence,900)}. Evidence source: ${clean(value.evidenceSource,240)||"not recorded"}. Observation period: ${clean(value.observationPeriod,180)||"not recorded"}. ${criteria} Owner interpretation, which must remain separate from observation: ${clean(value.ownerInterpretation,500)||"not recorded"}. Owner-confirmed assessment: ${ASSESSMENTS[value.resultAssessment]||"Inconclusive"}. Determine whether the observed evidence actually satisfies the pre-defined continue criterion, the stop/revise criterion, both, or neither. If source quality, observation period, sample, or criteria are insufficient, say clearly that the result is inconclusive. Do not convert correlation into causation. Do not alter the saved assessment or any business record. Do not execute, approve, pay, file, send, contact, or schedule anything.`;
  }
  function reviewResult(record){
    if(!isOwner()||!record)return false;
    return setDockPrompt(reviewPrompt(record));
  }

  function decisionItems(snapshot){
    const items=Array.isArray(snapshot?.items)?snapshot.items:[];
    return items.filter(item=>classify(item)==="decision");
  }
  function itemCard(item){
    const spec=experimentSpec(item),record=resultRecord(item),value=record?.value||{};
    const card=node("article",undefined,"result-card");
    card.append(node("h5",spec.title));
    if(record){
      card.append(node("p",`Observed: ${clean(value.observedEvidence,220)}`));
      const badges=node("div",undefined,"result-badges");
      badges.append(node("span",ASSESSMENTS[value.resultAssessment]||"Inconclusive","result-badge"));
      badges.append(node("span",value.criteriaPredatedTest===true?"Pre-defined criteria confirmed":"Criteria not confirmed before review","result-badge"));
      card.append(badges);
    }else{
      if(spec.currentSummary)card.append(node("p",spec.currentSummary.slice(0,180)));
      const badges=node("div",undefined,"result-badges");badges.append(node("span","No owner-confirmed result yet","result-badge"));card.append(badges);
    }
    const actions=node("div",undefined,"result-actions");
    actions.append(button(record?"Edit result":"Record result",()=>openDialog(item),"btn alt"));
    if(record)actions.append(button("Review evidence",()=>reviewResult(record),"btn soft"));
    card.append(actions);
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
    const head=node("div",undefined,"result-head");
    const copy=node("div");
    copy.append(node("div","Experiment result review","section-eyebrow"),node("h4","Separate what happened from what it means"),node("div","Record owner-confirmed observed evidence after a manual test, compare it with criteria defined before the result was reviewed, and keep inconclusive evidence visibly inconclusive.","result-meta"));
    head.append(copy);section.append(head);
    if(state!=="ready"){
      section.append(node("div","Canonical decision data is not verified, so Result Review will not attach experiment evidence to a decision.","result-unavailable"));
      return;
    }
    const decisions=decisionItems(snapshot);
    if(!decisions.length){section.append(node("div","No verified owner decision is currently available for experiment result review.","result-empty"));return}
    const list=node("div",undefined,"result-list");
    decisions.slice(0,3).forEach(item=>list.append(itemCard(item)));
    section.append(list);
    if(decisions.length>3)section.append(node("div",`${decisions.length-3} more verified owner decisions are available in the canonical queue.`,"result-empty"));
    section.append(node("div","Result Review writes only owner-confirmed, audited business-memory context. Observations and interpretations are stored separately. Results are descriptive evidence, not causal proof, and never grant execution authority.","result-note"));
  }

  async function refresh(force=false){
    if(!isOwner())return;
    if(refreshBusy&&!force)return;
    if(refreshBusy)return;
    refreshBusy=true;
    try{
      const payload=await apiJson("/api/business-memory");
      const rows=Array.isArray(payload?.items)?payload.items:[];
      resultRows=rows.filter(row=>row?.namespace==="operations"&&row?.value?.kind==="owner_experiment_result");
      render();
    }catch{
      const section=ensureSection();
      if(section)section.replaceChildren(node("div","Experiment Result Review is temporarily unavailable. No business state was changed.","result-unavailable"));
    }finally{refreshBusy=false}
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    global.setTimeout(()=>void refresh(),160);
  }
  function boot(){
    schedule();
    [900,2300].forEach(delay=>global.setTimeout(schedule,delay));
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

  global.ThebeOwnerExperimentResultReview=Object.freeze({
    release:RELEASE,
    refresh:schedule,
    reviewResult,
    resultKey,
    sourceKey,
    assessments:ASSESSMENTS
  });
})(window);