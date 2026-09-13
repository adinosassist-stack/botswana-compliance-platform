(function initOwnerCommandCentre(global){
  "use strict";
  const RELEASE="20260913a";
  const PROFILE_KEYS=Object.freeze({
    monthlyRevenueTargetBwp:"decisionMonthlyRevenueTargetBwp",
    currentCashBwp:"decisionCurrentCashBwp",
    minimumCashBufferBwp:"decisionMinimumCashBufferBwp",
    monthlyCashOutflowsBwp:"decisionMonthlyCashOutflowsBwp",
    monthlyLabourCostBwp:"decisionMonthlyLabourCostBwp",
    plannedPurchaseBwp:"decisionPlannedPurchaseBwp",
    operatingDaysPerMonth:"decisionOperatingDaysPerMonth",
    plannedPurchaseLabel:"decisionPlannedPurchaseLabel"
  });
  let latestStateEnvelope=null;
  let renderSeq=0;

  const q=(s,root=document)=>root.querySelector(s);
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const money=v=>`P${Math.round(Number(v||0)).toLocaleString()}`;
  const pct=v=>`${Math.abs(Number(v||0)).toFixed(Math.abs(Number(v||0))>=10?0:1)}%`;
  const role=()=>{try{return String(global.currentWorkspaceRole?.()||global.currentUser?.role||"").toLowerCase()}catch{return ""}};
  const canView=()=>["owner","manager"].includes(role());
  const canEdit=()=>role()==="owner";
  const gaboroneDate=()=>{try{return new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Gaborone",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}catch{return new Date().toISOString().slice(0,10)}};
  const text=(tag,value,className)=>{const node=document.createElement(tag);if(className)node.className=className;node.textContent=String(value??"");return node};
  const button=(label,fn,className="btn soft")=>{const b=document.createElement("button");b.type="button";b.className=className;b.textContent=label;b.addEventListener("click",fn);return b};
  const route=view=>{try{if(typeof global.showView==="function")global.showView(view)}catch{}};
  const request=(url,options={})=>{
    if(typeof global.apiJson!=="function")throw new Error("The secure Thebe API transport is not available.");
    return global.apiJson(url,options);
  };

  function activeCompanyFromState(state){
    const companies=Array.isArray(state?.companies)?state.companies:[];
    const activeId=String(state?.activeCompanyId||"");
    return companies.find(c=>String(c?.id||"")===activeId)||companies[0]||null;
  }
  function decisionInputs(state){
    const company=activeCompanyFromState(state),profile=(company?.profile&&typeof company.profile==="object")?company.profile:((state?.profile&&typeof state.profile==="object")?state.profile:{});
    return {
      company,profile,
      monthlyRevenueTargetBwp:num(profile[PROFILE_KEYS.monthlyRevenueTargetBwp]),
      currentCashBwp:num(profile[PROFILE_KEYS.currentCashBwp]),
      minimumCashBufferBwp:num(profile[PROFILE_KEYS.minimumCashBufferBwp]),
      monthlyCashOutflowsBwp:num(profile[PROFILE_KEYS.monthlyCashOutflowsBwp]),
      monthlyLabourCostBwp:num(profile[PROFILE_KEYS.monthlyLabourCostBwp]),
      plannedPurchaseBwp:num(profile[PROFILE_KEYS.plannedPurchaseBwp]),
      operatingDaysPerMonth:num(profile[PROFILE_KEYS.operatingDaysPerMonth]),
      plannedPurchaseLabel:String(profile[PROFILE_KEYS.plannedPurchaseLabel]||"planned purchase").trim().slice(0,80)||"planned purchase"
    };
  }
  function ratioChange(current,baseline){const c=Number(current||0),b=Number(baseline||0);return b>0?(c-b)/b*100:null}
  function branchSignal(performance){
    const scopes=Array.isArray(performance?.scopes)?performance.scopes:[],candidates=[];
    for(const scope of scopes){
      const p=scope?.profile||{},locationId=p.locationId;if(!locationId||Number(p.sampleDays||0)<3)continue;
      const b7=p.baseline7||{},b30=p.baseline30||{},revenueChange=ratioChange(b7.revenue,b30.revenue),customerChange=ratioChange(b7.customers,b30.customers);
      const score=revenueChange??customerChange;if(score===null)continue;
      candidates.push({locationId,locationName:p.locationName||"Location",sampleDays:Number(p.sampleDays||0),revenue7:Number(b7.revenue||0),revenue30:Number(b30.revenue||0),customer7:Number(b7.customers||0),customer30:Number(b30.customers||0),revenueChange,customerChange,score});
    }
    return candidates.sort((a,b)=>a.score-b.score)[0]||null;
  }
  function deriveModel(performance,inputs,date){
    const selected=performance?.selected||{},profile=selected.profile||{},baseline30=profile.baseline30||{},sampleDays=Number(profile.sampleDays||0),dailyReportedRevenue=Number(baseline30.revenue||0);
    const operatingDays=inputs.operatingDaysPerMonth&&inputs.operatingDaysPerMonth>=1?clamp(Math.round(inputs.operatingDaysPerMonth),1,31):null;
    const projectedMonthlyRevenue=sampleDays>=3&&dailyReportedRevenue>0&&operatingDays?dailyReportedRevenue*operatingDays:null;
    const target=inputs.monthlyRevenueTargetBwp&&inputs.monthlyRevenueTargetBwp>0?inputs.monthlyRevenueTargetBwp:null;
    const targetGapPct=projectedMonthlyRevenue!==null&&target?((target-projectedMonthlyRevenue)/target*100):null;
    const targetGapBwp=projectedMonthlyRevenue!==null&&target?target-projectedMonthlyRevenue:null;
    const labour=inputs.monthlyLabourCostBwp&&inputs.monthlyLabourCostBwp>=0?inputs.monthlyLabourCostBwp:null;
    const labourShare=projectedMonthlyRevenue&&labour!==null?labour/projectedMonthlyRevenue*100:null;
    const currentCash=inputs.currentCashBwp!==null&&inputs.currentCashBwp>=0?inputs.currentCashBwp:null;
    const cashFloor=inputs.minimumCashBufferBwp!==null&&inputs.minimumCashBufferBwp>=0?inputs.minimumCashBufferBwp:null;
    const outflows=inputs.monthlyCashOutflowsBwp!==null&&inputs.monthlyCashOutflowsBwp>=0?inputs.monthlyCashOutflowsBwp:null;
    const purchase=inputs.plannedPurchaseBwp!==null&&inputs.plannedPurchaseBwp>=0?inputs.plannedPurchaseBwp:null;
    const monthEndBefore=currentCash!==null&&projectedMonthlyRevenue!==null&&outflows!==null?currentCash+projectedMonthlyRevenue-outflows-(purchase||0):null;
    const monthEndAfter=monthEndBefore!==null&&purchase?monthEndBefore+purchase:monthEndBefore;
    const monthlyBurn=projectedMonthlyRevenue!==null&&outflows!==null?outflows-projectedMonthlyRevenue:null;
    const daysToBuffer=currentCash!==null&&cashFloor!==null&&monthlyBurn!==null&&monthlyBurn>0?Math.max(0,(currentCash-cashFloor)/(monthlyBurn/30)):null;
    return {date,sampleDays,dailyReportedRevenue,operatingDays,projectedMonthlyRevenue,target,targetGapPct,targetGapBwp,labour,labourShare,currentCash,cashFloor,outflows,purchase,monthEndBefore,monthEndAfter,monthlyBurn,daysToBuffer,branch:branchSignal(performance)};
  }

  function createShell(){
    const parent=q("#homeDecisionCenter");if(!parent)return null;
    let shell=q("#ownerCommandCentre");if(shell)return shell;
    shell=document.createElement("section");shell.id="ownerCommandCentre";shell.className="owner-command-centre";shell.setAttribute("aria-labelledby","ownerCommandTitle");shell.dataset.release=RELEASE;
    const head=document.createElement("div");head.className="owner-command-head";
    const copy=document.createElement("div");copy.append(text("div","Business owner brief","section-eyebrow"));const h=text("h3","What needs your attention today");h.id="ownerCommandTitle";copy.append(h,text("p","Thebe connects reported performance, learned baselines and your business targets so the first screen explains what changed, why it matters and what to do next.","muted"));
    head.append(copy,button("Refresh brief",()=>renderOwnerBrief(true),"btn alt"));shell.append(head);
    const summary=text("div","Building your business brief…","owner-command-summary");summary.id="ownerCommandSummary";shell.append(summary);
    const sources=document.createElement("div");sources.className="owner-source-note";sources.id="ownerSourceNote";shell.append(sources);
    const signals=document.createElement("div");signals.className="owner-signal-list";signals.id="ownerSignalList";shell.append(signals);
    const grid=document.createElement("div");grid.className="owner-decision-grid";
    const actions=document.createElement("section");actions.className="owner-panel";actions.id="ownerActionPanel";const sim=document.createElement("section");sim.className="owner-panel owner-sim-card";sim.id="ownerSimulationPanel";grid.append(actions,sim);shell.append(grid);
    const settings=document.createElement("details");settings.className="owner-inputs";settings.id="ownerDecisionInputs";const summaryEl=text("summary","Business targets & scenario assumptions");settings.append(summaryEl);const body=document.createElement("div");body.className="owner-inputs-body";body.id="ownerInputsBody";settings.append(body);shell.append(settings);
    const anchor=q(".home-status-strip",parent);parent.insertBefore(shell,anchor||null);return shell;
  }
  function sourcePill(label,kind){const span=text("span",label,`owner-source-pill ${kind||""}`);return span}
  function renderSources(model,inputs){const box=q("#ownerSourceNote");if(!box)return;box.replaceChildren();box.append(sourcePill(`${model.sampleDays} historical reporting day${model.sampleDays===1?"":"s"}`,"reported"));if(model.branch)box.append(sourcePill("Location baselines","reported"));if([inputs.monthlyRevenueTargetBwp,inputs.currentCashBwp,inputs.monthlyCashOutflowsBwp,inputs.monthlyLabourCostBwp].some(v=>v!==null))box.append(sourcePill("Owner-entered financial assumptions","input"));if(model.projectedMonthlyRevenue!==null)box.append(sourcePill("Transparent Thebe projection","estimate"))}
  function signalCard({label,value,title,detail,tone="neutral",actionLabel,action}){const card=document.createElement("article");card.className="owner-signal";card.dataset.tone=tone;const top=document.createElement("div");top.className="owner-signal-top";top.append(text("span",label,"owner-signal-label"),text("span",value,"owner-signal-value"));card.append(top,text("h4",title),text("p",detail));if(actionLabel&&action)card.append(button(actionLabel,action,"btn soft"));return card}
  function renderSignals(model,inputs){
    const box=q("#ownerSignalList");if(!box)return;box.replaceChildren();
    if(model.projectedMonthlyRevenue!==null&&model.target){
      const gap=model.targetGapPct||0,tone=gap>5?"risk":gap<-5?"positive":"neutral",headline=gap>0?`Revenue pace is ${pct(gap)} below your monthly target.`:`Revenue pace is ${pct(gap)} above your monthly target.`;
      box.append(signalCard({label:"Revenue pace",value:`${money(model.projectedMonthlyRevenue)} projected`,title:headline,detail:`Projection uses your ${model.operatingDays}-day operating-month assumption and the learned ${model.sampleDays}-day reported revenue baseline. Target: ${money(model.target)}.`,tone,actionLabel:"Review daily reports",action:()=>route("dailyreports")}));
    }else{
      box.append(signalCard({label:"Revenue pace",value:model.sampleDays>=3?`${money(model.dailyReportedRevenue)}/day baseline`:"Learning",title:model.sampleDays>=3?"Thebe has a reported revenue baseline, but no monthly target projection yet.":"Thebe needs more reporting history before it can judge revenue pace.",detail:model.sampleDays>=3?"Add your monthly revenue target and operating days to compare run-rate with plan.":"At least three historical reporting days are required before trend advice is treated as decision-ready.",tone:"neutral"}));
    }
    if(model.branch){
      const change=model.branch.revenueChange,hasRevenue=change!==null,tone=(change??model.branch.customerChange)<-10?"risk":(change??model.branch.customerChange)>10?"positive":"neutral",metric=hasRevenue?"reported revenue":"reported customers/jobs",delta=hasRevenue?change:model.branch.customerChange;
      box.append(signalCard({label:"Location watch",value:`${delta<0?"↓":"↑"} ${pct(delta)}`,title:`${model.branch.locationName} ${metric} is ${pct(delta)} ${delta<0?"below":"above"} its 30-day baseline.`,detail:`Thebe compares the recent 7-day run-rate with the location's learned 30-day baseline. Review source reports before attributing a cause.`,tone,actionLabel:"Open source reports",action:()=>route("dailyreports")}));
    }else box.append(signalCard({label:"Location watch",value:"Learning",title:"No location has enough history for a reliable branch comparison yet.",detail:"Thebe will surface the weakest and strongest location only after enough reporting history exists.",tone:"neutral"}));
    if(model.labourShare!==null){const tone=model.labourShare>=30?"risk":model.labourShare<=20?"positive":"neutral";box.append(signalCard({label:"Labour cost",value:pct(model.labourShare),title:`Labour cost is ${pct(model.labourShare)} of projected reported revenue.`,detail:`Uses your monthly labour-cost assumption (${money(model.labour)}) divided by the current revenue run-rate projection. Treat this as a management ratio, not an employee performance score.`,tone,actionLabel:"Review people & operations",action:()=>route("peopleops")}))}
    else box.append(signalCard({label:"Labour cost",value:"Not configured",title:"Add monthly labour cost to monitor cost pressure against revenue pace.",detail:"Thebe will calculate the ratio from your assumption without inferring individual employee performance.",tone:"neutral"}));
    if(model.daysToBuffer!==null){const d=Math.floor(model.daysToBuffer),tone=d<60?"risk":d>120?"positive":"neutral";box.append(signalCard({label:"Cash buffer",value:`${d} days`,title:`Cash is projected to reach your minimum buffer in about ${d} days at the current scenario run-rate.`,detail:`Scenario uses current cash ${money(model.currentCash)}, minimum buffer ${money(model.cashFloor)}, projected reported revenue and your monthly cash-outflow assumption.`,tone}))}
    else if(model.monthEndBefore!==null&&model.cashFloor!==null){const tone=model.monthEndBefore<model.cashFloor?"risk":"positive";box.append(signalCard({label:"Cash buffer",value:money(model.monthEndBefore),title:model.monthEndBefore<model.cashFloor?"Projected month-end cash is below your minimum buffer.":"Projected month-end cash stays above your minimum buffer in this scenario.",detail:`Minimum buffer: ${money(model.cashFloor)}. This is a scenario estimate, not an accounting forecast.`,tone}))}
    else box.append(signalCard({label:"Cash buffer",value:"Not configured",title:"Add current cash, monthly cash outflows and your minimum buffer to unlock cash-risk warnings.",detail:"Thebe will keep the result clearly labelled as a scenario until accounting/bank integrations provide authoritative balances.",tone:"neutral"}));
  }
  function actionRow(index,title,detail,label,fn){const row=document.createElement("div");row.className="owner-action";row.append(text("span",index,"owner-action-index"));const copy=document.createElement("div");copy.className="owner-action-copy";copy.append(text("b",title),text("span",detail));row.append(copy);if(label&&fn)row.append(button(label,fn,"btn soft"));return row}
  function renderActions(model){
    const panel=q("#ownerActionPanel");if(!panel)return;panel.replaceChildren();const head=document.createElement("div");head.className="owner-panel-head";const hc=document.createElement("div");hc.append(text("div","Recommended action","section-eyebrow"),text("h4","What Thebe recommends now"));head.append(hc,text("span","Decision support","badge"));panel.append(head);const list=document.createElement("div");list.className="owner-action-list";
    let i=1;
    if(model.purchase&&model.monthEndBefore!==null&&model.cashFloor!==null&&model.monthEndBefore<model.cashFloor){list.append(actionRow(i++,`Delay or phase the ${money(model.purchase)} ${decisionInputs(latestStateEnvelope?.state||{}).plannedPurchaseLabel}.`,`In this scenario, delaying the purchase improves month-end cash by ${money(model.purchase)} and directly protects the cash buffer.`,"See simulation",()=>q("#ownerSimulationPanel")?.scrollIntoView({behavior:"smooth",block:"center"})))}
    if(model.branch&&((model.branch.revenueChange??model.branch.customerChange)??0)<-10&&i<=3){list.append(actionRow(i++,`Review ${model.branch.locationName} before changing spend or staffing.`,`Its recent operating run-rate is materially below its learned baseline. Check source reports, customer volume and recorded blockers first.`,"Open reports",()=>route("dailyreports")))}
    if(model.targetGapPct!==null&&model.targetGapPct>5&&i<=3){const gap=Math.max(0,model.targetGapBwp||0);list.append(actionRow(i++,`Close the ${money(gap)} projected revenue gap with measurable sales actions.`,`Thebe can quantify the gap now. A sales-pipeline layer is still needed before it can truthfully name dormant quotations, conversion rates or campaign reallocations.`,"Open business",()=>route("businesshub")))}
    if(model.labourShare!==null&&model.labourShare>=30&&i<=3){list.append(actionRow(i++,"Review labour cost against workload and sales capacity.",`The current scenario ratio is ${pct(model.labourShare)}. Use rosters, overtime, vacancies and demand context; do not use this ratio alone for employment decisions.`,"People & operations",()=>route("peopleops")))}
    if(i===1)list.append(actionRow(i++,"Keep collecting operational data and confirm your business targets.","No decision threshold is currently strong enough for a specific financial recommendation. Thebe will stay conservative rather than manufacture one.","Update assumptions",()=>{const d=q("#ownerDecisionInputs");if(d){d.open=true;d.scrollIntoView({behavior:"smooth",block:"center"})}}));
    panel.append(list);
  }
  function renderSimulation(model){
    const panel=q("#ownerSimulationPanel");if(!panel)return;panel.replaceChildren();const head=document.createElement("div");head.className="owner-panel-head";const hc=document.createElement("div");hc.append(text("div","Simulation","section-eyebrow"),text("h4","What happens if you act?"));head.append(hc,text("span","Scenario","badge"));panel.append(head);
    if(model.monthEndBefore!==null&&model.purchase){const comp=document.createElement("div");comp.className="owner-sim-comparison";const before=document.createElement("div");before.className="owner-sim-value";before.append(text("span","Month-end cash · current plan"),text("b",money(model.monthEndBefore)));const arrow=text("div","→","owner-sim-arrow");const after=document.createElement("div");after.className="owner-sim-value";after.append(text("span","If purchase is delayed"),text("b",money(model.monthEndAfter)));comp.append(before,arrow,after);panel.append(comp,text("div",`Cash improves by ${money(model.purchase)} in this scenario.`,"owner-sim-impact"),text("div",`Assumptions: ${model.operatingDays||"—"} operating days/month, reported revenue run-rate ${money(model.dailyReportedRevenue)}/day, monthly cash outflows ${model.outflows!==null?money(model.outflows):"not set"}. This is a management scenario, not a bank or accounting forecast.`,"owner-sim-caveat"));return}
    if(model.monthEndBefore!==null){const value=document.createElement("div");value.className="owner-sim-value";value.append(text("span","Projected month-end cash"),text("b",money(model.monthEndBefore)));panel.append(value,text("div","Add a planned purchase amount to compare the current plan with a delay/phase scenario.","owner-sim-caveat"));return}
    panel.append(text("div","Add current cash, monthly outflows, operating days and a planned purchase to unlock a before/after cash simulation.","owner-command-empty"));
  }
  function inputField(label,key,value,{placeholder="",min="0",max="",step="1",type="number"}={}){const wrap=document.createElement("div");const lab=text("label",label);const id=`owner-${key}`;lab.htmlFor=id;const input=document.createElement("input");input.id=id;input.type=type;input.dataset.key=key;if(value!==null&&value!==undefined&&value!=="")input.value=String(value);if(placeholder)input.placeholder=placeholder;if(min!=="")input.min=String(min);if(max!=="")input.max=String(max);if(step!=="")input.step=String(step);wrap.append(lab,input);return wrap}
  function renderInputs(inputs){const body=q("#ownerInputsBody");if(!body)return;body.replaceChildren();body.append(text("div","These values are owner-entered assumptions used only for decision support. Reported revenue remains separately labelled. Thebe will not present a scenario estimate as an accounting fact.","owner-input-help"));const grid=document.createElement("div");grid.className="owner-input-grid";grid.append(
      inputField("Monthly revenue target (P)","monthlyRevenueTargetBwp",inputs.monthlyRevenueTargetBwp),
      inputField("Operating days per month","operatingDaysPerMonth",inputs.operatingDaysPerMonth,{placeholder:"e.g. 26",min:"1",max:"31"}),
      inputField("Monthly labour cost (P)","monthlyLabourCostBwp",inputs.monthlyLabourCostBwp),
      inputField("Current cash available (P)","currentCashBwp",inputs.currentCashBwp),
      inputField("Minimum cash buffer (P)","minimumCashBufferBwp",inputs.minimumCashBufferBwp),
      inputField("Monthly cash outflows (P)","monthlyCashOutflowsBwp",inputs.monthlyCashOutflowsBwp),
      inputField("Planned purchase (P)","plannedPurchaseBwp",inputs.plannedPurchaseBwp),
      inputField("Purchase label","plannedPurchaseLabel",inputs.plannedPurchaseLabel,{type:"text",min:"",max:"",step:"",placeholder:"e.g. equipment purchase"})
    );body.append(grid);const actions=document.createElement("div");actions.className="owner-input-actions";const status=text("span","","owner-input-status");status.id="ownerInputStatus";if(canEdit())actions.append(button("Save assumptions",()=>saveInputs(status),"btn"));else actions.append(text("span","Only the business owner can change these assumptions.","owner-input-status"));actions.append(status);body.append(actions)}
  async function saveInputs(status){
    if(!canEdit()||!latestStateEnvelope?.state)return;
    try{
      status.textContent="Saving…";const next=typeof global.structuredClone==="function"?global.structuredClone(latestStateEnvelope.state):JSON.parse(JSON.stringify(latestStateEnvelope.state)),company=activeCompanyFromState(next);if(!company)throw new Error("Active company not found");company.profile=company.profile&&typeof company.profile==="object"?company.profile:{};
      for(const [logical,key] of Object.entries(PROFILE_KEYS)){
        const input=q(`#owner-${logical}`);if(!input)continue;if(logical==="plannedPurchaseLabel"){company.profile[key]=String(input.value||"").trim().slice(0,80);continue}const raw=String(input.value||"").trim();company.profile[key]=raw===""?null:Number(raw);
      }
      const result=await request("/api/state",{method:"PUT",body:JSON.stringify({version:latestStateEnvelope.version,state:next})});status.textContent="Saved. Recalculating…";latestStateEnvelope={version:Number(result?.version||latestStateEnvelope.version+1),state:next};await renderOwnerBrief(true);status.textContent="Saved";
    }catch(error){status.textContent=String(error?.message||"Could not save assumptions").slice(0,160)}
  }
  function renderSummary(model){const box=q("#ownerCommandSummary");if(!box)return;let summary="Thebe is still learning enough history to produce a decision-ready owner brief.",tone="neutral";
    if(model.targetGapPct!==null){const gap=model.targetGapPct;if(gap>0){summary=`At the current reported run-rate, revenue is projected ${pct(gap)} below your monthly target.`;tone=gap>5?"risk":"neutral"}else{summary=`At the current reported run-rate, revenue is projected ${pct(gap)} above your monthly target.`;tone="positive"}}
    else if(model.branch&&model.branch.revenueChange!==null){const c=model.branch.revenueChange;summary=`${model.branch.locationName} reported revenue is running ${pct(c)} ${c<0?"below":"above"} its 30-day baseline.`;tone=c<-10?"risk":c>10?"positive":"neutral"}
    if(model.daysToBuffer!==null&&model.daysToBuffer<60){summary+=` Cash is also projected to reach your minimum buffer in about ${Math.floor(model.daysToBuffer)} days.`;tone="risk"}
    box.textContent=summary;box.dataset.tone=tone;
  }
  async function renderOwnerBrief(force=false){
    const seq=++renderSeq,shell=createShell();if(!shell)return;if(!canView()){shell.hidden=true;return}shell.hidden=false;
    const summary=q("#ownerCommandSummary");if(summary)summary.textContent=force?"Refreshing your business brief…":"Building your business brief…";
    try{
      const date=gaboroneDate(),[performance,stateEnvelope]=await Promise.all([request(`/api/daily-reporting/performance?date=${encodeURIComponent(date)}`),request("/api/state")]);if(seq!==renderSeq)return;latestStateEnvelope=stateEnvelope;const inputs=decisionInputs(stateEnvelope?.state||{}),model=deriveModel(performance,inputs,date);renderSummary(model);renderSources(model,inputs);renderSignals(model,inputs);renderActions(model);renderSimulation(model);renderInputs(inputs);
    }catch(error){if(seq!==renderSeq)return;const box=q("#ownerCommandSummary");if(box){box.textContent="Business owner brief unavailable. Thebe will not substitute missing data with invented advice.";box.dataset.tone="risk"}const signals=q("#ownerSignalList");if(signals)signals.replaceChildren(signalCard({label:"Data status",value:"Unavailable",title:"The business briefing could not be calculated from authoritative sources.",detail:String(error?.message||"Retry the brief or open Daily Reports to confirm source data.").slice(0,220),tone:"risk",actionLabel:"Retry",action:()=>renderOwnerBrief(true)}));const actions=q("#ownerActionPanel");if(actions)actions.replaceChildren();const sim=q("#ownerSimulationPanel");if(sim)sim.replaceChildren();}
  }
  function scheduleRender(){setTimeout(()=>renderOwnerBrief(false),220)}
  function boot(){createShell();scheduleRender();document.addEventListener("change",event=>{if(event.target?.id==="companySelect")setTimeout(()=>renderOwnerBrief(true),500)});const dashboard=q("#dashboard");if(dashboard){new MutationObserver(()=>{if(dashboard.classList.contains("active"))scheduleRender()}).observe(dashboard,{attributes:true,attributeFilter:["class"]})}}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
  global.ThebeOwnerCommandCentre=Object.freeze({release:RELEASE,refresh:()=>renderOwnerBrief(true)});
})(window);
