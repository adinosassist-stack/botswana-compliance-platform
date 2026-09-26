(function initExecutivePersonalization(global){
  "use strict";

  const RELEASE="20260926-v161";
  const q=(selector,root=document)=>root.querySelector(selector);
  const qa=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
  let scheduled=false;

  function role(){
    try{return String(global.currentWorkspaceRole?.()||global.currentUser?.role||"").toLowerCase()}
    catch{return ""}
  }

  function canView(){return ["owner","manager"].includes(role())}
  function isOwner(){return role()==="owner"}

  function text(tag,value,className=""){
    const node=document.createElement(tag);
    if(className)node.className=className;
    node.textContent=String(value??"");
    return node;
  }

  function button(label,handler,className="btn soft"){
    const node=document.createElement("button");
    node.type="button";
    node.className=className;
    node.textContent=label;
    node.addEventListener("click",handler);
    return node;
  }

  function route(view){
    try{if(typeof global.showView==="function")global.showView(view)}catch{}
  }

  function openDetails(selector){
    const details=q(selector);
    if(!details)return;
    details.open=true;
    details.scrollIntoView({behavior:"smooth",block:"center"});
  }

  function ensurePriorityShell(centre){
    let shell=q("#ownerDailyPriority",centre);
    if(shell)return shell;
    shell=document.createElement("section");
    shell.id="ownerDailyPriority";
    shell.className="owner-daily-priority";
    shell.setAttribute("aria-live","polite");
    shell.dataset.release=RELEASE;
    const summary=q("#ownerCommandSummary",centre);
    summary?.insertAdjacentElement("afterend",shell);
    return shell;
  }

  function ensureOnboardingShell(centre){
    let shell=q("#ownerOnboardingNext",centre);
    if(shell)return shell;
    shell=document.createElement("section");
    shell.id="ownerOnboardingNext";
    shell.className="owner-onboarding-next";
    const sources=q("#ownerSourceNote",centre);
    sources?.insertAdjacentElement("afterend",shell);
    return shell;
  }

  function visibleEvidenceCount(centre){
    return qa("#ownerSourceNote .owner-source-pill",centre).filter(node=>!node.hidden).length;
  }

  function firstActionData(centre){
    const row=q("#ownerActionPanel .owner-action-list .owner-action",centre);
    if(!row)return null;
    const title=q(".owner-action-copy b",row)?.textContent?.trim()||"";
    const detail=q(".owner-action-copy span",row)?.textContent?.trim()||"";
    const sourceButton=q("button",row);
    if(!title)return null;
    return {row,title,detail,sourceButton};
  }

  function strongestRisk(centre){
    const card=q('#ownerSignalList .owner-signal[data-tone="risk"]',centre);
    if(!card)return null;
    return {
      label:q(".owner-signal-label",card)?.textContent?.trim()||"Business signal",
      title:q("h4",card)?.textContent?.trim()||"",
      value:q(".owner-signal-value",card)?.textContent?.trim()||""
    };
  }

  function renderDailyPriority(centre){
    const shell=ensurePriorityShell(centre);
    if(!shell)return;
    const action=firstActionData(centre);
    if(!action){
      if(!shell.hidden)shell.hidden=true;
      shell.dataset.signature="";
      shell._thebeActionRow=null;
      return;
    }

    const risk=strongestRisk(centre);
    const evidence=visibleEvidenceCount(centre);
    const actionLabel=action.sourceButton?.textContent?.trim()||"";
    const signature=[
      role(),action.title,action.detail,actionLabel,evidence,
      risk?.label||"",risk?.value||"",risk?.title||""
    ].join("|");
    const needsRender=shell.dataset.signature!==signature||shell._thebeActionRow!==action.row;

    if(needsRender){
      shell.replaceChildren();
      const meta=document.createElement("div");
      meta.className="owner-daily-priority-meta";
      meta.append(
        text("span",role()==="manager"?"Management priority today":"Your priority today","section-eyebrow"),
        text("span",risk?"Needs attention":"Next best action","owner-priority-chip")
      );

      const copy=document.createElement("div");
      copy.className="owner-daily-priority-copy";
      copy.append(text("h4",action.title),text("p",action.detail,"muted"));
      if(risk?.title){
        copy.append(text(
          "div",
          `${risk.label}${risk.value?` · ${risk.value}`:""}: ${risk.title}`,
          "owner-priority-reason"
        ));
      }

      const controls=document.createElement("div");
      controls.className="owner-daily-priority-controls";
      if(action.sourceButton){
        controls.append(button(
          actionLabel||"Open action",
          ()=>action.sourceButton.click(),
          "btn"
        ));
      }
      controls.append(text(
        "span",
        evidence?`Based on ${evidence} visible source${evidence===1?"":"s"}.`:"Evidence is still building.",
        "owner-priority-evidence"
      ));

      shell.append(meta,copy,controls);
      shell.dataset.signature=signature;
      shell._thebeActionRow=action.row;
    }
    if(shell.hidden)shell.hidden=false;
    centre.classList.add("executive-personalized");

    const panel=q("#ownerActionPanel",centre);
    const totalActions=qa(".owner-action-list .owner-action",panel).length;
    panel?.classList.toggle("owner-action-panel-exhausted",totalActions<=1);
    const heading=q(".owner-panel-head h4",panel);
    if(heading&&totalActions>1&&heading.textContent!=="Next best actions")heading.textContent="Next best actions";
    const badge=q(".owner-panel-head .badge",panel);
    if(badge&&totalActions>1&&badge.textContent!=="Up next")badge.textContent="Up next";
  }

  function signalByLabel(centre,label){
    return qa("#ownerSignalList .owner-signal",centre).find(card=>
      q(".owner-signal-label",card)?.textContent?.trim()===label
    )||null;
  }

  function cardText(card){return String(card?.textContent||"").replace(/\s+/g," ").trim()}

  function nextOnboardingStep(centre){
    const revenue=signalByLabel(centre,"Revenue pace");
    const sales=signalByLabel(centre,"Sales conversion");
    const cash=signalByLabel(centre,"Cash buffer");
    const labour=signalByLabel(centre,"Labour cost");
    const revenueText=cardText(revenue);
    const salesText=cardText(sales);
    const cashText=cardText(cash);
    const labourText=cardText(labour);

    if(revenueText.includes("needs more reporting history")){
      return {
        title:"Build a reliable operating baseline",
        detail:"Add at least three days of daily reporting so Thebe can compare current performance with a learned baseline instead of guessing.",
        label:"Open daily reports",
        action:()=>route("dailyreports")
      };
    }

    if(isOwner()&&revenueText.includes("no monthly target projection yet")){
      return {
        title:"Add your monthly revenue target",
        detail:"A target plus operating days lets Thebe turn reported revenue into an owner-level run-rate and gap analysis.",
        label:"Set business targets",
        action:()=>openDetails("#ownerDecisionInputs")
      };
    }

    if(isOwner()&&cashText.includes("Not configured")){
      return {
        title:"Unlock cash-buffer warnings",
        detail:"Add current cash, monthly outflows and your minimum buffer. Thebe will keep the result clearly labelled as a scenario until authoritative accounting data is connected.",
        label:"Add cash assumptions",
        action:()=>openDetails("#ownerDecisionInputs")
      };
    }

    if(sales&&salesText.includes("Record enough resolved quotations")){
      return {
        title:"Teach Thebe your sales conversion",
        detail:"Record won/lost quotations so Thebe can compare conversion by location and detect commercial deterioration from real outcomes.",
        label:"Open sales intelligence",
        action:()=>openDetails("#ownerSalesWorkspace")
      };
    }

    if(isOwner()&&labourText.includes("Not configured")){
      return {
        title:"Add monthly labour cost",
        detail:"This unlocks a company-level labour-cost pressure ratio against projected revenue without scoring individual employees.",
        label:"Add labour assumption",
        action:()=>openDetails("#ownerDecisionInputs")
      };
    }

    return null;
  }

  function renderOnboarding(centre){
    const shell=ensureOnboardingShell(centre);
    if(!shell)return;
    const step=nextOnboardingStep(centre);
    if(!step){
      if(!shell.hidden)shell.hidden=true;
      shell.dataset.signature="";
      return;
    }

    const signature=[role(),step.title,step.detail,step.label].join("|");
    if(shell.dataset.signature!==signature){
      shell.replaceChildren();
      const copy=document.createElement("div");
      copy.className="owner-onboarding-copy";
      copy.append(
        text("div","Make tomorrow's brief smarter","section-eyebrow"),
        text("h4",step.title),
        text("p",step.detail,"muted")
      );
      shell.append(copy,button(step.label,step.action,"btn soft"));
      shell.dataset.signature=signature;
    }
    if(shell.hidden)shell.hidden=false;
  }

  function enhance(){
    scheduled=false;
    const centre=q("#ownerCommandCentre");
    if(!centre||!canView()||centre.hidden)return;
    renderDailyPriority(centre);
    renderOnboarding(centre);
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    setTimeout(enhance,40);
  }

  function boot(){
    schedule();
    const root=q("#homeDecisionCenter")||document.body;
    new MutationObserver(schedule).observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:["class","hidden"]});
    document.addEventListener("change",event=>{
      if(event.target?.id==="companySelect")setTimeout(schedule,550);
    });
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();

  global.ThebeExecutivePersonalization=Object.freeze({release:RELEASE,refresh:schedule});
})(window);
