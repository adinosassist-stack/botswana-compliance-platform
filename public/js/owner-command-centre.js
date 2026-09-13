(function initOwnerCommandCentre(global){
  "use strict";
  const RELEASE="20260913b";
  const MAX_OPPORTUNITIES=500;
  const MAX_CAMPAIGNS=50;
  const PROFILE_KEYS=Object.freeze({
    monthlyRevenueTargetBwp:"decisionMonthlyRevenueTargetBwp",
    currentCashBwp:"decisionCurrentCashBwp",
    minimumCashBufferBwp:"decisionMinimumCashBufferBwp",
    monthlyCashOutflowsBwp:"decisionMonthlyCashOutflowsBwp",
    monthlyLabourCostBwp:"decisionMonthlyLabourCostBwp",
    plannedPurchaseBwp:"decisionPlannedPurchaseBwp",
    operatingDaysPerMonth:"decisionOperatingDaysPerMonth",
    plannedPurchaseLabel:"decisionPlannedPurchaseLabel",
    sameMonthCollectionPct:"decisionSameMonthCollectionPct"
  });
  let latestStateEnvelope=null;
  let renderSeq=0;
  let stateWriteQueue=Promise.resolve();

  const q=(s,root=document)=>root.querySelector(s);
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const money=v=>`P${Math.round(Number(v||0)).toLocaleString()}`;
  const pct=v=>`${Math.abs(Number(v||0)).toFixed(Math.abs(Number(v||0))>=10?0:1)}%`;
  const role=()=>{try{return String(global.currentWorkspaceRole?.()||global.currentUser?.role||"").toLowerCase()}catch{return ""}};
  const canView=()=>["owner","manager"].includes(role());
  const canEdit=()=>role()==="owner";
  const canEditSales=()=>["owner","manager"].includes(role());
  const gaboroneDate=()=>{try{return new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Gaborone",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}catch{return new Date().toISOString().slice(0,10)}};
  const text=(tag,value,className)=>{const node=document.createElement(tag);if(className)node.className=className;node.textContent=String(value??"");return node};
  const button=(label,fn,className="btn soft")=>{const b=document.createElement("button");b.type="button";b.className=className;b.textContent=label;b.addEventListener("click",fn);return b};
  const route=view=>{try{if(typeof global.showView==="function")global.showView(view)}catch{}};
  const request=(url,options={})=>{
    if(typeof global.apiJson!=="function")throw new Error("The secure Thebe API transport is not available.");
    return global.apiJson(url,options);
  };
  const clone=value=>typeof global.structuredClone==="function"?global.structuredClone(value):JSON.parse(JSON.stringify(value));
  const newId=prefix=>`${prefix}_${global.crypto?.randomUUID?.()||`${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
  const cleanText=(value,max=120)=>String(value||"").trim().replace(/\s+/g," ").slice(0,max);
  const isoDateValid=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||""))&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  const dateMs=value=>isoDateValid(value)?Date.parse(`${value}T00:00:00Z`):NaN;
  const addDays=(value,days)=>{const ms=dateMs(value);if(!Number.isFinite(ms))return null;return new Date(ms+Number(days||0)*86400000).toISOString().slice(0,10)};
  const dateBetween=(value,start,end)=>{const ms=dateMs(value),a=dateMs(start),b=dateMs(end);return Number.isFinite(ms)&&Number.isFinite(a)&&Number.isFinite(b)&&ms>=a&&ms<=b};
  const daysSince=(value,today)=>{const a=dateMs(value),b=dateMs(today);return Number.isFinite(a)&&Number.isFinite(b)?Math.max(0,Math.floor((b-a)/86400000)):null};
  const sum=(rows,key)=>rows.reduce((total,row)=>total+Number(typeof key==="function"?key(row):row?.[key]||0),0);
  const round1=v=>Math.round(Number(v||0)*10)/10;
  const roundMoney100=v=>Math.max(0,Math.round(Number(v||0)/100)*100);

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
      sameMonthCollectionPct:num(profile[PROFILE_KEYS.sameMonthCollectionPct]),
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

  function salesContainer(company){
    const raw=company?.salesIntelligence&&typeof company.salesIntelligence==="object"?company.salesIntelligence:{};
    const settings=raw.settings&&typeof raw.settings==="object"?raw.settings:{};
    return {
      version:1,
      settings:{
        dormantDays:clamp(Math.round(num(settings.dormantDays)??10),3,90),
        dormantRecoveryPct:num(settings.dormantRecoveryPct)===null?null:clamp(Number(settings.dormantRecoveryPct),0,100)
      },
      opportunities:Array.isArray(raw.opportunities)?raw.opportunities.slice(0,MAX_OPPORTUNITIES):[],
      campaigns:Array.isArray(raw.campaigns)?raw.campaigns.slice(0,MAX_CAMPAIGNS):[]
    };
  }
  function opportunityDate(row){return isoDateValid(row?.quotedAt)?row.quotedAt:(isoDateValid(row?.createdAt)?String(row.createdAt).slice(0,10):null)}
  function normalizeOpportunity(row){
    const status=["open","won","lost"].includes(String(row?.status||""))?String(row.status):"open";
    const quotedAt=opportunityDate(row)||gaboroneDate();
    const lastContactAt=isoDateValid(row?.lastContactAt)?row.lastContactAt:quotedAt;
    const closedAt=status==="open"?null:(isoDateValid(row?.closedAt)?row.closedAt:lastContactAt);
    return {id:String(row?.id||""),reference:cleanText(row?.reference||"Quotation",120),location:cleanText(row?.location||"Unassigned",80)||"Unassigned",quoteValueBwp:Math.max(0,Number(row?.quoteValueBwp||0)),quotedAt,lastContactAt,closedAt,status,campaignId:row?.campaignId?String(row.campaignId):null,createdAt:String(row?.createdAt||`${quotedAt}T00:00:00Z`),updatedAt:String(row?.updatedAt||row?.createdAt||`${quotedAt}T00:00:00Z`)};
  }
  function normalizeCampaign(row){return {id:String(row?.id||""),name:cleanText(row?.name||"Campaign",80),monthlySpendBwp:Math.max(0,Number(row?.monthlySpendBwp||0)),active:row?.active!==false,createdAt:String(row?.createdAt||""),updatedAt:String(row?.updatedAt||row?.createdAt||"")}}
  function conversionForPeriod(opportunities,start,end,location=null,campaignId=null){
    const cohort=opportunities.filter(row=>dateBetween(row.quotedAt,start,end)&&(!location||row.location===location)&&(!campaignId||row.campaignId===campaignId));
    const resolved=cohort.filter(row=>row.status==="won"||row.status==="lost"),won=resolved.filter(row=>row.status==="won"),lost=resolved.filter(row=>row.status==="lost");
    return {quoted:cohort.length,resolved:resolved.length,won:won.length,lost:lost.length,conversion:resolved.length?won.length/resolved.length*100:null,quotedValue:sum(cohort,"quoteValueBwp"),wonRevenue:sum(won,"quoteValueBwp")};
  }
  function deriveSalesIntelligence(company,date){
    const source=salesContainer(company),opportunities=source.opportunities.map(normalizeOpportunity),campaigns=source.campaigns.map(normalizeCampaign),windowDays=30;
    const currentStart=addDays(date,-(windowDays-1)),previousEnd=addDays(currentStart,-1),previousStart=addDays(previousEnd,-(windowDays-1));
    const current=conversionForPeriod(opportunities,currentStart,date),previous=conversionForPeriod(opportunities,previousStart,previousEnd);
    const locations=[...new Set(opportunities.map(x=>x.location).filter(Boolean))],locationComparisons=[];
    for(const location of locations){const cur=conversionForPeriod(opportunities,currentStart,date,location),prev=conversionForPeriod(opportunities,previousStart,previousEnd,location);if(cur.resolved>=3&&prev.resolved>=3&&cur.conversion!==null&&prev.conversion!==null)locationComparisons.push({location,current:cur,previous:prev,change:cur.conversion-prev.conversion})}
    const conversionWatch=locationComparisons.sort((a,b)=>a.change-b.change)[0]||null;
    const dormant=opportunities.filter(row=>row.status==="open"&&(daysSince(row.lastContactAt||row.quotedAt,date)??-1)>=source.settings.dormantDays),dormantValue=sum(dormant,"quoteValueBwp");
    const observedRate=current.resolved>=3?current.conversion:(previous.resolved>=3?previous.conversion:null),recoveryRate=source.settings.dormantRecoveryPct!==null?source.settings.dormantRecoveryPct:observedRate,recoveryRateSource=source.settings.dormantRecoveryPct!==null?"owner scenario":"observed resolved-quote rate",recoveryPotentialRevenue=recoveryRate!==null?dormantValue*recoveryRate/100:null;
    const campaignStats=campaigns.map(c=>{const p=conversionForPeriod(opportunities,currentStart,date,null,c.id),spend=Number(c.monthlySpendBwp||0),roas=spend>0?p.wonRevenue/spend:null;return {...c,...p,roas}});
    const eligible=campaignStats.filter(c=>c.active&&c.monthlySpendBwp>0&&c.resolved>=3&&c.roas!==null).sort((a,b)=>b.roas-a.roas);let campaignShift=null;
    if(eligible.length>=2){const best=eligible[0],worst=eligible[eligible.length-1];if(best.id!==worst.id&&best.roas>=worst.roas*1.25&&best.roas-worst.roas>=.35){const move=roundMoney100(Math.min(worst.monthlySpendBwp*.25,worst.monthlySpendBwp));if(move>=100)campaignShift={best,worst,move,incrementalRevenue:move*(best.roas-worst.roas)}}}
    return {source,opportunities,campaigns,current,previous,currentStart,previousStart,previousEnd,locationComparisons,conversionWatch,dormant,dormantCount:dormant.length,dormantValue,recoveryRate,recoveryRateSource,recoveryPotentialRevenue,campaignStats,campaignShift,openCount:opportunities.filter(x=>x.status==="open").length,wonCurrentValue:current.wonRevenue};
  }
  function deriveModel(performance,inputs,date,sales){
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
    const collectionPct=inputs.sameMonthCollectionPct!==null?clamp(inputs.sameMonthCollectionPct,0,100):null;
    const monthEndBefore=currentCash!==null&&projectedMonthlyRevenue!==null&&outflows!==null?currentCash+projectedMonthlyRevenue-outflows-(purchase||0):null;
    const monthlyBurn=projectedMonthlyRevenue!==null&&outflows!==null?outflows-projectedMonthlyRevenue:null;
    const daysToBuffer=currentCash!==null&&cashFloor!==null&&monthlyBurn!==null&&monthlyBurn>0?Math.max(0,(currentCash-cashFloor)/(monthlyBurn/30)):null;
    const cashRisk=monthEndBefore!==null&&cashFloor!==null&&monthEndBefore<cashFloor;
    const purchaseDelayImpact=cashRisk&&purchase?purchase:0;
    const salesRevenueScenario=Math.max(0,Number(sales?.recoveryPotentialRevenue||0))+Math.max(0,Number(sales?.campaignShift?.incrementalRevenue||0));
    const salesCashImpact=collectionPct!==null?salesRevenueScenario*collectionPct/100:null;
    const recommendedCashImpact=purchaseDelayImpact+(salesCashImpact||0),monthEndAfter=monthEndBefore!==null?monthEndBefore+recommendedCashImpact:null;
    return {date,sampleDays,dailyReportedRevenue,operatingDays,projectedMonthlyRevenue,target,targetGapPct,targetGapBwp,labour,labourShare,currentCash,cashFloor,outflows,purchase,collectionPct,monthEndBefore,monthEndAfter,monthlyBurn,daysToBuffer,cashRisk,purchaseDelayImpact,salesRevenueScenario,salesCashImpact,recommendedCashImpact,branch:branchSignal(performance),sales};
  }

  function createShell(){
    const parent=q("#homeDecisionCenter");if(!parent)return null;
    let shell=q("#ownerCommandCentre");if(shell)return shell;
    shell=document.createElement("section");shell.id="ownerCommandCentre";shell.className="owner-command-centre";shell.setAttribute("aria-labelledby","ownerCommandTitle");shell.dataset.release=RELEASE;
    const head=document.createElement("div");head.className="owner-command-head";
    const copy=document.createElement("div");copy.append(text("div","Business owner brief","section-eyebrow"));const h=text("h3","What needs your attention today");h.id="ownerCommandTitle";copy.append(h,text("p","Thebe connects reported performance, sales conversion, quotations, campaign economics and your business targets so the first screen explains what changed, why it matters and what to do next.","muted"));
    head.append(copy,button("Refresh brief",()=>renderOwnerBrief(true),"btn alt"));shell.append(head);
    const summary=text("div","Building your business brief…","owner-command-summary");summary.id="ownerCommandSummary";shell.append(summary);
    const sources=document.createElement("div");sources.className="owner-source-note";sources.id="ownerSourceNote";shell.append(sources);
    const signals=document.createElement("div");signals.className="owner-signal-list";signals.id="ownerSignalList";shell.append(signals);
    const grid=document.createElement("div");grid.className="owner-decision-grid";
    const actions=document.createElement("section");actions.className="owner-panel";actions.id="ownerActionPanel";const sim=document.createElement("section");sim.className="owner-panel owner-sim-card";sim.id="ownerSimulationPanel";grid.append(actions,sim);shell.append(grid);
    const salesDetails=document.createElement("details");salesDetails.className="owner-sales-workspace";salesDetails.id="ownerSalesWorkspace";const salesSummary=text("summary","Sales intelligence & quotations");salesSummary.id="ownerSalesSummary";salesDetails.append(salesSummary);const salesBody=document.createElement("div");salesBody.className="owner-sales-body";salesBody.id="ownerSalesBody";salesDetails.append(salesBody);shell.append(salesDetails);
    const settings=document.createElement("details");settings.className="owner-inputs";settings.id="ownerDecisionInputs";const summaryEl=text("summary","Business targets & scenario assumptions");settings.append(summaryEl);const body=document.createElement("div");body.className="owner-inputs-body";body.id="ownerInputsBody";settings.append(body);shell.append(settings);
    const anchor=q(".home-status-strip",parent);parent.insertBefore(shell,anchor||null);return shell;
  }
  function openSalesWorkspace(){const d=q("#ownerSalesWorkspace");if(d){d.open=true;d.scrollIntoView({behavior:"smooth",block:"start"})}}
  function sourcePill(label,kind){const span=text("span",label,`owner-source-pill ${kind||""}`);return span}
  function renderSources(model,inputs){const box=q("#ownerSourceNote");if(!box)return;box.replaceChildren();box.append(sourcePill(`${model.sampleDays} historical reporting day${model.sampleDays===1?"":"s"}`,"reported"));if(model.branch)box.append(sourcePill("Location operating baselines","reported"));if(model.sales?.opportunities.length)box.append(sourcePill(`${model.sales.opportunities.length} recorded quotations","reported"));if(model.sales?.campaigns.length)box.append(sourcePill("Campaign attribution","reported"));if([inputs.monthlyRevenueTargetBwp,inputs.currentCashBwp,inputs.monthlyCashOutflowsBwp,inputs.monthlyLabourCostBwp,inputs.sameMonthCollectionPct].some(v=>v!==null))box.append(sourcePill("Owner-entered financial assumptions","input"));if(model.projectedMonthlyRevenue!==null||model.salesRevenueScenario>0)box.append(sourcePill("Transparent Thebe projection","estimate"))}
  function signalCard({label,value,title,detail,tone="neutral",actionLabel,action}){const card=document.createElement("article");card.className="owner-signal";card.dataset.tone=tone;const top=document.createElement("div");top.className="owner-signal-top";top.append(text("span",label,"owner-signal-label"),text("span",value,"owner-signal-value"));card.append(top,text("h4",title),text("p",detail));if(actionLabel&&action)card.append(button(actionLabel,action,"btn soft"));return card}
  function renderSignals(model,inputs){
    const box=q("#ownerSignalList");if(!box)return;box.replaceChildren();
    if(model.projectedMonthlyRevenue!==null&&model.target){const gap=model.targetGapPct||0,tone=gap>5?"risk":gap<-5?"positive":"neutral",headline=gap>0?`Revenue pace is ${pct(gap)} below your monthly target.`:`Revenue pace is ${pct(gap)} above your monthly target.`;box.append(signalCard({label:"Revenue pace",value:`${money(model.projectedMonthlyRevenue)} projected`,title:headline,detail:`Projection uses your ${model.operatingDays}-day operating-month assumption and the learned ${model.sampleDays}-day reported revenue baseline. Target: ${money(model.target)}.`,tone,actionLabel:"Review daily reports",action:()=>route("dailyreports")}))}
    else box.append(signalCard({label:"Revenue pace",value:model.sampleDays>=3?`${money(model.dailyReportedRevenue)}/day baseline`:"Learning",title:model.sampleDays>=3?"Thebe has a reported revenue baseline, but no monthly target projection yet.":"Thebe needs more reporting history before it can judge revenue pace.",detail:model.sampleDays>=3?"Add your monthly revenue target and operating days to compare run-rate with plan.":"At least three historical reporting days are required before trend advice is treated as decision-ready.",tone:"neutral"}));
    const watch=model.sales?.conversionWatch;
    if(watch&&watch.change<0){box.append(signalCard({label:"Sales conversion",value:`${pct(watch.current.conversion)} now`,title:`${watch.location} resolved-quote conversion fell from ${pct(watch.previous.conversion)} to ${pct(watch.current.conversion)}.`,detail:`Comparison uses resolved quotations issued in consecutive 30-day windows (${watch.previous.resolved} prior and ${watch.current.resolved} current). Open quotations are excluded until won or lost.`,tone:watch.change<=-5?"risk":"neutral",actionLabel:"Open sales intelligence",action:openSalesWorkspace}))}
    else if(model.branch){const change=model.branch.revenueChange,hasRevenue=change!==null,tone=(change??model.branch.customerChange)<-10?"risk":(change??model.branch.customerChange)>10?"positive":"neutral",metric=hasRevenue?"reported revenue":"reported customers/jobs",delta=hasRevenue?change:model.branch.customerChange;box.append(signalCard({label:"Location watch",value:`${delta<0?"↓":"↑"} ${pct(delta)}`,title:`${model.branch.locationName} ${metric} is ${pct(delta)} ${delta<0?"below":"above"} its 30-day baseline.`,detail:`Thebe compares the recent 7-day run-rate with the location's learned 30-day baseline. Review source reports before attributing a cause.`,tone,actionLabel:"Open source reports",action:()=>route("dailyreports")}))}
    else box.append(signalCard({label:"Sales conversion",value:"Learning",title:"Record enough resolved quotations to compare sales conversion by location.",detail:"Thebe waits for at least three won/lost quotations in both comparison windows before calling a conversion change.",tone:"neutral",actionLabel:"Add quotations",action:openSalesWorkspace}));
    if(model.sales?.dormantCount>0){const rate=model.sales.recoveryRate!==null?` · ${pct(model.sales.recoveryRate)} ${model.sales.recoveryRateSource}`:"";box.append(signalCard({label:"Dormant quotations",value:`${model.sales.dormantCount} · ${money(model.sales.dormantValue)}`,title:`${model.sales.dormantCount} open quotation${model.sales.dormantCount===1?" has":"s have"} gone beyond the follow-up threshold.`,detail:`Dormant means no recorded follow-up for at least ${model.sales.source.settings.dormantDays} days${rate}.`,tone:"risk",actionLabel:"Review quotations",action:openSalesWorkspace}))}
    else box.append(signalCard({label:"Dormant quotations",value:"0",title:"No recorded open quotation is currently beyond the follow-up threshold.",detail:`Threshold: ${model.sales?.source.settings.dormantDays||10} days since the last recorded follow-up.`,tone:"positive",actionLabel:"Open quotations",action:openSalesWorkspace}));
    if(model.labourShare!==null){const tone=model.labourShare>=30?"risk":model.labourShare<=20?"positive":"neutral";box.append(signalCard({label:"Labour cost",value:pct(model.labourShare),title:`Labour cost is ${pct(model.labourShare)} of projected reported revenue.`,detail:`Uses your monthly labour-cost assumption (${money(model.labour)}) divided by the current revenue run-rate projection. Treat this as a management ratio, not an employee performance score.`,tone,actionLabel:"Review people & operations",action:()=>route("peopleops")}))}
    else box.append(signalCard({label:"Labour cost",value:"Not configured",title:"Add monthly labour cost to monitor cost pressure against revenue pace.",detail:"Thebe will calculate the ratio from your assumption without inferring individual employee performance.",tone:"neutral"}));
    if(model.daysToBuffer!==null){const d=Math.floor(model.daysToBuffer),tone=d<60?"risk":d>120?"positive":"neutral";box.append(signalCard({label:"Cash buffer",value:`${d} days`,title:`Cash is projected to reach your minimum buffer in about ${d} days at the current scenario run-rate.`,detail:`Scenario uses current cash ${money(model.currentCash)}, minimum buffer ${money(model.cashFloor)}, projected reported revenue and your monthly cash-outflow assumption.`,tone}))}
    else if(model.monthEndBefore!==null&&model.cashFloor!==null){const tone=model.monthEndBefore<model.cashFloor?"risk":"positive";box.append(signalCard({label:"Cash buffer",value:money(model.monthEndBefore),title:model.monthEndBefore<model.cashFloor?"Projected month-end cash is below your minimum buffer.":"Projected month-end cash stays above your minimum buffer in this scenario.",detail:`Minimum buffer: ${money(model.cashFloor)}. This is a scenario estimate, not an accounting forecast.`,tone}))}
    else box.append(signalCard({label:"Cash buffer",value:"Not configured",title:"Add current cash, monthly cash outflows and your minimum buffer to unlock cash-risk warnings.",detail:"Thebe will keep the result clearly labelled as a scenario until accounting/bank integrations provide authoritative balances.",tone:"neutral"}));
  }
  function actionRow(index,title,detail,label,fn){const row=document.createElement("div");row.className="owner-action";row.append(text("span",index,"owner-action-index"));const copy=document.createElement("div");copy.className="owner-action-copy";copy.append(text("b",title),text("span",detail));row.append(copy);if(label&&fn)row.append(button(label,fn,"btn soft"));return row}
  function recommendedActions(model){
    const actions=[];
    if(model.cashRisk&&model.purchase){actions.push({priority:100,title:`Delay or phase the ${money(model.purchase)} ${decisionInputs(latestStateEnvelope?.state||{}).plannedPurchaseLabel}.`,detail:`In this scenario, delaying the purchase improves month-end cash by ${money(model.purchase)} and directly protects the cash buffer.`,label:"See simulation",fn:()=>q("#ownerSimulationPanel")?.scrollIntoView({behavior:"smooth",block:"center"})})}
    if(model.sales?.dormantCount>0&&(model.targetGapPct===null||model.targetGapPct>0||model.cashRisk)){const potential=model.sales.recoveryPotentialRevenue!==null?` At the ${pct(model.sales.recoveryRate)} ${model.sales.recoveryRateSource}, this is a ${money(model.sales.recoveryPotentialRevenue)} booked-revenue scenario.`:"";actions.push({priority:96,title:`Follow up ${model.sales.dormantCount} dormant quotation${model.sales.dormantCount===1?"":"s"} worth ${money(model.sales.dormantValue)}.`,detail:`These quotations have exceeded the ${model.sales.source.settings.dormantDays}-day follow-up threshold.${potential}`,label:"Open quotations",fn:openSalesWorkspace})}
    const watch=model.sales?.conversionWatch;if(watch&&watch.change<=-3){actions.push({priority:92,title:`Investigate ${watch.location} sales conversion before changing price or staffing.`,detail:`Resolved-quote conversion moved from ${pct(watch.previous.conversion)} to ${pct(watch.current.conversion)} across consecutive 30-day quote cohorts. Check loss reasons and follow-up discipline before attributing a cause.`,label:"Review sales",fn:openSalesWorkspace})}
    const shift=model.sales?.campaignShift;if(shift){actions.push({priority:88,title:`Move ${money(shift.move)} of monthly spend from ${shift.worst.name} to ${shift.best.name}.`,detail:`Current attributed ROAS is ${shift.worst.roas.toFixed(2)}× versus ${shift.best.roas.toFixed(2)}×, each with at least three resolved quotations. If those economics persist, the shift models about ${money(shift.incrementalRevenue)} more attributable revenue.`,label:"Review campaigns",fn:openSalesWorkspace})}
    if(model.targetGapPct!==null&&model.targetGapPct>5){actions.push({priority:70,title:`Close the ${money(Math.max(0,model.targetGapBwp||0))} projected revenue gap with measurable sales actions.`,detail:"Use quotation follow-up, conversion and campaign evidence above before increasing total spend.",label:"Sales intelligence",fn:openSalesWorkspace})}
    if(model.labourShare!==null&&model.labourShare>=30){actions.push({priority:60,title:"Review labour cost against workload and sales capacity.",detail:`The current scenario ratio is ${pct(model.labourShare)}. Use rosters, overtime, vacancies and demand context; do not use this ratio alone for employment decisions.`,label:"People & operations",fn:()=>route("peopleops")})}
    if(model.branch&&((model.branch.revenueChange??model.branch.customerChange)??0)<-10){actions.push({priority:50,title:`Review ${model.branch.locationName} operating performance.`,detail:"Its recent run-rate is materially below its learned baseline. Check source reports and operational blockers before changing spend or staffing.",label:"Open reports",fn:()=>route("dailyreports")})}
    return actions.sort((a,b)=>b.priority-a.priority).slice(0,3);
  }
  function renderActions(model){
    const panel=q("#ownerActionPanel");if(!panel)return;panel.replaceChildren();const head=document.createElement("div");head.className="owner-panel-head";const hc=document.createElement("div");hc.append(text("div","Recommended action","section-eyebrow"),text("h4","What Thebe recommends now"));head.append(hc,text("span","Decision support","badge"));panel.append(head);const list=document.createElement("div");list.className="owner-action-list";
    const actions=recommendedActions(model);if(actions.length)actions.forEach((a,index)=>list.append(actionRow(index+1,a.title,a.detail,a.label,a.fn)));else list.append(actionRow(1,"Keep collecting operational and sales data and confirm your business targets.","No decision threshold is currently strong enough for a specific financial recommendation. Thebe will stay conservative rather than manufacture one.","Update assumptions",()=>{const d=q("#ownerDecisionInputs");if(d){d.open=true;d.scrollIntoView({behavior:"smooth",block:"center"})}}));panel.append(list);
  }
  function renderSimulation(model){
    const panel=q("#ownerSimulationPanel");if(!panel)return;panel.replaceChildren();const head=document.createElement("div");head.className="owner-panel-head";const hc=document.createElement("div");hc.append(text("div","Simulation","section-eyebrow"),text("h4","What happens if you act?"));head.append(hc,text("span","Scenario","badge"));panel.append(head);
    if(model.monthEndBefore!==null&&model.recommendedCashImpact>0){const comp=document.createElement("div");comp.className="owner-sim-comparison";const before=document.createElement("div");before.className="owner-sim-value";before.append(text("span","Month-end cash · current plan"),text("b",money(model.monthEndBefore)));const arrow=text("div","→","owner-sim-arrow");const after=document.createElement("div");after.className="owner-sim-value";after.append(text("span","Recommended scenario"),text("b",money(model.monthEndAfter)));comp.append(before,arrow,after);const parts=[];if(model.purchaseDelayImpact)parts.push(`${money(model.purchaseDelayImpact)} from delaying/phasing the planned purchase`);if(model.salesCashImpact)parts.push(`${money(model.salesCashImpact)} same-month cash from the sales scenario`);panel.append(comp,text("div",`Scenario improves month-end cash by ${money(model.recommendedCashImpact)}${parts.length?` (${parts.join(" + ")})`:""}.`,"owner-sim-impact"),text("div",`Sales revenue scenario: ${money(model.salesRevenueScenario)}. Same-month collection assumption: ${model.collectionPct!==null?pct(model.collectionPct):"not set"}. Revenue recovery uses recorded quotation/campaign economics and remains a scenario, not guaranteed cash.`,"owner-sim-caveat"));return}
    if(model.salesRevenueScenario>0){const value=document.createElement("div");value.className="owner-sim-value";value.append(text("span","Potential booked revenue · sales scenario"),text("b",money(model.salesRevenueScenario)));panel.append(value,text("div",model.collectionPct===null?"Add a same-month collection percentage under Business targets & scenario assumptions before Thebe translates this revenue scenario into projected cash.":`At ${pct(model.collectionPct)} same-month collection, the sales scenario represents about ${money(model.salesCashImpact)} cash.`,"owner-sim-caveat"));return}
    if(model.monthEndBefore!==null){const value=document.createElement("div");value.className="owner-sim-value";value.append(text("span","Projected month-end cash"),text("b",money(model.monthEndBefore)));panel.append(value,text("div","Add a planned purchase, dormant quotations or campaign history to compare the current plan with an action scenario.","owner-sim-caveat"));return}
    panel.append(text("div","Add current cash, monthly outflows and operating days to unlock cash simulation. Sales scenarios activate automatically as quotation and campaign history becomes decision-ready.","owner-command-empty"));
  }

  function field(label,{id,type="text",value="",placeholder="",min=null,max=null,step=null}={}){const wrap=document.createElement("div");const lab=text("label",label);lab.htmlFor=id;const input=document.createElement("input");input.id=id;input.type=type;if(value!==null&&value!==undefined&&value!=="")input.value=String(value);if(placeholder)input.placeholder=placeholder;if(min!==null)input.min=String(min);if(max!==null)input.max=String(max);if(step!==null)input.step=String(step);wrap.append(lab,input);return {wrap,input}}
  function selectField(label,{id,options=[],value=""}={}){const wrap=document.createElement("div"),lab=text("label",label);lab.htmlFor=id;const select=document.createElement("select");select.id=id;for(const option of options){const el=document.createElement("option");el.value=String(option.value);el.textContent=String(option.label);if(String(option.value)===String(value))el.selected=true;select.append(el)}wrap.append(lab,select);return {wrap,select}}
  function salesMetric(label,value,detail){const card=document.createElement("div");card.className="owner-sales-metric";card.append(text("span",label),text("b",value),text("small",detail));return card}
  function statusBadge(status){return text("span",String(status||"").toUpperCase(),`owner-sales-status ${status||"open"}`)}
  function campaignById(model,id){return model.campaigns.find(c=>c.id===id)||null}
  function salesStatusNode(){return q("#ownerSalesStatus")}
  function ensureSalesMutable(company){if(!company.salesIntelligence||typeof company.salesIntelligence!=="object")company.salesIntelligence={version:1,settings:{dormantDays:10,dormantRecoveryPct:null},opportunities:[],campaigns:[]};if(!company.salesIntelligence.settings||typeof company.salesIntelligence.settings!=="object")company.salesIntelligence.settings={dormantDays:10,dormantRecoveryPct:null};if(!Array.isArray(company.salesIntelligence.opportunities))company.salesIntelligence.opportunities=[];if(!Array.isArray(company.salesIntelligence.campaigns))company.salesIntelligence.campaigns=[];return company.salesIntelligence}
  function queueCompanyMutation(mutator,statusNode=salesStatusNode()){
    if(!canEditSales()||!latestStateEnvelope?.state){if(statusNode)statusNode.textContent="Your role cannot change sales records.";return Promise.resolve(false)}
    stateWriteQueue=stateWriteQueue.then(async()=>{
      if(statusNode)statusNode.textContent="Saving…";const next=clone(latestStateEnvelope.state),company=activeCompanyFromState(next);if(!company)throw new Error("Active company not found");await mutator(company);const result=await request("/api/state",{method:"PUT",body:JSON.stringify({version:latestStateEnvelope.version,state:next})});latestStateEnvelope={version:Number(result?.version||latestStateEnvelope.version+1),state:next};if(statusNode)statusNode.textContent="Saved";await renderOwnerBrief(true);return true;
    }).catch(async error=>{if(statusNode)statusNode.textContent=String(error?.message||"Could not save sales data").slice(0,180);try{latestStateEnvelope=await request("/api/state")}catch{}return false});return stateWriteQueue;
  }
  function addQuotation(){
    const status=salesStatusNode(),reference=cleanText(q("#salesQuoteReference")?.value,120),location=cleanText(q("#salesQuoteLocation")?.value,80),value=Number(q("#salesQuoteValue")?.value||0),quotedAt=String(q("#salesQuoteDate")?.value||""),lastContactAt=String(q("#salesQuoteFollowup")?.value||quotedAt),quoteStatus=String(q("#salesQuoteStatus")?.value||"open"),campaignId=String(q("#salesQuoteCampaign")?.value||"")||null;
    if(!reference||!location||!Number.isFinite(value)||value<0||!isoDateValid(quotedAt)||!isoDateValid(lastContactAt)||!["open","won","lost"].includes(quoteStatus)){if(status)status.textContent="Complete the quotation reference, location, value and valid dates.";return}
    queueCompanyMutation(company=>{const sales=ensureSalesMutable(company);if(sales.opportunities.length>=MAX_OPPORTUNITIES)throw new Error(`Quotation limit reached (${MAX_OPPORTUNITIES}). Export/archive older records before adding more.`);if(campaignId&&!sales.campaigns.some(c=>String(c.id)===campaignId))throw new Error("Selected campaign is no longer available.");const now=new Date().toISOString();sales.opportunities.unshift({id:newId("quote"),reference,location,quoteValueBwp:value,quotedAt,lastContactAt,status:quoteStatus,closedAt:quoteStatus==="open"?null:lastContactAt,campaignId,createdAt:now,updatedAt:now})},status);
  }
  function addCampaign(){const status=salesStatusNode(),name=cleanText(q("#salesCampaignName")?.value,80),spend=Number(q("#salesCampaignSpend")?.value||0);if(!name||!Number.isFinite(spend)||spend<0){if(status)status.textContent="Enter a campaign name and monthly spend.";return}queueCompanyMutation(company=>{const sales=ensureSalesMutable(company);if(sales.campaigns.length>=MAX_CAMPAIGNS)throw new Error(`Campaign limit reached (${MAX_CAMPAIGNS}).`);const now=new Date().toISOString();sales.campaigns.unshift({id:newId("campaign"),name,monthlySpendBwp:spend,active:true,createdAt:now,updatedAt:now})},status)}
  function updateQuote(id,action){const status=salesStatusNode(),today=gaboroneDate();queueCompanyMutation(company=>{const sales=ensureSalesMutable(company),row=sales.opportunities.find(x=>String(x.id)===String(id));if(!row)throw new Error("Quotation no longer exists.");if(action==="followup"){row.lastContactAt=today;row.updatedAt=new Date().toISOString()}else if(action==="won"||action==="lost"){row.status=action;row.closedAt=today;row.lastContactAt=today;row.updatedAt=new Date().toISOString()}else if(action==="reopen"){row.status="open";row.closedAt=null;row.updatedAt=new Date().toISOString()}},status)}
  function saveSalesSettings(){const status=salesStatusNode(),dormantDays=Number(q("#salesDormantDays")?.value||10),recoveryRaw=String(q("#salesRecoveryPct")?.value||"").trim(),recoveryPct=recoveryRaw===""?null:Number(recoveryRaw);if(!Number.isFinite(dormantDays)||dormantDays<3||dormantDays>90||!(recoveryPct===null||(Number.isFinite(recoveryPct)&&recoveryPct>=0&&recoveryPct<=100))){if(status)status.textContent="Dormant days must be 3–90 and recovery scenario 0–100%.";return}queueCompanyMutation(company=>{const sales=ensureSalesMutable(company);sales.settings.dormantDays=Math.round(dormantDays);sales.settings.dormantRecoveryPct=recoveryPct},status)}
  function renderSalesWorkspace(company,model){
    const body=q("#ownerSalesBody"),summary=q("#ownerSalesSummary");if(!body||!summary)return;summary.textContent=`Sales intelligence & quotations · ${model.openCount} open · ${model.dormantCount} dormant · ${model.campaigns.length} campaigns`;body.replaceChildren();
    const intro=document.createElement("div");intro.className="owner-sales-intro";const introCopy=document.createElement("div");introCopy.append(text("div","Commercial evidence","section-eyebrow"),text("h4","Turn quotations and marketing spend into decisions."),text("p","Record quotation outcomes, follow-up dates and campaign attribution. Thebe calculates conversion and campaign economics from these records; it does not invent customer activity."));const status=text("span","","owner-input-status");status.id="ownerSalesStatus";intro.append(introCopy,status);body.append(intro);
    const metrics=document.createElement("div");metrics.className="owner-sales-metrics";metrics.append(salesMetric("Open quotations",String(model.openCount),`${money(sum(model.opportunities.filter(x=>x.status==="open"),"quoteValueBwp"))} quoted value`),salesMetric("Dormant follow-up",String(model.dormantCount),`${money(model.dormantValue)} beyond ${model.source.settings.dormantDays} days`),salesMetric("Resolved conversion",model.current.conversion===null?"—":pct(model.current.conversion),`${model.current.won}/${model.current.resolved} won in current 30-day quote cohort`),salesMetric("Won quote value",money(model.current.wonRevenue),"Current 30-day quote cohort"));body.append(metrics);
    if(canEditSales()){
      const forms=document.createElement("div");forms.className="owner-sales-forms";
      const quoteCard=document.createElement("section");quoteCard.className="owner-sales-form-card";quoteCard.append(text("h4","Add quotation / opportunity"),text("p","Use a customer or quotation reference only. Do not enter phone numbers, identity numbers, banking details or other sensitive personal data.","muted small"));const quoteGrid=document.createElement("div");quoteGrid.className="owner-sales-form-grid";const ref=field("Customer / quotation reference",{id:"salesQuoteReference",placeholder:"e.g. QT-1042 · Mpho Supplies"}),loc=field("Location",{id:"salesQuoteLocation",placeholder:"e.g. Francistown"}),val=field("Quote value (P)",{id:"salesQuoteValue",type:"number",min:0,step:1}),qd=field("Quote date",{id:"salesQuoteDate",type:"date",value:gaboroneDate()}),follow=field("Last follow-up",{id:"salesQuoteFollowup",type:"date",value:gaboroneDate()}),st=selectField("Status",{id:"salesQuoteStatus",value:"open",options:[{value:"open",label:"Open"},{value:"won",label:"Won"},{value:"lost",label:"Lost"}]}),campaignOptions=[{value:"",label:"No campaign attribution"},...model.campaigns.map(c=>({value:c.id,label:c.name}))],camp=selectField("Campaign",{id:"salesQuoteCampaign",options:campaignOptions});quoteGrid.append(ref.wrap,loc.wrap,val.wrap,qd.wrap,follow.wrap,st.wrap,camp.wrap);quoteCard.append(quoteGrid,button("Add quotation",addQuotation,"btn"));
      const campaignCard=document.createElement("section");campaignCard.className="owner-sales-form-card";campaignCard.append(text("h4","Campaign economics"),text("p","Monthly spend is compared with quote outcomes explicitly attributed to each campaign.","muted small"));const cg=document.createElement("div");cg.className="owner-sales-form-grid";const cn=field("Campaign name",{id:"salesCampaignName",placeholder:"e.g. Facebook Campaign A"}),cs=field("Monthly spend (P)",{id:"salesCampaignSpend",type:"number",min:0,step:1}),dd=field("Dormant after days",{id:"salesDormantDays",type:"number",value:model.source.settings.dormantDays,min:3,max:90,step:1}),rp=field("Dormant recovery scenario %",{id:"salesRecoveryPct",type:"number",value:model.source.settings.dormantRecoveryPct??"",placeholder:"blank = observed rate",min:0,max:100,step:.1});cg.append(cn.wrap,cs.wrap,dd.wrap,rp.wrap);const campaignActions=document.createElement("div");campaignActions.className="owner-sales-form-actions";campaignActions.append(button("Add campaign",addCampaign,"btn"),button("Save sales assumptions",saveSalesSettings,"btn alt"));campaignCard.append(cg,campaignActions);forms.append(quoteCard,campaignCard);body.append(forms);
    }
    const lists=document.createElement("div");lists.className="owner-sales-lists";const quoteList=document.createElement("section");quoteList.className="owner-sales-list-card";const qh=document.createElement("div");qh.className="owner-sales-list-head";qh.append(text("h4","Recent quotations"),text("span",`${model.opportunities.length}/${MAX_OPPORTUNITIES} records","badge"));quoteList.append(qh);const rows=document.createElement("div");rows.className="owner-sales-quote-list";
    const sorted=[...model.opportunities].sort((a,b)=>String(b.quotedAt).localeCompare(String(a.quotedAt))).slice(0,40);if(!sorted.length)rows.append(text("div","No quotations recorded yet. Add the first quotation above to activate conversion and dormant-follow-up intelligence.","owner-command-empty"));else for(const row of sorted){const card=document.createElement("article");card.className="owner-sales-quote";const top=document.createElement("div");top.className="owner-sales-quote-head";const copy=document.createElement("div");copy.append(text("b",row.reference),text("span",`${row.location} · quoted ${row.quotedAt} · ${money(row.quoteValueBwp)}`));top.append(copy,statusBadge(row.status));card.append(top);const campaign=campaignById(model,row.campaignId),age=daysSince(row.lastContactAt||row.quotedAt,gaboroneDate());card.append(text("div",`Last follow-up: ${row.lastContactAt}${campaign?` · Campaign: ${campaign.name}`:""}${row.status==="open"&&age!==null?` · ${age} day${age===1?"":"s"} since follow-up`:""}`,"muted small"));if(canEditSales()){const acts=document.createElement("div");acts.className="owner-sales-row-actions";if(row.status==="open")acts.append(button("Followed up today",()=>updateQuote(row.id,"followup"),"btn soft"),button("Mark won",()=>updateQuote(row.id,"won"),"btn soft"),button("Mark lost",()=>updateQuote(row.id,"lost"),"btn soft"));else acts.append(button("Reopen",()=>updateQuote(row.id,"reopen"),"btn soft"));card.append(acts)}rows.append(card)}quoteList.append(rows);
    const campaignList=document.createElement("section");campaignList.className="owner-sales-list-card";const ch=document.createElement("div");ch.className="owner-sales-list-head";ch.append(text("h4","Campaign performance"),text("span",`${model.campaigns.length}/${MAX_CAMPAIGNS} campaigns","badge"));campaignList.append(ch);const cps=document.createElement("div");cps.className="owner-sales-campaign-list";if(!model.campaignStats.length)cps.append(text("div","No campaigns recorded. Add campaign spend and attribute quotations to compare conversion and ROAS.","owner-command-empty"));else for(const c of model.campaignStats){const card=document.createElement("article");card.className="owner-sales-campaign";card.append(text("b",c.name),text("span",`${money(c.monthlySpendBwp)} monthly spend · ${c.resolved} resolved quotations · ${c.won} won`),text("span",c.roas===null?"ROAS unavailable until spend and won revenue are recorded":`Attributed ROAS ${c.roas.toFixed(2)}× · won quote value ${money(c.wonRevenue)}`));cps.append(card)}campaignList.append(cps);lists.append(quoteList,campaignList);body.append(lists);
    if(model.campaignShift){const s=model.campaignShift;const callout=document.createElement("div");callout.className="owner-sales-callout";callout.append(text("b",`Campaign reallocation scenario: ${money(s.move)} from ${s.worst.name} → ${s.best.name}`),text("span",`Observed current-cohort ROAS: ${s.worst.roas.toFixed(2)}× → ${s.best.roas.toFixed(2)}×. If those economics persist, the reallocation models about ${money(s.incrementalRevenue)} additional attributable revenue without increasing total campaign spend.`));body.append(callout)}
  }

  function inputField(label,key,value,{placeholder="",min="0",max="",step="1",type="number"}={}){const wrap=document.createElement("div");const lab=text("label",label);const id=`owner-${key}`;lab.htmlFor=id;const input=document.createElement("input");input.id=id;input.type=type;input.dataset.key=key;if(value!==null&&value!==undefined&&value!=="")input.value=String(value);if(placeholder)input.placeholder=placeholder;if(min!=="")input.min=String(min);if(max!=="")input.max=String(max);if(step!=="")input.step=String(step);wrap.append(lab,input);return wrap}
  function renderInputs(inputs){const body=q("#ownerInputsBody");if(!body)return;body.replaceChildren();body.append(text("div","These values are owner-entered assumptions used only for decision support. Reported revenue and recorded sales outcomes remain separately labelled. Thebe will not present a scenario estimate as an accounting fact.","owner-input-help"));const grid=document.createElement("div");grid.className="owner-input-grid";grid.append(
      inputField("Monthly revenue target (P)","monthlyRevenueTargetBwp",inputs.monthlyRevenueTargetBwp),
      inputField("Operating days per month","operatingDaysPerMonth",inputs.operatingDaysPerMonth,{placeholder:"e.g. 26",min:"1",max:"31"}),
      inputField("Monthly labour cost (P)","monthlyLabourCostBwp",inputs.monthlyLabourCostBwp),
      inputField("Current cash available (P)","currentCashBwp",inputs.currentCashBwp),
      inputField("Minimum cash buffer (P)","minimumCashBufferBwp",inputs.minimumCashBufferBwp),
      inputField("Monthly cash outflows (P)","monthlyCashOutflowsBwp",inputs.monthlyCashOutflowsBwp),
      inputField("Planned purchase (P)","plannedPurchaseBwp",inputs.plannedPurchaseBwp),
      inputField("Same-month collection %","sameMonthCollectionPct",inputs.sameMonthCollectionPct,{placeholder:"e.g. 70",min:"0",max:"100",step:"0.1"}),
      inputField("Purchase label","plannedPurchaseLabel",inputs.plannedPurchaseLabel,{type:"text",min:"",max:"",step:"",placeholder:"e.g. equipment purchase"})
    );body.append(grid);const actions=document.createElement("div");actions.className="owner-input-actions";const status=text("span","","owner-input-status");status.id="ownerInputStatus";if(canEdit())actions.append(button("Save assumptions",()=>saveInputs(status),"btn"));else actions.append(text("span","Only the business owner can change financial assumptions.","owner-input-status"));actions.append(status);body.append(actions)}
  async function saveInputs(status){
    if(!canEdit()||!latestStateEnvelope?.state)return;
    try{status.textContent="Saving…";const next=clone(latestStateEnvelope.state),company=activeCompanyFromState(next);if(!company)throw new Error("Active company not found");company.profile=company.profile&&typeof company.profile==="object"?company.profile:{};for(const [logical,key] of Object.entries(PROFILE_KEYS)){const input=q(`#owner-${logical}`);if(!input)continue;if(logical==="plannedPurchaseLabel"){company.profile[key]=String(input.value||"").trim().slice(0,80);continue}const raw=String(input.value||"").trim(),value=raw===""?null:Number(raw);if(value!==null&&!Number.isFinite(value))throw new Error("Enter valid numeric assumptions.");if(logical==="sameMonthCollectionPct"&&value!==null&&(value<0||value>100))throw new Error("Same-month collection must be between 0% and 100%.");company.profile[key]=value}const result=await request("/api/state",{method:"PUT",body:JSON.stringify({version:latestStateEnvelope.version,state:next})});status.textContent="Saved. Recalculating…";latestStateEnvelope={version:Number(result?.version||latestStateEnvelope.version+1),state:next};await renderOwnerBrief(true);status.textContent="Saved"}catch(error){status.textContent=String(error?.message||"Could not save assumptions").slice(0,160)}
  }
  function renderSummary(model){const box=q("#ownerCommandSummary");if(!box)return;const lines=[];let tone="neutral";
    if(model.targetGapPct!==null){const gap=model.targetGapPct;if(gap>0){lines.push(`Revenue is projected ${pct(gap)} below your monthly target.`);if(gap>5)tone="risk"}else{lines.push(`Revenue is projected ${pct(gap)} above your monthly target.`);tone="positive"}}
    const watch=model.sales?.conversionWatch;if(watch&&watch.change<0){lines.push(`${watch.location} sales conversion has fallen from ${pct(watch.previous.conversion)} to ${pct(watch.current.conversion)}.`);if(watch.change<=-5)tone="risk"}else if(model.branch&&model.branch.revenueChange!==null){const c=model.branch.revenueChange;lines.push(`${model.branch.locationName} reported revenue is running ${pct(c)} ${c<0?"below":"above"} its 30-day baseline.`);if(c<-10)tone="risk"}
    if(model.labourShare!==null&&model.labourShare>=30){lines.push(`Labour cost is ${pct(model.labourShare)} of projected reported revenue.`);tone="risk"}
    if(model.daysToBuffer!==null&&model.daysToBuffer<60){lines.push(`Cash is projected to reach your minimum buffer in about ${Math.floor(model.daysToBuffer)} days.`);tone="risk"}
    if(!lines.length&&model.sales?.dormantCount>0){lines.push(`${model.sales.dormantCount} dormant quotation${model.sales.dormantCount===1?" needs":"s need"} follow-up, worth ${money(model.sales.dormantValue)} in recorded quote value.`);tone="risk"}
    if(!lines.length)lines.push("Thebe is still learning enough operational and sales history to produce a decision-ready owner brief.");box.textContent=lines.slice(0,4).join(" ");box.dataset.tone=tone;
  }
  async function renderOwnerBrief(force=false){
    const seq=++renderSeq,shell=createShell();if(!shell)return;if(!canView()){shell.hidden=true;return}shell.hidden=false;const summary=q("#ownerCommandSummary");if(summary)summary.textContent=force?"Refreshing your business brief…":"Building your business brief…";
    try{const date=gaboroneDate(),[performance,stateEnvelope]=await Promise.all([request(`/api/daily-reporting/performance?date=${encodeURIComponent(date)}`),request("/api/state")]);if(seq!==renderSeq)return;latestStateEnvelope=stateEnvelope;const inputs=decisionInputs(stateEnvelope?.state||{}),sales=deriveSalesIntelligence(inputs.company,date),model=deriveModel(performance,inputs,date,sales);renderSummary(model);renderSources(model,inputs);renderSignals(model,inputs);renderActions(model);renderSimulation(model);renderSalesWorkspace(inputs.company,sales);renderInputs(inputs)}catch(error){if(seq!==renderSeq)return;const box=q("#ownerCommandSummary");if(box){box.textContent="Business owner brief unavailable. Thebe will not substitute missing data with invented advice.";box.dataset.tone="risk"}const signals=q("#ownerSignalList");if(signals)signals.replaceChildren(signalCard({label:"Data status",value:"Unavailable",title:"The business briefing could not be calculated from authoritative sources.",detail:String(error?.message||"Retry the brief or open Daily Reports to confirm source data.").slice(0,220),tone:"risk",actionLabel:"Retry",action:()=>renderOwnerBrief(true)}));const actions=q("#ownerActionPanel");if(actions)actions.replaceChildren();const sim=q("#ownerSimulationPanel");if(sim)sim.replaceChildren();const sales=q("#ownerSalesBody");if(sales)sales.replaceChildren(text("div","Sales intelligence unavailable until the tenant state can be read securely.","owner-command-empty"))}
  }
  function scheduleRender(){setTimeout(()=>renderOwnerBrief(false),220)}
  function boot(){createShell();scheduleRender();document.addEventListener("change",event=>{if(event.target?.id==="companySelect")setTimeout(()=>renderOwnerBrief(true),500)});const dashboard=q("#dashboard");if(dashboard){new MutationObserver(()=>{if(dashboard.classList.contains("active"))scheduleRender()}).observe(dashboard,{attributes:true,attributeFilter:["class"]})}}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
  global.ThebeOwnerCommandCentre=Object.freeze({release:RELEASE,refresh:()=>renderOwnerBrief(true),openSales:openSalesWorkspace});
})(window);
