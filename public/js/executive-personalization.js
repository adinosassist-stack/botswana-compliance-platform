(function loadExecutivePersonalizationBundle(global){
  "use strict";

  // Preserve the exact v180 personalization core, then layer the current governed
  // operator telemetry and Owner Attention surfaces without widening authority.
  const RELEASE="20260929-v180";
  const AGENT_TELEMETRY_RELEASE="20261002-v261-agent-operator-telemetry";
  const TELEMETRY_TTL_MS=30000;
  const LEGACY_CONTRACT=Object.freeze({
    roleFraming:Object.freeze(["Management priority today","Your priority today"]),
    actionSelector:"#ownerActionPanel .owner-action-list .owner-action",
    actionHandoff:"action.sourceButton.click()",
    ownerRevenueGate:'isOwner()&&revenueText.includes("no monthly target projection yet")',
    ownerCashGate:'isOwner()&&cashText.includes("Not configured")',
    ownerLabourGate:'isOwner()&&labourText.includes("Not configured")',
    reportingEvidence:'revenueText.includes("needs more reporting history")',
    salesEvidence:'salesText.includes("Record enough resolved quotations")'
  });
  const scripts=[
    "/js/executive-personalization-v180.js?v=20260929-v180",
    "/js/owner-first-home-v328.js?v=20261015-owner-decision-memory-v330",
    "/js/owner-decision-follow-through-v331.js?v=20261015-owner-decision-follow-through-v331",
    "/js/owner-decision-outcome-learning-v332.js?v=20261015-owner-decision-outcome-learning-v332",
    "/js/owner-decision-recommendation-calibration-v333.js?v=20261015-owner-decision-recommendation-calibration-v333"
  ];
  const q=(selector,root=document)=>root.querySelector(selector);
  let telemetryBusy=false;
  let telemetryLoadedAt=0;
  let telemetryScheduled=false;
  let telemetryObserver=null;

  function role(){
    try{return String(global.currentWorkspaceRole?.()||global.currentUser?.role||"").toLowerCase()}
    catch{return ""}
  }
  function canView(){return ["owner","manager"].includes(role())}
  function text(tag,value,className=""){
    const node=document.createElement(tag);
    if(className)node.className=className;
    node.textContent=String(value??"");
    return node;
  }
  function request(url,options={}){
    if(typeof global.apiJson!=="function")throw new Error("The secure Thebe API transport is not available.");
    return global.apiJson(url,options);
  }

  function load(src){
    return new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src=src;
      script.async=false;
      script.dataset.thebeExecutiveBundle="true";
      script.addEventListener("load",resolve,{once:true});
      script.addEventListener("error",()=>reject(new Error(`Failed to load ${src}`)),{once:true});
      document.head.append(script);
    });
  }

  function ensureAgentTelemetryShell(centre){
    const agentic=q("#ownerAgenticPanel",centre);
    if(!agentic)return null;
    let shell=q("#ownerAgentOperatorTelemetry",agentic);
    if(shell)return shell;
    shell=document.createElement("details");
    shell.id="ownerAgentOperatorTelemetry";
    shell.className="owner-agentic-boundary";
    shell.dataset.release=AGENT_TELEMETRY_RELEASE;
    shell.style.display="block";
    shell.style.marginTop="12px";
    const summary=document.createElement("summary");
    summary.id="ownerAgentOperatorTelemetrySummary";
    summary.style.cursor="pointer";
    summary.style.fontWeight="700";
    summary.textContent="Agent activity & cost · loading";
    const body=document.createElement("div");
    body.id="ownerAgentOperatorTelemetryBody";
    body.style.marginTop="10px";
    shell.append(summary,body);
    const agenticBody=q("#ownerAgenticBody",agentic);
    if(agenticBody)agentic.insertBefore(shell,agenticBody);
    else agentic.append(shell);
    return shell;
  }

  function telemetryMetric(label,value,detail=""){
    const node=document.createElement("div");
    node.className="metricmini";
    node.style.minWidth="0";
    node.append(text("div",label,"kpi"),text("div",value,"score"));
    const score=q(".score",node);
    if(score){score.style.fontSize="22px";score.style.lineHeight="1.1"}
    if(detail)node.append(text("div",detail,"muted small"));
    return node;
  }

  function renderAgentTelemetry(centre,payload){
    const shell=ensureAgentTelemetryShell(centre);
    if(!shell)return;
    const summary=q("#ownerAgentOperatorTelemetrySummary",shell);
    const body=q("#ownerAgentOperatorTelemetryBody",shell);
    const telemetry=payload?.telemetry;
    if(!telemetry?.available){
      if(summary)summary.textContent="Agent activity & cost · unavailable";
      if(body)body.replaceChildren(text("div","Telemetry could not be read securely. No authority or execution state was changed.","muted small"));
      return;
    }
    const objectives=telemetry.persistentObjectives||{};
    const observations=telemetry.observations||{};
    const planning=telemetry.planning||{};
    const approvals=telemetry.approvals||{};
    const execution=telemetry.execution||{};
    const boundary=telemetry.authorityBoundary||{};
    if(summary){
      summary.textContent=`Agent activity & cost · ${Number(objectives.active||0)} active goal${Number(objectives.active||0)===1?"":"s"} · ${Number(observations.total7d||0)} checks / 7d · ${Number(execution.verifiedSucceeded30d||0)} verified task${Number(execution.verifiedSucceeded30d||0)===1?"":"s"} / 30d`;
    }
    if(!body)return;
    const grid=document.createElement("div");
    grid.style.display="grid";
    grid.style.gridTemplateColumns="repeat(auto-fit,minmax(150px,1fr))";
    grid.style.gap="8px";
    const success=observations.successRatePct==null?"—":`${Number(observations.successRatePct).toFixed(Number(observations.successRatePct)%1?1:0)}%`;
    grid.append(
      telemetryMetric("Persistent goals",String(Number(objectives.active||0)),`${Number(objectives.paused||0)} paused · ${Number(objectives.completed||0)} completed`),
      telemetryMetric("Checks · 7 days",String(Number(observations.total7d||0)),`${success} settled success · ${Number(observations.failed7d||0)} failed`),
      telemetryMetric("Governed plans · 7 days",String(Number(planning.runs7d||0)),`${Number(planning.governedAiRuns7d||0)} AI · ${Number(planning.deterministicFallbackRuns7d||0)} deterministic fallback`),
      telemetryMetric("Owner review",String(Number(approvals.prepared||0)),`${Number(approvals.approvedAwaitingExecution||0)} approved awaiting execution`),
      telemetryMetric("Verified execution · 30 days",String(Number(execution.verifiedSucceeded30d||0)),`${Number(execution.activeGrants||0)} active bounded grant${Number(execution.activeGrants||0)===1?"":"s"}`),
      telemetryMetric("Provider cost","Not metered","No token/provider pula estimate is invented until authoritative provider usage is recorded")
    );
    const policy=document.createElement("div");
    policy.className=Number(boundary.externalActionBudgetViolations||0)>0?"notice bad":"muted small";
    policy.style.marginTop="8px";
    policy.textContent=Number(boundary.externalActionBudgetViolations||0)>0
      ?`${Number(boundary.externalActionBudgetViolations)} active goal budget(s) conflict with the zero-external-action boundary.`
      :`Read-only telemetry · ${Number(objectives.configuredReadCeilingPerRun||0)} configured tool-call ceiling across active goals · cannot mutate state or grant authority.`;
    body.replaceChildren(grid,policy);
  }

  async function refreshAgentTelemetry(centre,{force=false}={}){
    if(!centre||!canView())return;
    ensureAgentTelemetryShell(centre);
    if(telemetryBusy)return;
    if(!force&&Date.now()-telemetryLoadedAt<TELEMETRY_TTL_MS)return;
    telemetryBusy=true;
    try{
      const payload=await request("/api/agentic/control-plane/operator-telemetry");
      telemetryLoadedAt=Date.now();
      renderAgentTelemetry(centre,payload);
    }catch{
      telemetryLoadedAt=Date.now();
      renderAgentTelemetry(centre,{telemetry:{available:false}});
    }finally{
      telemetryBusy=false;
    }
  }

  function runTelemetry(){
    telemetryScheduled=false;
    const centre=q("#ownerCommandCentre");
    if(!centre||!canView()||centre.hidden)return;
    void refreshAgentTelemetry(centre);
  }
  function scheduleTelemetry(){
    if(telemetryScheduled)return;
    telemetryScheduled=true;
    global.setTimeout(runTelemetry,40);
  }
  function bootTelemetry(){
    scheduleTelemetry();
    if(!telemetryObserver){
      const root=q("#homeDecisionCenter")||document.body;
      telemetryObserver=new MutationObserver(scheduleTelemetry);
      telemetryObserver.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:["class","hidden"]});
    }
    document.addEventListener("change",event=>{
      if(event.target?.id==="companySelect"){
        telemetryLoadedAt=0;
        global.setTimeout(scheduleTelemetry,550);
      }
    });
    global.addEventListener?.("thebe:persistent-objective-state",()=>{
      telemetryLoadedAt=0;
      const centre=q("#ownerCommandCentre");
      if(centre)void refreshAgentTelemetry(centre,{force:true});
    });
  }

  global.ThebeExecutivePersonalizationBundle=Object.freeze({
    release:RELEASE,
    telemetryRelease:AGENT_TELEMETRY_RELEASE,
    legacyContract:LEGACY_CONTRACT,
    layers:Object.freeze(scripts.slice()),
    refreshAgentTelemetry:()=>{
      telemetryLoadedAt=0;
      const centre=q("#ownerCommandCentre");
      return centre?refreshAgentTelemetry(centre,{force:true}):Promise.resolve();
    }
  });

  scripts.reduce((chain,src)=>chain.then(()=>load(src)),Promise.resolve())
    .then(()=>bootTelemetry())
    .catch(error=>{
      console.error("[Thebe] executive personalization bundle unavailable",error);
    });
})(window);