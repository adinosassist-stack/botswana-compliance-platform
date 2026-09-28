(function initOwnerCommandCentre(global){
  "use strict";

  const RELEASE="20260926-v165";
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
  let agenticLatestPlan=null;
  let agenticBusy=false;
  let agenticAskBusy=false;
  let agenticAskResult=null;
  let agenticTaskBusy=false;
  let agenticTaskDraft=null;
  let financeReconciliationPreview=null;
  let financeReconciliationBusy=false;
  let propertyPortfolioCache=null;
  let propertyPortfolioBusy=false;
  let propertyAssetEditingId=null;
  let propertyEvidenceOptions=[];

  const q=(selector,root=document)=>root.querySelector(selector);
  const num=value=>{
    const n=Number(value);
    return Number.isFinite(n)?n:null;
  };
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const money=value=>`P${Math.round(Number(value||0)).toLocaleString()}`;
  const pct=value=>`${Math.abs(Number(value||0)).toFixed(Math.abs(Number(value||0))>=10?0:1)}%`;
  const role=()=>{
    try{return String(global.currentWorkspaceRole?.()||global.currentUser?.role||"").toLowerCase()}
    catch{return ""}
  };
  const canView=()=>["owner","manager"].includes(role());
  const canEdit=()=>role()=="owner";
  const canEditSales=()=>["owner","manager"].includes(role());
  const gaboroneDate=()=>{
    try{
      return new Intl.DateTimeFormat("en-CA",{
        timeZone:"Africa/Gaborone",
        year:"numeric",
        month:"2-digit",
        day:"2-digit"
      }).format(new Date());
    }catch{
      return new Date().toISOString().slice(0,10);
    }
  };
  const text=(tag,value,className="")=>{
    const node=document.createElement(tag);
    if(className)node.className=className;
    node.textContent=String(value??"");
    return node;
  };
  const button=(label,fn,className="btn soft")=>{
    const node=document.createElement("button");
    node.type="button";
    node.className=className;
    node.textContent=label;
    node.addEventListener("click",fn);
    return node;
  };
  const route=view=>{
    try{if(typeof global.showView==="function")global.showView(view)}catch{}
  };
  const request=(url,options={})=>{
    if(typeof global.apiJson!=="function"){
      throw new Error("The secure Thebe API transport is not available.");
    }
    return global.apiJson(url,options);
  };
  const clone=value=>typeof global.structuredClone==="function"
    ?global.structuredClone(value)
    :JSON.parse(JSON.stringify(value));
  const newId=prefix=>{
    const token=global.crypto?.randomUUID?.()||`${Date.now()}_${Math.random().toString(16).slice(2)}`;
    return `${prefix}_${token}`;
  };
  const cleanText=(value,max=120)=>String(value||"").trim().replace(/\s+/g," ").slice(0,max);
  const isoDateValid=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||""))
    &&!Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  const dateMs=value=>isoDateValid(value)?Date.parse(`${value}T00:00:00Z`):NaN;
  const addDays=(value,days)=>{
    const ms=dateMs(value);
    if(!Number.isFinite(ms))return null;
    return new Date(ms+Number(days||0)*86400000).toISOString().slice(0,10);
  };
  const dateBetween=(value,start,end)=>{
    const ms=dateMs(value),a=dateMs(start),b=dateMs(end);
    return Number.isFinite(ms)&&Number.isFinite(a)&&Number.isFinite(b)&&ms>=a&&ms<=b;
  };
  const daysSince=(value,today)=>{
    const a=dateMs(value),b=dateMs(today);
    return Number.isFinite(a)&&Number.isFinite(b)
      ?Math.max(0,Math.floor((b-a)/86400000))
      :null;
  };
  const sum=(rows,key)=>rows.reduce((total,row)=>{
    const value=typeof key==="function"?key(row):row?.[key];
    return total+Number(value||0);
  },0);
  const roundMoney100=value=>Math.max(0,Math.round(Number(value||0)/100)*100);

  function activeCompanyFromState(state){
    const companies=Array.isArray(state?.companies)?state.companies:[];
    const activeId=String(state?.activeCompanyId||"");
    return companies.find(company=>String(company?.id||"")===activeId)||companies[0]||null;
  }

  function decisionInputs(state){
    const company=activeCompanyFromState(state);
    const profile=(company?.profile&&typeof company.profile==="object")
      ?company.profile
      :((state?.profile&&typeof state.profile==="object")?state.profile:{});
    return {
      company,
      profile,
      monthlyRevenueTargetBwp:num(profile[PROFILE_KEYS.monthlyRevenueTargetBwp]),
      currentCashBwp:num(profile[PROFILE_KEYS.currentCashBwp]),
      minimumCashBufferBwp:num(profile[PROFILE_KEYS.minimumCashBufferBwp]),
      monthlyCashOutflowsBwp:num(profile[PROFILE_KEYS.monthlyCashOutflowsBwp]),
      monthlyLabourCostBwp:num(profile[PROFILE_KEYS.monthlyLabourCostBwp]),
      plannedPurchaseBwp:num(profile[PROFILE_KEYS.plannedPurchaseBwp]),
      operatingDaysPerMonth:num(profile[PROFILE_KEYS.operatingDaysPerMonth]),
      sameMonthCollectionPct:num(profile[PROFILE_KEYS.sameMonthCollectionPct]),
      plannedPurchaseLabel:String(profile[PROFILE_KEYS.plannedPurchaseLabel]||"planned purchase")
        .trim().slice(0,80)||"planned purchase"
    };
  }

  function ratioChange(current,baseline){
    const c=Number(current||0),b=Number(baseline||0);
    return b>0?(c-b)/b*100:null;
  }

  function branchSignal(performance){
    const scopes=Array.isArray(performance?.scopes)?performance.scopes:[];
    const candidates=[];
    for(const scope of scopes){
      const profile=scope?.profile||{};
      const locationId=profile.locationId;
      if(!locationId||Number(profile.sampleDays||0)<3)continue;
      const b7=profile.baseline7||{},b30=profile.baseline30||{};
      const revenueChange=ratioChange(b7.revenue,b30.revenue);
      const customerChange=ratioChange(b7.customers,b30.customers);
      const score=revenueChange??customerChange;
      if(score===null)continue;
      candidates.push({
        locationId,
        locationName:profile.locationName||"Location",
        sampleDays:Number(profile.sampleDays||0),
        revenue7:Number(b7.revenue||0),
        revenue30:Number(b30.revenue||0),
        customer7:Number(b7.customers||0),
        customer30:Number(b30.customers||0),
        revenueChange,
        customerChange,
        score
      });
    }
    return candidates.sort((a,b)=>a.score-b.score)[0]||null;
  }

  function salesContainer(company){
    const raw=company?.salesIntelligence&&typeof company.salesIntelligence==="object"
      ?company.salesIntelligence
      :{};
    const settings=raw.settings&&typeof raw.settings==="object"?raw.settings:{};
    return {
      version:1,
      settings:{
        dormantDays:clamp(Math.round(num(settings.dormantDays)??10),3,90),
        dormantRecoveryPct:num(settings.dormantRecoveryPct)===null
          ?null
          :clamp(Number(settings.dormantRecoveryPct),0,100)
      },
      opportunities:Array.isArray(raw.opportunities)
        ?raw.opportunities.slice(0,MAX_OPPORTUNITIES)
        :[],
      campaigns:Array.isArray(raw.campaigns)
        ?raw.campaigns.slice(0,MAX_CAMPAIGNS)
        :[]
    };
  }

  function opportunityDate(row){
    if(isoDateValid(row?.quotedAt))return row.quotedAt;
    const created=String(row?.createdAt||"").slice(0,10);
    return isoDateValid(created)?created:null;
  }

  function normalizeOpportunity(row){
    const status=["open","won","lost"].includes(String(row?.status||""))
      ?String(row.status)
      :"open";
    const quotedAt=opportunityDate(row)||gaboroneDate();
    const lastContactAt=isoDateValid(row?.lastContactAt)?row.lastContactAt:quotedAt;
    const closedAt=status==="open"
      ?null
      :(isoDateValid(row?.closedAt)?row.closedAt:lastContactAt);
    return {
      id:String(row?.id||""),
      reference:cleanText(row?.reference||"Quotation",120),
      location:cleanText(row?.location||"Unassigned",80)||"Unassigned",
      quoteValueBwp:Math.max(0,Number(row?.quoteValueBwp||0)),
      quotedAt,
      lastContactAt,
      closedAt,
      status,
      campaignId:row?.campaignId?String(row.campaignId):null,
      createdAt:String(row?.createdAt||`${quotedAt}T00:00:00Z`),
      updatedAt:String(row?.updatedAt||row?.createdAt||`${quotedAt}T00:00:00Z`)
    };
  }

  function normalizeCampaign(row){
    return {
      id:String(row?.id||""),
      name:cleanText(row?.name||"Campaign",80),
      monthlySpendBwp:Math.max(0,Number(row?.monthlySpendBwp||0)),
      active:row?.active!==false,
      createdAt:String(row?.createdAt||""),
      updatedAt:String(row?.updatedAt||row?.createdAt||"")
    };
  }

  function conversionForPeriod(opportunities,start,end,location=null,campaignId=null){
    const cohort=opportunities.filter(row=>
      dateBetween(row.quotedAt,start,end)
      &&(!location||row.location===location)
      &&(!campaignId||row.campaignId===campaignId)
    );
    const resolved=cohort.filter(row=>row.status==="won"||row.status==="lost");
    const won=resolved.filter(row=>row.status==="won");
    const lost=resolved.filter(row=>row.status==="lost");
    return {
      quoted:cohort.length,
      resolved:resolved.length,
      won:won.length,
      lost:lost.length,
      conversion:resolved.length?won.length/resolved.length*100:null,
      quotedValue:sum(cohort,"quoteValueBwp"),
      wonRevenue:sum(won,"quoteValueBwp")
    };
  }

  function deriveSalesIntelligence(company,date){
    const source=salesContainer(company);
    const opportunities=source.opportunities.map(normalizeOpportunity);
    const campaigns=source.campaigns.map(normalizeCampaign);
    const windowDays=30;
    const currentStart=addDays(date,-(windowDays-1));
    const previousEnd=addDays(currentStart,-1);
    const previousStart=addDays(previousEnd,-(windowDays-1));
    const current=conversionForPeriod(opportunities,currentStart,date);
    const previous=conversionForPeriod(opportunities,previousStart,previousEnd);

    const locations=[...new Set(opportunities.map(row=>row.location).filter(Boolean))];
    const locationComparisons=[];
    for(const location of locations){
      const cur=conversionForPeriod(opportunities,currentStart,date,location);
      const prev=conversionForPeriod(opportunities,previousStart,previousEnd,location);
      if(cur.resolved>=3&&prev.resolved>=3&&cur.conversion!==null&&prev.conversion!==null){
        locationComparisons.push({
          location,
          current:cur,
          previous:prev,
          change:cur.conversion-prev.conversion
        });
      }
    }
    const conversionWatch=locationComparisons.sort((a,b)=>a.change-b.change)[0]||null;

    const dormant=opportunities.filter(row=>
      row.status==="open"
      &&(daysSince(row.lastContactAt||row.quotedAt,date)??-1)>=source.settings.dormantDays
    );
    const dormantValue=sum(dormant,"quoteValueBwp");
    const observedRate=current.resolved>=3
      ?current.conversion
      :(previous.resolved>=3?previous.conversion:null);
    const recoveryRate=source.settings.dormantRecoveryPct!==null
      ?source.settings.dormantRecoveryPct
      :observedRate;
    const recoveryRateSource=source.settings.dormantRecoveryPct!==null
      ?"owner scenario"
      :"observed resolved-quote rate";
    const recoveryPotentialRevenue=recoveryRate!==null
      ?dormantValue*recoveryRate/100
      :null;

    const campaignStats=campaigns.map(campaign=>{
      const period=conversionForPeriod(opportunities,currentStart,date,null,campaign.id);
      const spend=Number(campaign.monthlySpendBwp||0);
      const roas=spend>0?period.wonRevenue/spend:null;
      return {...campaign,...period,roas};
    });
    const eligible=campaignStats
      .filter(c=>c.active&&c.monthlySpendBwp>0&&c.resolved>=3&&c.roas!==null)
      .sort((a,b)=>b.roas-a.roas);

    let campaignShift=null;
    if(eligible.length>=2){
      const best=eligible[0];
      const worst=eligible[eligible.length-1];
      if(
        best.id!==worst.id
        &&best.roas>=worst.roas*1.25
        &&best.roas-worst.roas>=.35
      ){
        const move=roundMoney100(Math.min(worst.monthlySpendBwp*.25,worst.monthlySpendBwp));
        if(move>=100){
          campaignShift={
            best,
            worst,
            move,
            incrementalRevenue:move*(best.roas-worst.roas)
          };
        }
      }
    }

    return {
      source,
      opportunities,
      campaigns,
      current,
      previous,
      currentStart,
      previousStart,
      previousEnd,
      locationComparisons,
      conversionWatch,
      dormant,
      dormantCount:dormant.length,
      dormantValue,
      recoveryRate,
      recoveryRateSource,
      recoveryPotentialRevenue,
      campaignStats,
      campaignShift,
      openCount:opportunities.filter(row=>row.status==="open").length,
      wonCurrentValue:current.wonRevenue
    };
  }

  function deriveModel(performance,inputs,date,sales,finance,businessBrief){
    const selected=performance?.selected||{};
    const profile=selected.profile||{};
    const baseline30=profile.baseline30||{};
    const sampleDays=Number(profile.sampleDays||0);
    const dailyReportedRevenue=Number(baseline30.revenue||0);
    const operatingDays=inputs.operatingDaysPerMonth&&inputs.operatingDaysPerMonth>=1
      ?clamp(Math.round(inputs.operatingDaysPerMonth),1,31)
      :null;
    const projectedMonthlyRevenue=sampleDays>=3&&dailyReportedRevenue>0&&operatingDays
      ?dailyReportedRevenue*operatingDays
      :null;
    const target=inputs.monthlyRevenueTargetBwp&&inputs.monthlyRevenueTargetBwp>0
      ?inputs.monthlyRevenueTargetBwp
      :null;
    const targetGapPct=projectedMonthlyRevenue!==null&&target
      ?((target-projectedMonthlyRevenue)/target*100)
      :null;
    const targetGapBwp=projectedMonthlyRevenue!==null&&target
      ?target-projectedMonthlyRevenue
      :null;
    const labour=inputs.monthlyLabourCostBwp&&inputs.monthlyLabourCostBwp>=0
      ?inputs.monthlyLabourCostBwp
      :null;
    const labourShare=projectedMonthlyRevenue&&labour!==null
      ?labour/projectedMonthlyRevenue*100
      :null;
    const currentCash=inputs.currentCashBwp!==null&&inputs.currentCashBwp>=0
      ?inputs.currentCashBwp
      :null;
    const cashFloor=inputs.minimumCashBufferBwp!==null&&inputs.minimumCashBufferBwp>=0
      ?inputs.minimumCashBufferBwp
      :null;
    const outflows=inputs.monthlyCashOutflowsBwp!==null&&inputs.monthlyCashOutflowsBwp>=0
      ?inputs.monthlyCashOutflowsBwp
      :null;
    const purchase=inputs.plannedPurchaseBwp!==null&&inputs.plannedPurchaseBwp>=0
      ?inputs.plannedPurchaseBwp
      :null;
    const collectionPct=inputs.sameMonthCollectionPct!==null
      ?clamp(inputs.sameMonthCollectionPct,0,100)
      :null;

    const monthEndBefore=currentCash!==null&&projectedMonthlyRevenue!==null&&outflows!==null
      ?currentCash+projectedMonthlyRevenue-outflows-(purchase||0)
      :null;
    const monthlyBurn=projectedMonthlyRevenue!==null&&outflows!==null
      ?outflows-projectedMonthlyRevenue
      :null;
    const daysToBuffer=currentCash!==null&&cashFloor!==null&&monthlyBurn!==null&&monthlyBurn>0
      ?Math.max(0,(currentCash-cashFloor)/(monthlyBurn/30))
      :null;
    const cashRisk=monthEndBefore!==null&&cashFloor!==null&&monthEndBefore<cashFloor;
    const purchaseDelayImpact=cashRisk&&purchase?purchase:0;
    const salesRevenueScenario=
      Math.max(0,Number(sales?.recoveryPotentialRevenue||0))
      +Math.max(0,Number(sales?.campaignShift?.incrementalRevenue||0));
    const salesCashImpact=collectionPct!==null?salesRevenueScenario*collectionPct/100:null;
    const recommendedCashImpact=purchaseDelayImpact+(salesCashImpact||0);
    const monthEndAfter=monthEndBefore!==null?monthEndBefore+recommendedCashImpact:null;

    return {
      date,
      sampleDays,
      dailyReportedRevenue,
      operatingDays,
      projectedMonthlyRevenue,
      target,
      targetGapPct,
      targetGapBwp,
      labour,
      labourShare,
      currentCash,
      cashFloor,
      outflows,
      purchase,
      collectionPct,
      monthEndBefore,
      monthEndAfter,
      monthlyBurn,
      daysToBuffer,
      cashRisk,
      purchaseDelayImpact,
      salesRevenueScenario,
      salesCashImpact,
      recommendedCashImpact,
      branch:branchSignal(performance),
      sales,
      finance:finance||null,
      businessBrief:businessBrief||null
    };
  }

  function agenticStatusNode(){return q("#ownerAgenticStatus")}

  const reconciliationMoney=minor=>`P${(Number(minor||0)/100).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  function financeReconciliationPayloadFromFields({accountId,statementFrom,statementTo,openingBalance,closingBalance}){
    const opening=Number(openingBalance),closing=Number(closingBalance);
    if(!accountId)return {error:"Choose a finance account."};
    if(!isoDateValid(statementFrom)||!isoDateValid(statementTo)||statementFrom>statementTo)return {error:"Enter a valid statement period."};
    if(!Number.isFinite(opening)||!Number.isFinite(closing))return {error:"Enter valid opening and closing balances."};
    const openingBalanceMinor=Math.round(opening*100),closingBalanceMinor=Math.round(closing*100);
    if(!Number.isSafeInteger(openingBalanceMinor)||!Number.isSafeInteger(closingBalanceMinor))return {error:"Statement balances are outside the supported range."};
    return {payload:{accountId,statementFrom,statementTo,openingBalanceMinor,closingBalanceMinor}};
  }

  async function prepareFinanceReconciliationReview(payload){
    if(financeReconciliationBusy)return;
    financeReconciliationBusy=true;
    const status=agenticStatusNode();
    if(status)status.textContent="Preparing reconciliation from the canonical Finance Core…";
    try{
      financeReconciliationPreview=await request("/api/agentic/finance/reconciliation/prepare",{
        method:"POST",
        body:JSON.stringify(payload)
      });
      if(status)status.textContent="Reconciliation prepared. Review the exact snapshot before recording.";
      await renderAgenticGovernance(false);
    }catch(error){
      if(status)status.textContent=String(error?.message||"Could not prepare reconciliation").slice(0,180);
    }finally{
      financeReconciliationBusy=false;
    }
  }

  async function recordReviewedFinanceReconciliation(){
    if(financeReconciliationBusy||role()!=="owner")return;
    const proposal=financeReconciliationPreview?.proposal;
    if(!proposal?.snapshotHash)return;
    financeReconciliationBusy=true;
    const status=agenticStatusNode();
    if(status)status.textContent="Revalidating the reviewed snapshot before recording…";
    try{
      await request("/api/finance/reconciliations",{
        method:"POST",
        body:JSON.stringify({
          accountId:proposal.accountId,
          statementFrom:proposal.statementFrom,
          statementTo:proposal.statementTo,
          openingBalanceMinor:proposal.openingBalanceMinor,
          closingBalanceMinor:proposal.statementClosingMinor,
          expectedSnapshotHash:proposal.snapshotHash
        })
      });
      financeReconciliationPreview=null;
      if(status)status.textContent="Reviewed reconciliation recorded and verified.";
      await renderOwnerBrief(true);
    }catch(error){
      if(status)status.textContent=String(error?.message||"Could not record reviewed reconciliation").slice(0,180);
    }finally{
      financeReconciliationBusy=false;
    }
  }

  function renderFinanceReconciliationControl(accountsPayload){
    const section=document.createElement("section");
    section.className="owner-agentic-boundary";
    const accounts=Array.isArray(accountsPayload?.items)?accountsPayload.items.filter(item=>String(item?.status||"active")==="active"):[];
    const copy=document.createElement("div");
    copy.append(
      text("b","Finance reconciliation · prepare, review, then record"),
      text("span","Thebe prepares a tenant-scoped Finance Core snapshot. Recording remains a direct human action and is cryptographically bound to the reviewed snapshot hash.")
    );
    section.append(copy);

    if(!accounts.length){
      section.append(text("div","Create an active finance account before preparing a reconciliation.","owner-command-empty"));
      return section;
    }

    const form=document.createElement("form");
    form.className="owner-inputs-body";
    form.setAttribute("aria-label","Prepare finance reconciliation for review");
    const account=selectField("Finance account",{id:"ownerFinanceReconciliationAccount",value:String(accounts[0]?.id||""),options:accounts.map(item=>({value:String(item.id||""),label:String(item.name||"Finance account")}))});
    const from=field("Statement from",{id:"ownerFinanceReconciliationFrom",type:"date",value:gaboroneDate()});
    const to=field("Statement to",{id:"ownerFinanceReconciliationTo",type:"date",value:gaboroneDate()});
    const opening=field("Opening balance (P)",{id:"ownerFinanceReconciliationOpening",type:"number",value:"0"});
    opening.input.step="0.01";
    const closing=field("Closing balance (P)",{id:"ownerFinanceReconciliationClosing",type:"number",value:"0"});
    closing.input.step="0.01";
    const submit=document.createElement("button");
    submit.type="submit";
    submit.className="btn soft";
    submit.textContent=financeReconciliationBusy?"Working…":"Prepare reconciliation";
    submit.disabled=financeReconciliationBusy;
    form.append(account.wrap,from.wrap,to.wrap,opening.wrap,closing.wrap,submit);
    form.addEventListener("submit",event=>{
      event.preventDefault();
      const normalized=financeReconciliationPayloadFromFields({
        accountId:account.select.value,
        statementFrom:from.input.value,
        statementTo:to.input.value,
        openingBalance:opening.input.value,
        closingBalance:closing.input.value
      });
      if(normalized.error){
        const status=agenticStatusNode();
        if(status)status.textContent=normalized.error;
        return;
      }
      prepareFinanceReconciliationReview(normalized.payload);
    });
    section.append(form);

    const proposal=financeReconciliationPreview?.proposal;
    if(proposal){
      const card=document.createElement("article");
      card.className="owner-agentic-proposal";
      card.dataset.tone=proposal.status==="exception"?"risk":"positive";
      card.append(
        text("span",proposal.status==="exception"?"EXCEPTION":"RECONCILED","owner-agentic-kicker"),
        text("h5",`${proposal.accountName||"Finance account"} · ${proposal.statementFrom} to ${proposal.statementTo}`),
        text("p",`Statement closing ${reconciliationMoney(proposal.statementClosingMinor)} · Book closing ${reconciliationMoney(proposal.bookClosingMinor)} · Difference ${reconciliationMoney(proposal.differenceMinor)}`,"owner-agentic-reason"),
        text("div",`${Number(proposal.transactionCount||0)} transaction(s) · Snapshot ${String(proposal.snapshotHash||"").slice(0,24)}…`,"owner-agentic-policy")
      );
      const actions=document.createElement("div");
      actions.className="owner-agentic-actions";
      if(role()==="owner"){
        const record=button("Record reviewed reconciliation",recordReviewedFinanceReconciliation,"btn");
        record.disabled=financeReconciliationBusy;
        actions.append(record);
      }else{
        actions.append(text("span","Owner approval is required to record this reconciliation.","owner-agentic-policy"));
      }
      card.append(actions);
      section.append(card);
    }
    return section;
  }

  function agenticPolicyLabel(proposal){
    if(proposal?.execution_policy==="prohibited_autonomy"||proposal?.executionPolicy==="prohibited_autonomy")return "Human-only · autonomy prohibited";
    if(proposal?.authority==="approval_required")return "Approval required · no execution";
    return "Recommendation only · no execution";
  }

  function agenticProposalTone(proposal){
    const risk=String(proposal?.risk||"").toLowerCase();
    return risk==="high"?"risk":risk==="low"?"positive":"neutral";
  }

  async function decideAgenticProposal(proposalId,decision){
    const status=agenticStatusNode();
    if(agenticBusy)return;
    agenticBusy=true;
    if(status)status.textContent=decision==="approve"?"Recording approval…":"Recording rejection…";
    try{
      const result=await request(`/api/agentic/proposals/${encodeURIComponent(proposalId)}/${decision}`,{
        method:"POST",
        body:"{}"
      });
      const nextStatus=String(result?.status||"");
      if(agenticLatestPlan?.proposals){
        const local=agenticLatestPlan.proposals.find(item=>String(item?.id||"")===String(proposalId));
        if(local&&nextStatus)local.status=nextStatus;
      }
      if(status)status.textContent=result?.execution?.performed===false
        ?"Decision recorded. No action was executed."
        :"Decision recorded.";
      await renderAgenticGovernance(false);
    }catch(error){
      if(status)status.textContent=String(error?.message||"Could not record decision").slice(0,180);
    }finally{
      agenticBusy=false;
    }
  }

  function activeTaskDelegation(authorityPayload){
    const items=Array.isArray(authorityPayload?.items)?authorityPayload.items:[];
    return items.find(item=>
      String(item?.actionKey||"")==="task.create"
      &&String(item?.status||"")==="active"
      &&Number(item?.maxAutonomyLevel||0)>=3
      &&item?.externalSideEffects===false
      &&item?.humanConfirmationRequired===true
    )||null;
  }

  function taskPriorityFromProposal(proposal){
    const priority=String(proposal?.priority||"medium").toLowerCase();
    return priority==="high"?1:priority==="low"?3:2;
  }

  function loadTaskDraftFromProposal(proposal){
    agenticTaskDraft={
      title:cleanText(proposal?.title||"Internal follow-up",160),
      description:cleanText(proposal?.reason||"",1200),
      priority:taskPriorityFromProposal(proposal),
      dueAt:"",
      proposalId:String(proposal?.id||"")||null,
      runId:String(proposal?.run_id||proposal?.runId||"")||null
    };
    const status=agenticStatusNode();
    if(status)status.textContent="Internal task draft loaded. Review it before preparing.";
    renderAgenticGovernance(false);
  }

  async function runAgenticTaskMutation(progress,success,work){
    if(agenticTaskBusy)return null;
    agenticTaskBusy=true;
    const status=agenticStatusNode();
    if(status)status.textContent=progress;
    try{
      const result=await work();
      if(status)status.textContent=success;
      await renderAgenticGovernance(false);
      return result;
    }catch(error){
      if(status)status.textContent=String(error?.message||"The bounded task action could not be completed.").slice(0,180);
      return null;
    }finally{
      agenticTaskBusy=false;
    }
  }

  async function createBoundedTaskDelegation(){
    const expiresAt=new Date(Date.now()+30*86400000).toISOString();
    return runAgenticTaskMutation(
      "Creating bounded internal-task permission…",
      "Task permission created. A separate execution grant is still required.",
      ()=>request("/api/agentic/authority/delegations",{
        method:"POST",
        body:JSON.stringify({
          agentKey:"thebe",
          actionKey:"task.create",
          maxAutonomyLevel:3,
          maxDailyActions:5,
          maxAmountMinor:0,
          externalSideEffects:false,
          strongAuthRequired:false,
          expiresAt
        })
      })
    );
  }

  async function createBoundedTaskGrant(delegationId){
    return runAgenticTaskMutation(
      "Recording the separate owner execution grant…",
      "Execution grant recorded. The platform execution switch is unchanged.",
      ()=>request("/api/agentic/task-execution/grants",{
        method:"POST",
        body:JSON.stringify({delegationId})
      })
    );
  }

  async function revokeBoundedTaskAuthority(grantId,delegationId){
    return runAgenticTaskMutation(
      "Revoking bounded internal-task authority…",
      "Bounded internal-task authority revoked.",
      async()=>{
        if(grantId){
          await request(`/api/agentic/task-execution/grants/${encodeURIComponent(grantId)}/revoke`,{method:"POST",body:"{}"});
        }
        if(delegationId){
          await request(`/api/agentic/authority/delegations/${encodeURIComponent(delegationId)}/revoke`,{method:"POST",body:"{}"});
        }
        return {ok:true};
      }
    );
  }

  async function prepareBoundedTask({delegationId,title,description,priority,dueAt,runId=null,proposalId=null}){
    const payload={delegationId,title,description,priority,dueAt:dueAt||null};
    if(runId)payload.runId=runId;
    if(proposalId)payload.proposalId=proposalId;
    const result=await runAgenticTaskMutation(
      "Preparing exact internal-task payload for owner review…",
      "Task prepared. Review the exact payload and hash before approval.",
      ()=>request("/api/agentic/task-execution/prepare",{
        method:"POST",
        idempotencyKey:newId("task_prepare"),
        body:JSON.stringify(payload)
      })
    );
    if(result?.ok)agenticTaskDraft=null;
    return result;
  }

  async function approveBoundedTask(requestId){
    return runAgenticTaskMutation(
      "Binding owner approval to the exact task payload…",
      "Exact task payload approved. No execution occurs unless all runtime gates allow it.",
      ()=>request(`/api/agentic/task-execution/requests/${encodeURIComponent(requestId)}/approve`,{method:"POST",body:"{}"})
    );
  }

  async function cancelBoundedTask(requestId){
    return runAgenticTaskMutation(
      "Cancelling the prepared task request…",
      "Task request cancelled.",
      ()=>request(`/api/agentic/task-execution/requests/${encodeURIComponent(requestId)}/cancel`,{method:"POST",body:"{}"})
    );
  }

  async function executeBoundedTask(requestId){
    return runAgenticTaskMutation(
      "Revalidating Runtime Guard and executing the approved internal task…",
      "Internal task executed and verified.",
      ()=>request(`/api/agentic/task-execution/requests/${encodeURIComponent(requestId)}/execute`,{method:"POST",body:"{}"})
    );
  }

  function boundedTaskRequestCard(item,{executionEnabled=false}={}){
    const card=document.createElement("article");
    card.className="owner-agentic-proposal";
    const payload=item?.payload&&typeof item.payload==="object"?item.payload:{};
    const taskStatus=String(item?.status||"unknown");
    const top=document.createElement("div");
    top.className="owner-agentic-proposal-head";
    const copy=document.createElement("div");
    copy.append(
      text("span","Exact internal task payload","owner-agentic-kicker"),
      text("h5",payload.title||"Prepared internal task")
    );
    const badges=document.createElement("div");
    badges.className="owner-agentic-badges";
    badges.append(text("span",taskStatus.toUpperCase(),`owner-agentic-status-badge ${taskStatus}`));
    top.append(copy,badges);
    card.append(top);
    if(payload.description)card.append(text("p",payload.description,"owner-agentic-reason"));
    const due=payload.dueAt?new Date(payload.dueAt).toLocaleString():"No due date";
    card.append(
      text("div",`Priority ${Number(payload.priority||2)} · ${due}`,"owner-agentic-policy"),
      text("div",`Payload hash: ${String(item?.payloadHash||"").slice(0,20)}…`,"owner-agentic-policy")
    );
    const actions=document.createElement("div");
    actions.className="owner-agentic-actions";
    if(taskStatus==="prepared"&&role()==="owner"){
      const approve=button("Approve exact task",()=>approveBoundedTask(item.id),"btn");
      approve.disabled=agenticTaskBusy;
      actions.append(approve);
    }
    if(["prepared","approved"].includes(taskStatus)&&role()==="owner"){
      const cancel=button("Cancel",()=>cancelBoundedTask(item.id),"btn soft");
      cancel.disabled=agenticTaskBusy;
      actions.append(cancel);
    }
    if(taskStatus==="approved"){
      if(executionEnabled&&role()==="owner"){
        const execute=button("Execute approved internal task",()=>executeBoundedTask(item.id),"btn");
        execute.disabled=agenticTaskBusy;
        actions.append(execute);
      }else{
        actions.append(text("span","Approved · execution unavailable for this session","owner-input-status"));
      }
    }
    if(actions.childNodes.length)card.append(actions);
    return card;
  }

  function renderBoundedTaskControl({taskExecutionPayload,authorityPayload,taskRequestsPayload,taskListPayload}={}){
    const section=document.createElement("section");
    section.className="owner-agentic-run";
    const ready=taskExecutionPayload?.schemaReady===true;
    const executionMode=String(taskExecutionPayload?.executionMode||"off");
    const executionEnabled=ready
      &&taskExecutionPayload?.sessionExecutionEnabled===true
      &&taskExecutionPayload?.runtimeKillSwitch!==true;
    const canaryMode=executionMode==="platform_admin_canary";
    const delegation=activeTaskDelegation(authorityPayload);
    const activeGrant=Array.isArray(taskExecutionPayload?.activeGrants)?taskExecutionPayload.activeGrants[0]:null;

    section.append(
      text("span","Bounded internal task control","owner-agentic-kicker"),
      text("h4","Prepare → review exact payload → approve → guarded execute"),
      text("p","Only internal task.create is in this lane. The owner permission, separate execution grant, Runtime Guard, daily limit, kill switch and platform execution switch remain independent controls.")
    );

    const authority=document.createElement("div");
    authority.className="owner-agentic-controls";
    const authorityCopy=document.createElement("div");
    if(!ready){
      authorityCopy.append(text("b","Task execution schema unavailable."),text("span","No bounded task mutation is available."));
    }else if(!delegation){
      authorityCopy.append(
        text("b","No bounded task permission."),
        text("span","The owner may create a 30-day task.create permission capped at 5 internal tasks per day. It has no external side effects.")
      );
    }else if(!activeGrant){
      authorityCopy.append(
        text("b","Task permission exists; execution grant is absent."),
        text("span","A separate owner-approved execution grant is required before Thebe can even prepare an executable task request.")
      );
    }else{
      authorityCopy.append(
        text("b",executionEnabled
          ?(canaryMode?"Platform-admin canary is executable for this owner session.":"Bounded task lane is executable.")
          :(canaryMode?"Platform-admin canary is restricted for this session.":"Bounded task lane is configured but execution is OFF.")),
        text("span",executionEnabled
          ?"Approved internal tasks still pass the Runtime Guard immediately before execution."
          :(canaryMode
            ?"Only authenticated platform-admin owners can execute during this canary; preparation, approval and revocation remain available under the normal controls."
            :"You can prepare and approve task requests safely; the Execute control stays hidden until a reviewed platform execution mode permits it."))
      );
    }
    const authorityActions=document.createElement("div");
    authorityActions.className="owner-agentic-control-buttons";
    if(role()==="owner"&&ready&&!delegation){
      const create=button("Create 30-day task permission",createBoundedTaskDelegation,"btn soft");
      create.disabled=agenticTaskBusy;
      authorityActions.append(create);
    }
    if(role()==="owner"&&ready&&delegation&&!activeGrant){
      const grant=button("Approve separate execution grant",()=>createBoundedTaskGrant(delegation.id),"btn soft");
      grant.disabled=agenticTaskBusy;
      authorityActions.append(grant);
    }
    if(role()==="owner"&&delegation&&activeGrant){
      const revoke=button("Revoke bounded task permission",()=>revokeBoundedTaskAuthority(activeGrant.id,delegation.id),"btn soft");
      revoke.disabled=agenticTaskBusy;
      authorityActions.append(revoke);
    }
    authority.append(authorityCopy,authorityActions);
    section.append(authority);

    if(delegation&&activeGrant){
      const form=document.createElement("form");
      form.className="owner-inputs-body";
      form.setAttribute("aria-label","Prepare internal task for owner approval");
      const draft=agenticTaskDraft||{};
      const titleField=field("Task title",{id:"ownerAgentTaskTitle",value:draft.title||"",placeholder:"e.g. Review reconciliation exceptions"});
      const descriptionWrap=document.createElement("div");
      const descriptionLabel=text("label","Description");
      descriptionLabel.htmlFor="ownerAgentTaskDescription";
      const description=document.createElement("textarea");
      description.id="ownerAgentTaskDescription";
      description.rows=3;
      description.maxLength=1200;
      description.value=String(draft.description||"");
      descriptionWrap.append(descriptionLabel,description);
      const priorityField=selectField("Priority",{id:"ownerAgentTaskPriority",value:String(draft.priority||2),options:[
        {value:"1",label:"High"},
        {value:"2",label:"Normal"},
        {value:"3",label:"Low"}
      ]});
      const dueField=field("Due date/time",{id:"ownerAgentTaskDue",type:"datetime-local",value:draft.dueAt||""});
      const submit=document.createElement("button");
      submit.type="submit";
      submit.className="btn";
      submit.textContent=agenticTaskBusy?"Working…":"Prepare task for exact approval";
      submit.disabled=agenticTaskBusy;
      form.append(titleField.wrap,descriptionWrap,priorityField.wrap,dueField.wrap,submit);
      form.addEventListener("submit",event=>{
        event.preventDefault();
        const title=cleanText(titleField.input.value,160);
        if(!title){
          const status=agenticStatusNode();
          if(status)status.textContent="Enter a task title before preparing.";
          return;
        }
        let dueAt=null;
        if(dueField.input.value){
          const parsed=new Date(dueField.input.value);
          if(Number.isNaN(parsed.getTime())){
            const status=agenticStatusNode();
            if(status)status.textContent="Enter a valid due date/time.";
            return;
          }
          dueAt=parsed.toISOString();
        }
        prepareBoundedTask({
          delegationId:delegation.id,
          title,
          description:cleanText(description.value,1200),
          priority:Number(priorityField.select.value||2),
          dueAt,
          runId:draft.runId||null,
          proposalId:draft.proposalId||null
        });
      });
      section.append(form);
    }

    const requests=Array.isArray(taskRequestsPayload?.items)?taskRequestsPayload.items:[];
    const reviewable=requests.filter(item=>["prepared","approved"].includes(String(item?.status||""))).slice(0,8);
    if(reviewable.length){
      section.append(text("h4","Needs owner review"));
      const list=document.createElement("div");
      list.className="owner-agentic-proposals";
      reviewable.forEach(item=>list.append(boundedTaskRequestCard(item,{executionEnabled})));
      section.append(list);
    }

    const tasks=Array.isArray(taskListPayload?.items)?taskListPayload.items:[];
    if(tasks.length){
      section.append(text("h4","Thebe-created internal tasks"));
      const list=document.createElement("div");
      list.className="owner-agentic-proposals";
      tasks.slice(0,5).forEach(item=>{
        const task=document.createElement("article");
        task.className="owner-agentic-proposal";
        task.append(
          text("span",String(item?.status||"open").toUpperCase(),"owner-agentic-kicker"),
          text("h5",item?.title||"Internal task"),
          text("p",item?.description||"No description.","owner-agentic-reason"),
          text("div",`Priority ${Number(item?.priority||2)} · ${item?.dueAt?new Date(item.dueAt).toLocaleString():"No due date"}`,"owner-agentic-policy")
        );
        list.append(task);
      });
      section.append(list);
    }
    return section;
  }

  function agenticProposalCard(proposal){
    const card=document.createElement("article");
    card.className="owner-agentic-proposal";
    card.dataset.tone=agenticProposalTone(proposal);

    const top=document.createElement("div");
    top.className="owner-agentic-proposal-head";
    const copy=document.createElement("div");
    copy.append(
      text("span",`Priority ${String(proposal?.priority||"medium")}`,"owner-agentic-kicker"),
      text("h5",proposal?.title||"Governed recommendation")
    );
    const badges=document.createElement("div");
    badges.className="owner-agentic-badges";
    badges.append(
      text("span",String(proposal?.risk||"medium").toUpperCase(),`owner-agentic-risk ${String(proposal?.risk||"medium")}`),
      text("span",String(proposal?.status||"pending").toUpperCase(),`owner-agentic-status-badge ${String(proposal?.status||"pending")}`)
    );
    top.append(copy,badges);
    card.append(top);

    if(proposal?.reason)card.append(text("p",proposal.reason,"owner-agentic-reason"));
    card.append(text("div",agenticPolicyLabel(proposal),"owner-agentic-policy"));

    const refs=Array.isArray(proposal?.sourceRefs)?proposal.sourceRefs:[];
    if(refs.length){
      const sourceRow=document.createElement("div");
      sourceRow.className="owner-agentic-sources";
      refs.slice(0,8).forEach(ref=>sourceRow.append(text("span",ref,"owner-agentic-source")));
      card.append(sourceRow);
    }

    if(String(proposal?.status||"pending")==="pending"){
      const actions=document.createElement("div");
      actions.className="owner-agentic-actions";
      if(role()==="owner"){
        actions.append(button("Record approval",()=>decideAgenticProposal(proposal.id,"approve"),"btn soft"));
      }
      if(["owner","manager"].includes(role())){
        actions.append(button("Reject",()=>decideAgenticProposal(proposal.id,"reject"),"btn soft"));
      }
      if(actions.childNodes.length)card.append(actions);
    }
    if(["owner","manager"].includes(role())&&["pending","approved"].includes(String(proposal?.status||"pending"))){
      const taskActions=document.createElement("div");
      taskActions.className="owner-agentic-actions";
      taskActions.append(button("Use as internal task draft",()=>loadTaskDraftFromProposal(proposal),"btn soft"));
      card.append(taskActions);
    }
    return card;
  }

  async function askThebe(question){
    if(agenticAskBusy)return;
    const normalized=String(question||"").trim().replace(/\s+/g," ").slice(0,1000);
    const status=agenticStatusNode();
    if(normalized.length<3){
      if(status)status.textContent="Enter a question for Thebe.";
      return;
    }
    agenticAskBusy=true;
    if(status)status.textContent="Thebe is answering your question…";
    let answered=false;
    try{
      agenticAskResult=await request("/api/ai/advisor",{
        method:"POST",
        body:JSON.stringify({mode:"ask",question:normalized})
      });
      answered=true;
    }catch(error){
      if(status)status.textContent=String(error?.message||"Thebe could not answer that question.").slice(0,180);
    }finally{
      agenticAskBusy=false;
    }
    if(answered){
      await renderAgenticGovernance(false);
      const refreshedStatus=agenticStatusNode();
      if(refreshedStatus)refreshedStatus.textContent="Answer ready · no action was executed.";
    }
  }

  function renderAskThebeControl(){
    const section=document.createElement("section");
    section.className="owner-agentic-boundary";

    const copy=document.createElement("div");
    copy.append(
      text("b","Ask Thebe"),
      text("span","Ask a company-specific question or a general question. Company facts stay tenant-scoped; general knowledge is never presented as company data.")
    );
    section.append(copy);

    const form=document.createElement("form");
    form.className="owner-inputs-body";
    form.setAttribute("aria-label","Ask Thebe a question");
    const question=document.createElement("textarea");
    question.id="ownerThebeQuestion";
    question.rows=3;
    question.maxLength=1000;
    question.placeholder="Example: Why is our cash position different from revenue? Or: What is gross margin?";
    question.setAttribute("aria-label","Question for Thebe");
    const submit=document.createElement("button");
    submit.type="submit";
    submit.className="btn";
    submit.textContent=agenticAskBusy?"Answering…":"Ask Thebe";
    submit.disabled=agenticAskBusy;
    form.append(question,submit);
    form.addEventListener("submit",event=>{
      event.preventDefault();
      void askThebe(question.value);
    });
    section.append(form);

    const result=agenticAskResult;
    if(result?.answer){
      const card=document.createElement("article");
      card.className="owner-agentic-run";
      const confidence=String(result.confidence||"low").toUpperCase();
      const mode=String(result.generationMode||"governed").replaceAll("_"," ");
      card.append(
        text("span",`${confidence} confidence · ${mode}`,"owner-agentic-kicker"),
        text("h4","Thebe"),
        text("p",String(result.answer),"owner-agentic-reason")
      );

      const references=Array.isArray(result.references)?result.references:[];
      if(references.length){
        const refs=document.createElement("div");
        refs.className="owner-agentic-sources";
        references.slice(0,8).forEach(item=>refs.append(text("span",String(item?.label||item?.ref||"Workspace source"),"owner-agentic-source")));
        card.append(refs);
      }

      const caveats=Array.isArray(result.caveats)?result.caveats.filter(Boolean).slice(0,4):[];
      if(caveats.length)card.append(text("div",caveats.join(" · "),"owner-agentic-policy"));

      const actions=Array.isArray(result.actions)?result.actions.filter(item=>item?.title).slice(0,4):[];
      if(actions.length){
        const suggestions=document.createElement("div");
        suggestions.className="owner-agentic-proposals";
        actions.forEach(item=>{
          const suggestion=document.createElement("div");
          suggestion.className="owner-command-empty";
          suggestion.append(text("b",item.title),text("span",item.reason||""));
          suggestions.append(suggestion);
        });
        card.append(suggestions);
      }
      section.append(card);
    }
    return section;
  }

  function renderAgenticSnapshot(statusPayload,runsPayload,taskExecutionPayload=null,authorityPayload=null,taskRequestsPayload=null,taskListPayload=null,financeAccountsPayload=null){
    const body=q("#ownerAgenticBody");
    if(!body)return;
    body.replaceChildren();

    const controls=document.createElement("div");
    controls.className="owner-agentic-controls";
    const copy=document.createElement("div");
    const boundedReady=taskExecutionPayload?.schemaReady===true;
    const boundedOn=boundedReady&&taskExecutionPayload?.sessionExecutionEnabled===true&&taskExecutionPayload?.runtimeKillSwitch!==true;
    const boundedMode=String(taskExecutionPayload?.executionMode||"off");
    copy.append(
      text("b",boundedOn?"Governed planning and bounded internal execution are active.":"Governed planning is active."),
      text(
        "span",
        boundedOn
          ?"Thebe may observe, reason and recommend, and may execute only separately approved internal tasks through the Runtime Guard. High-impact actions remain human-only."
          :"Thebe may observe, reason, simulate and recommend. Bounded execution stays unavailable unless the platform switch, owner-approved grant and Runtime Guard all permit it."
      )
    );
    const buttons=document.createElement("div");
    buttons.className="owner-agentic-control-buttons";
    if(["owner","manager"].includes(role())){
      const generate=button(agenticBusy?"Generating…":"Generate governed plan",generateAgenticPlan,"btn");
      generate.disabled=agenticBusy;
      buttons.append(generate);
    }
    buttons.append(button("Refresh",()=>renderAgenticGovernance(true),"btn alt"));
    controls.append(copy,buttons);
    body.append(controls);

    const boundary=document.createElement("div");
    boundary.className="owner-agentic-boundary";
    const executionLabel=!boundedReady
      ?"Bounded execution · unavailable"
      :(taskExecutionPayload?.runtimeKillSwitch===true
        ?"Bounded execution · kill switch"
        :(boundedOn
          ?(boundedMode==="platform_admin_canary"?"Platform-admin canary · ON":"Bounded execution · ON")
          :(boundedMode==="platform_admin_canary"?"Platform-admin canary · restricted":"Bounded execution · OFF")));
    boundary.append(
      text("span",executionLabel,"badge"),
      text(
        "span",
        `Internal task lane: ${Number(taskExecutionPayload?.activeExecutionGrants||0)} active grant(s), ${Number(taskExecutionPayload?.openTasks||0)} open task(s). ${Array.isArray(statusPayload?.prohibitedAutonomy)?statusPayload.prohibitedAutonomy.length:0} high-impact autonomy classes remain prohibited.`
      )
    );
    body.append(boundary);
    body.append(renderAskThebeControl());

    if(statusPayload?.outcomeLearning?.enabled){
      const learning=document.createElement("div");
      learning.className="owner-agentic-boundary";
      learning.append(
        text("span","Outcome-informed ordering","badge"),
        text("span","Recent recorded outcomes can only reorder recommendations within the same priority level. This is non-causal and cannot change risk, approvals or execution authority.")
      );
      body.append(learning);
    }

    if(["owner","manager"].includes(role())){
      body.append(renderFinanceReconciliationControl(financeAccountsPayload));
      body.append(renderBoundedTaskControl({taskExecutionPayload,authorityPayload,taskRequestsPayload,taskListPayload}));
    }

    const latestRun=agenticLatestPlan?.run||(Array.isArray(runsPayload?.items)?runsPayload.items[0]:null);
    if(!latestRun){
      body.append(text("div","No governed plan has been generated for this workspace yet. Generate one to turn current finance and operating signals into auditable proposals.","owner-command-empty"));
      return;
    }

    const runCard=document.createElement("div");
    runCard.className="owner-agentic-run";
    const confidence=String(latestRun?.confidence||"medium");
    const mode=String(latestRun?.generationMode||latestRun?.generation_mode||"governed").replaceAll("_"," ");
    runCard.append(
      text("span",`${confidence.toUpperCase()} confidence · ${mode}`,"owner-agentic-kicker"),
      text("h4",latestRun?.goal||"Latest governed plan"),
      text("p",latestRun?.summary||"Plan generated from current tenant-scoped business signals.")
    );
    body.append(runCard);

    let proposals=[];
    if(agenticLatestPlan?.run?.id===latestRun?.id&&Array.isArray(agenticLatestPlan?.proposals)){
      proposals=agenticLatestPlan.proposals;
    }else if(Array.isArray(runsPayload?.proposals)){
      proposals=runsPayload.proposals.filter(item=>String(item?.run_id||"")===String(latestRun?.id||""));
    }

    const list=document.createElement("div");
    list.className="owner-agentic-proposals";
    if(proposals.length){
      proposals.sort((a,b)=>Number(a?.ordinal||0)-Number(b?.ordinal||0)).forEach(item=>list.append(agenticProposalCard(item)));
    }else{
      list.append(text("div","This plan has no pending proposals. Thebe will remain conservative rather than manufacture an action.","owner-command-empty"));
    }
    body.append(list);
  }

  async function renderAgenticGovernance(force=false){
    const body=q("#ownerAgenticBody");
    if(!body)return;
    if(force)agenticLatestPlan=null;
    const status=agenticStatusNode();
    if(status)status.textContent="Refreshing governed plan…";
    try{
      const [statusPayload,runsPayload,taskExecutionPayload,authorityPayload,taskRequestsPayload,taskListPayload,financeAccountsPayload]=await Promise.all([
        request("/api/agentic/status"),
        request("/api/agentic/runs"),
        request("/api/agentic/task-execution/status").catch(()=>null),
        request("/api/agentic/authority/delegations").catch(()=>({items:[]})),
        request("/api/agentic/task-execution/requests").catch(()=>({items:[]})),
        request("/api/agentic/task-execution/tasks").catch(()=>({items:[]})),
        request("/api/finance/accounts").catch(()=>({items:[]}))
      ]);
      renderAgenticSnapshot(statusPayload,runsPayload,taskExecutionPayload,authorityPayload,taskRequestsPayload,taskListPayload,financeAccountsPayload);
      if(status){
        status.textContent=taskExecutionPayload?.schemaReady===true&&taskExecutionPayload?.sessionExecutionEnabled===true&&taskExecutionPayload?.runtimeKillSwitch!==true
          ?(taskExecutionPayload?.executionMode==="platform_admin_canary"?"Platform-admin task canary enabled":"Bounded internal execution enabled")
          :"Bounded execution controlled";
      }
    }catch(error){
      body.replaceChildren(text(
        "div",
        "Governed planning is temporarily unavailable. No fallback action will be executed.",
        "owner-command-empty"
      ));
      if(status)status.textContent=String(error?.message||"Agentic planning unavailable").slice(0,180);
    }
  }

  async function generateAgenticPlan(){
    if(agenticBusy)return;
    agenticBusy=true;
    const status=agenticStatusNode();
    if(status)status.textContent="Observing business state and generating a governed plan…";
    try{
      agenticLatestPlan=await request("/api/agentic/plan",{
        method:"POST",
        body:JSON.stringify({goal:"Protect the business and identify the safest next actions from current authoritative workspace signals."})
      });
      if(status)status.textContent="Plan generated. Review proposals before recording any decision.";
      await renderAgenticGovernance(false);
    }catch(error){
      if(status)status.textContent=String(error?.message||"Could not generate governed plan").slice(0,180);
    }finally{
      agenticBusy=false;
      const buttonNode=q("#ownerAgenticBody .owner-agentic-control-buttons .btn");
      if(buttonNode)buttonNode.disabled=false;
    }
  }

  function createShell(){
    const parent=q("#homeDecisionCenter");
    if(!parent)return null;
    let shell=q("#ownerCommandCentre");
    if(shell)return shell;

    shell=document.createElement("section");
    shell.id="ownerCommandCentre";
    shell.className="owner-command-centre";
    shell.setAttribute("aria-labelledby","ownerCommandTitle");
    shell.dataset.release=RELEASE;

    const head=document.createElement("div");
    head.className="owner-command-head";
    const copy=document.createElement("div");
    copy.append(text("div","Business owner brief","section-eyebrow"));
    const title=text("h3","What needs your attention today");
    title.id="ownerCommandTitle";
    copy.append(
      title,
      text(
        "p",
        "Thebe Analytics connects money, sales, operations and compliance so the first screen explains what changed, what needs attention and which records support the signal.",
        "muted"
      )
    );
    head.append(copy,button("Refresh brief",()=>renderOwnerBrief(true),"btn alt"));
    shell.append(head);

    const summary=text("div","Building your business brief…","owner-command-summary");
    summary.id="ownerCommandSummary";
    shell.append(summary);

    const sources=document.createElement("div");
    sources.className="owner-source-note";
    sources.id="ownerSourceNote";
    shell.append(sources);

    const signals=document.createElement("div");
    signals.className="owner-signal-list";
    signals.id="ownerSignalList";
    shell.append(signals);

    const analytics=document.createElement("section");
    analytics.className="owner-panel owner-analytics-panel";
    analytics.id="ownerAnalyticsPanel";
    shell.append(analytics);

    const grid=document.createElement("div");
    grid.className="owner-decision-grid";
    const actions=document.createElement("section");
    actions.className="owner-panel";
    actions.id="ownerActionPanel";
    const simulation=document.createElement("section");
    simulation.className="owner-panel owner-sim-card";
    simulation.id="ownerSimulationPanel";
    grid.append(actions,simulation);
    shell.append(grid);

    const agentic=document.createElement("section");
    agentic.className="owner-agentic-panel";
    agentic.id="ownerAgenticPanel";
    const agenticHead=document.createElement("div");
    agenticHead.className="owner-agentic-head";
    const agenticCopy=document.createElement("div");
    agenticCopy.append(
      text("div","Thebe AI · Super Agent","section-eyebrow"),
      text("h4","Ask anything · Observe → reason → recommend → approve → bounded execute"),
      text("p","Ask Thebe company-specific or general questions in one place. Company answers use tenant-scoped records when relevant; recommendations remain read-only until an existing approval and Runtime Guard path explicitly allows a bounded action.","muted")
    );
    const agenticStatus=text("span","Execution controlled","owner-input-status");
    agenticStatus.id="ownerAgenticStatus";
    agenticHead.append(agenticCopy,agenticStatus);
    const agenticBody=document.createElement("div");
    agenticBody.className="owner-agentic-body";
    agenticBody.id="ownerAgenticBody";
    agentic.append(agenticHead,agenticBody);
    shell.append(agentic);

    const salesDetails=document.createElement("details");
    salesDetails.className="owner-sales-workspace";
    salesDetails.id="ownerSalesWorkspace";
    const salesSummary=text("summary","Sales intelligence & quotations");
    salesSummary.id="ownerSalesSummary";
    salesDetails.append(salesSummary);
    const salesBody=document.createElement("div");
    salesBody.className="owner-sales-body";
    salesBody.id="ownerSalesBody";
    salesDetails.append(salesBody);
    shell.append(salesDetails);

    const settings=document.createElement("details");
    settings.className="owner-inputs";
    settings.id="ownerDecisionInputs";
    settings.append(text("summary","Business targets & scenario assumptions"));
    const inputsBody=document.createElement("div");
    inputsBody.className="owner-inputs-body";
    inputsBody.id="ownerInputsBody";
    settings.append(inputsBody);
    shell.append(settings);

    const anchor=q(".home-status-strip",parent);
    parent.insertBefore(shell,anchor||null);
    return shell;
  }

  function openSalesWorkspace(){
    const details=q("#ownerSalesWorkspace");
    if(!details)return;
    details.open=true;
    details.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function sourcePill(label,kind){
    return text("span",label,`owner-source-pill ${kind||""}`);
  }

  function renderSources(model,inputs){
    const box=q("#ownerSourceNote");
    if(!box)return;
    box.replaceChildren();
    box.append(sourcePill(
      `${model.sampleDays} historical reporting day${model.sampleDays===1?"":"s"}`,
      "reported"
    ));
    if(model.branch)box.append(sourcePill("Location operating baselines","reported"));
    if(model.finance?.authority?.canonical)box.append(sourcePill("Canonical finance ledger","reported"));
    if(model.businessBrief)box.append(sourcePill("Unified Thebe Business Context","reported"));
    if(model.businessAnalytics)box.append(sourcePill("Business Analytics v1","reported"));
    if(model.businessBrief?.moneyIntelligence?.available)box.append(sourcePill("Deterministic Money Intelligence","reported"));
    const confirmedMemoryCount=Number(model.businessBrief?.durableMemory?.items?.length||0);
    if(confirmedMemoryCount>0)box.append(sourcePill(`${confirmedMemoryCount} owner-confirmed business memor${confirmedMemoryCount===1?"y":"ies"}`,"input"));
    if(model.sales?.opportunities.length){
      box.append(sourcePill(`${model.sales.opportunities.length} recorded quotations`,"reported"));
    }
    if(model.sales?.campaigns.length)box.append(sourcePill("Campaign attribution","reported"));
    if([
      inputs.monthlyRevenueTargetBwp,
      inputs.currentCashBwp,
      inputs.monthlyCashOutflowsBwp,
      inputs.monthlyLabourCostBwp,
      inputs.sameMonthCollectionPct
    ].some(value=>value!==null)){
      box.append(sourcePill("Owner-entered financial assumptions","input"));
    }
    if(model.projectedMonthlyRevenue!==null||model.salesRevenueScenario>0){
      box.append(sourcePill("Transparent Thebe projection","estimate"));
    }
  }

  function signalCard({label,value,title,detail,tone="neutral",actionLabel,action}){
    const card=document.createElement("article");
    card.className="owner-signal";
    card.dataset.tone=tone;
    const top=document.createElement("div");
    top.className="owner-signal-top";
    top.append(
      text("span",label,"owner-signal-label"),
      text("span",value,"owner-signal-value")
    );
    card.append(top,text("h4",title),text("p",detail));
    if(actionLabel&&action)card.append(button(actionLabel,action,"btn soft"));
    return card;
  }

  function renderBusinessAnalytics(analytics){
    const panel=q("#ownerAnalyticsPanel");
    if(!panel)return;
    panel.replaceChildren();
    const head=document.createElement("div");
    head.className="between row";
    const copy=document.createElement("div");
    copy.append(
      text("div","Analytics v1","section-eyebrow"),
      text("h4","One management view across the business"),
      text("p","Deterministic analytics from Thebe's governed records. Cash movement is not presented as accounting profit, and missing evidence is shown rather than guessed.","muted")
    );
    head.append(copy);
    panel.append(head);
    if(!analytics){
      panel.append(text("div","Analytics is unavailable until the unified Business Context can be read securely.","owner-command-empty"));
      return;
    }
    const grid=document.createElement("div");
    grid.className="owner-signal-list";
    const domains=analytics.domains||{},m=domains.money||{},s=domains.sales||{},o=domains.operations||{},co=domains.compliance||{},p=domains.property||{};
    const complianceCoverageStatus=String(co.ruleCoverageStatus||"");
    const complianceCoverageInactive=complianceCoverageStatus==="inactive";
    const complianceCoverageUnknown=complianceCoverageStatus==="unknown";
    const net=Number(m.current30NetCashMovementMinor||0),inChange=m.inflowChangePct,outChange=m.outflowChangePct;
    grid.append(signalCard({
      label:"Money · 30 days",value:money(net/100),
      title:net<0?"Recorded outflows exceeded inflows.":"Recorded inflows covered outflows.",
      detail:`Inflow ${money(Number(m.current30InflowMinor||0)/100)} · outflow ${money(Number(m.current30OutflowMinor||0)/100)} · inflow change ${inChange==null?"—":pct(Number(inChange)*100)} · outflow change ${outChange==null?"—":pct(Number(outChange)*100)}. Cash movement only; not accounting profit.`,
      tone:net<0?"risk":"positive"
    }));
    grid.append(signalCard({
      label:"Collections",value:money(Number(m.overdueReceivablesMinor||0)/100),
      title:Number(m.overdueReceivablesMinor||0)>0?"Customer money is overdue.":"No overdue receivable balance is currently recorded.",
      detail:`${money(Number(m.outstandingReceivablesMinor||0)/100)} total outstanding receivables. Thebe never assumes overdue invoices will be collected.`,
      tone:Number(m.overdueReceivablesMinor||0)>0?"risk":"positive"
    }));
    grid.append(signalCard({
      label:"Supplier commitments · 14 days",value:money(Number(m.payablesDue14dMinor||0)/100),
      title:Number(m.payableShortfall14dMinor||0)>0?"Recorded cash is short against near-term supplier commitments.":"Near-term supplier commitments are visible against recorded cash.",
      detail:`${m.payableCoverage14dRatio==null?"Payable cover unavailable":`Payable cover ${Number(m.payableCoverage14dRatio).toFixed(2)}x`} · overdue payables ${money(Number(m.overduePayablesMinor||0)/100)}.`,
      tone:Number(m.payableShortfall14dMinor||0)>0?"risk":"neutral"
    }));
    grid.append(signalCard({
      label:"Sales pipeline",value:money(Number(s.openQuotationValueBwp||0)),
      title:`${Number(s.openQuotationCount||0)} open quotation${Number(s.openQuotationCount||0)===1?"":"s"} · ${Number(s.dormantQuotationCount||0)} dormant.`,
      detail:`Dormant recorded quote value ${money(Number(s.dormantQuotationValueBwp||0))}. Sales pipeline is owner-recorded and remains separate from canonical finance revenue.`,
      tone:Number(s.dormantQuotationCount||0)>0?"risk":"neutral"
    }));
    grid.append(signalCard({
      label:"Operations & compliance",
      value:complianceCoverageInactive
        ?"Coverage inactive"
        :complianceCoverageUnknown
          ?"Coverage unknown"
          :`${Number(o.criticalPerformanceSignals||0)} critical · ${Number(co.overdueCount||0)} overdue`,
      title:complianceCoverageInactive
        ?"No published regulatory rules are active."
        :complianceCoverageUnknown
          ?"Regulatory rule coverage could not be verified."
          :(o.latestSummaryDate?`Operations last summarized ${o.latestSummaryDate}.`:"Operations summary is not yet available."),
      detail:complianceCoverageInactive
        ?`${Number(o.failedWorkflowCount||0)} failed workflow(s) · ${Number(co.approvedUnpublishedRuleCount||0)} approved-but-unpublished rule(s). A zero overdue count is not compliance assurance until reviewed rules are published through governance.`
        :complianceCoverageUnknown
          ?`${Number(o.failedWorkflowCount||0)} failed workflow(s). Compliance obligations remain visible, but Thebe will not infer regulatory coverage from missing rule data.`
          :`${Number(o.failedWorkflowCount||0)} failed workflow(s) · ${Number(co.dueWithin14Days||0)} compliance item(s) due within 14 days.`,
      tone:complianceCoverageInactive||complianceCoverageUnknown||Number(o.criticalPerformanceSignals||0)>0||Number(co.overdueCount||0)>0?"risk":"neutral"
    }));
    grid.append(signalCard({
      label:"Property & valuation",value:p.portfolioAnalyticsAvailable?`${Number(p.assetCount||0)} asset${Number(p.assetCount||0)===1?"":"s"}`:"Not connected",
      title:p.portfolioAnalyticsAvailable?`${Number(p.valuedAssetCount||0)} of ${Number(p.assetCount||0)} active asset(s) have a recorded professional valuation.`:"Property portfolio records are not yet readable.",
      detail:p.portfolioAnalyticsAvailable?`${money(Number(p.recordedProfessionalValueMinor||0)/100)} recorded professional valuation value · ${money(Number(p.debtBalanceMinor||0)/100)} recorded debt · ${p.valuationCoveragePct==null?"—":pct(Number(p.valuationCoveragePct))} valuation coverage · ${Number(p.professionalValuationRenewalDueCount||0)} review due · ${Number(p.valuationReportEvidenceGapCount||0)} report-evidence gap(s). Thebe does not create or certify market value.`:"The underwriting calculator remains scenario-only until the canonical property register is available.",
      tone:Number(p.unvaluedAssetCount||0)>0||Number(p.staleProfessionalValuationCount||0)>0||Number(p.professionalValuationRenewalDueCount||0)>0||Number(p.valuationReportEvidenceGapCount||0)>0?"risk":"neutral",
      actionLabel:p.portfolioAnalyticsAvailable?"Open property tools":null,
      action:p.portfolioAnalyticsAvailable?()=>route("propertyintelligence"):null
    }));
    grid.append(signalCard({
      label:"Data readiness",value:String(analytics.dataQuality?.readiness||"limited").replace(/^./,x=>x.toUpperCase()),
      title:analytics.summary?.headline||"Analytics source readiness.",
      detail:"Finance reconciliation, Money Intelligence and operations evidence determine readiness. Missing evidence is never filled with generated facts.",
      tone:analytics.dataQuality?.readiness==="strong"?"positive":analytics.dataQuality?.readiness==="limited"?"risk":"neutral"
    }));
    panel.append(grid);
    panel.append(text("p","Property analytics use the canonical register; market value comes only from a recorded external professional valuation report. Missing signed-report evidence remains a visible gap. Thebe does not certify, sign or independently verify valuations.","muted small"));
  }

  function renderSignals(model){
    const box=q("#ownerSignalList");
    if(!box)return;
    box.replaceChildren();

    if(model.finance){
      const recon=model.finance.reconciliation||{},exposure=Number(recon.unresolvedExposureMinor||0)/100;
      box.append(signalCard({label:"Finance integrity",value:recon.unresolvedCount?`${recon.unresolvedCount} exception${recon.unresolvedCount===1?"":"s"}`:(recon.stale?"Review due":"Reconciled"),title:recon.unresolvedCount?`${money(exposure)} remains outside a completed reconciliation.`:(recon.stale?"The finance ledger needs a current reconciliation.":"The latest finance reconciliation has no recorded difference."),detail:`Canonical BWP ledger · ${model.finance.imports?.transactions||0} imported transaction${Number(model.finance.imports?.transactions||0)===1?"":"s"} · no estimate substituted.`,tone:recon.unresolvedCount||recon.stale?"risk":"positive"}));
    }

    const moneyIntel=model.businessBrief?.moneyIntelligence;
    if(moneyIntel?.available){
      const trend=moneyIntel.trend||{},current=trend.current30||{},netMinor=Number(current.net||0);
      box.append(signalCard({
        label:"30-day cash movement",
        value:money(netMinor/100),
        title:netMinor<0?"Recorded cash outflows exceeded inflows over the last 30 days.":"Recorded inflows covered outflows over the last 30 days.",
        detail:`Recorded inflows ${money(Number(current.inflow||0)/100)} · outflows ${money(Number(current.outflow||0)/100)}. This is ledger history, not a forecast.`,
        tone:netMinor<0?"risk":"positive"
      }));
      const runway=moneyIntel.assumptions?.estimatedRunwayDays;
      if(runway!==null&&runway!==undefined){
        box.append(signalCard({
          label:"Cash runway",
          value:`${Number(runway).toFixed(Number(runway)<10?1:0)} days`,
          title:"Runway uses your owner-entered monthly outflow assumption.",
          detail:"This estimate is deliberately separated from authoritative ledger facts and does not authorize spending.",
          tone:Number(runway)<45?"risk":"neutral"
        }));
      }
      const spend=moneyIntel.spendEnvelope;
      if(spend?.ready===true)box.append(signalCard({
        label:"Spend this week",
        value:money(Number(spend.discretionaryEnvelopeMinor||0)/100),
        title:Number(spend.discretionaryEnvelopeMinor||0)>0
          ?"Conservative 7-day discretionary planning envelope."
          :"No discretionary cash is left after the protected reserves in this scenario.",
        detail:`Protects ${money(Number(spend.recordedSupplierPayablesDue7dMinor||0)/100)} recorded supplier payables due now/within 7 days + ${money(Number(spend.payrollReserveMinor||0)/100)} full monthly labour reserve + ${money(Number(spend.minimumCashBufferMinor||0)/100)} minimum cash buffer. Assumes zero receivables collected; unknown obligations are not reserved. This is not spending authorization.`,
        tone:Number(spend.discretionaryEnvelopeMinor||0)>0?"neutral":"risk"
      }));
      else if(spend?.state==="needs_inputs_and_finance_review")box.append(signalCard({
        label:"Spend this week",
        value:"Needs review",
        title:"Thebe needs both owner assumptions and current finance evidence before showing an amount.",
        detail:"Add monthly labour cost and minimum cash buffer, refresh finance reconciliation, and confirm the supplier-payables ledger is available. Thebe will not calculate a spend envelope until all blockers are cleared.",
        tone:"risk"
      }));
      else if(Array.isArray(spend?.missingInputs)&&spend.missingInputs.length)box.append(signalCard({
        label:"Spend this week",
        value:"Needs inputs",
        title:"Thebe will not calculate a discretionary spend envelope without the required owner assumptions.",
        detail:"Add monthly labour cost and minimum cash buffer. Thebe then protects those amounts plus recorded supplier payables due now/within 7 days and assumes no receivables are collected.",
        tone:"neutral"
      }));
      else if(spend?.state==="needs_finance_review")box.append(signalCard({
        label:"Spend this week",
        value:"Finance review",
        title:"Thebe is withholding the spend envelope because core finance evidence is not current.",
        detail:"Refresh finance reconciliation and confirm the supplier-payables ledger is available. No spendable amount is shown while either evidence gate is unresolved.",
        tone:"risk"
      }));
      const scenario=moneyIntel.scenario||{},horizons=Array.isArray(scenario.horizons)?scenario.horizons:[],h30=horizons.find(item=>Number(item?.days)===30);
      if(h30){
        const ending=Number(h30.ownerAssumptionEndingCashMinor||0)/100,below=h30.belowOwnerBuffer===true;
        box.append(signalCard({
          label:"30-day cash scenario",
          value:money(ending),
          title:below?"Owner-assumption cash falls below your minimum buffer in the 30-day scenario.":"Owner-assumption cash remains above the entered minimum buffer in the 30-day scenario.",
          detail:"Uses recorded 30-day cash run-rate plus owner-entered outflows and collection assumptions. This is a scenario projection, not an accounting forecast.",
          tone:below?"risk":"neutral"
        }));
      }
      const proxy=scenario.cashFlowMarginProxyPct;
      if(proxy!==null&&proxy!==undefined)box.append(signalCard({
        label:"Cash-flow margin proxy",
        value:pct(Number(proxy)*100),
        title:Number(proxy)<0?"Recorded 30-day cash outflows exceeded recorded inflows.":"Recorded 30-day inflows exceeded recorded outflows.",
        detail:"Cash-flow proxy only. It is not gross margin, net profit, or an accounting profitability measure.",
        tone:Number(proxy)<0?"risk":"positive"
      }));
      const commitments=moneyIntel.commitments||{},oneOff=Number(commitments.totalUntimedOneOffMinor||0);
      if(oneOff>0)box.append(signalCard({
        label:"Planned commitments",
        value:money(oneOff/100),
        title:"Owner-entered one-off commitments are included as a separate planning pressure.",
        detail:"Timing is not inferred. These are assumptions, not accounts-payable records or authorized spending.",
        tone:moneyIntel.signals?.some(item=>item?.key==="commitment_pressure")?"risk":"neutral"
      }));
      const concentration=Array.isArray(moneyIntel.debitConcentrations)?moneyIntel.debitConcentrations[0]:null;
      if(concentration?.shareOfCurrent30Outflow!=null)box.append(signalCard({
        label:"Debit concentration",
        value:pct(Number(concentration.shareOfCurrent30Outflow)*100),
        title:(concentration.descriptor||"A repeated debit description")+" represents a material share of recorded 30-day outflows.",
        detail:Number(concentration.transactionCount||0)+" transaction(s). Description-based grouping only; Thebe has not verified a supplier identity.",
        tone:Number(concentration.shareOfCurrent30Outflow)>=0.35?"risk":"neutral"
      }));
      const calendar=moneyIntel.cashCalendar||{},next14=calendar.next14||{};
      if(Number(next14.committedOutflowMinor||0)>0){
        const stress=moneyIntel.commitmentStress||{},coverage=stress.coverageRatio;
        box.append(signalCard({
          label:"Supplier commitments · 14 days",
          value:money(Number(next14.committedOutflowMinor||0)/100),
          title:Number(stress.shortfallMinor||0)>0
            ?`Recorded cash is short by ${money(Number(stress.shortfallMinor||0)/100)} against recorded supplier payables due now/within 14 days.`
            :"Recorded overdue supplier payables plus payables due within 14 days.",
          detail:(coverage==null?"":`Payable cover: ${Number(coverage).toFixed(2)}x · `)+"Canonical payable ledger only. Other future outflows are excluded, and potential customer receipts are not assumed collected.",
          tone:Number(stress.shortfallMinor||0)>0||Number(coverage||99)<1.25?"risk":"neutral"
        }));
      }
      if(Number(next14.potentialReceivableMinor||0)>0)box.append(signalCard({
        label:"Potential receivables · 14 days",
        value:money(Number(next14.potentialReceivableMinor||0)/100),
        title:"Issued customer invoices already overdue or due within 14 days.",
        detail:"Potential inflow only. Overdue invoices are included for collection attention, but Thebe does not add any amount to committed cash until a recorded transaction is allocated to the invoice.",
        tone:"neutral"
      }));
      const collectionAttention=(moneyIntel.collectionBehaviors||[]).find(item=>item?.attention==="higher_attention"||item?.attention==="watch");
      if(collectionAttention)box.append(signalCard({
        label:"Collection attention",
        value:money(Number(collectionAttention.overdueMinor||0)/100),
        title:(collectionAttention.customerName||"A customer")+" needs collection attention.",
        detail:collectionAttention.historicalOnTimeRate==null
          ?"Current overdue age is elevated, but there is not enough settled-invoice history for a historical payment pattern."
          :"Historical on-time rate: "+pct(Number(collectionAttention.historicalOnTimeRate)*100)+". This is historical behavior, not a probability of future payment.",
        tone:collectionAttention.attention==="higher_attention"?"risk":"neutral"
      }));
      const expenseCategory=moneyIntel.expenseLearning?.categories?.[0];
      if(expenseCategory?.totalOutflowMinor>0)box.append(signalCard({
        label:"Matched expense concentration",
        value:pct(Number(expenseCategory.shareOfCurrent30Outflow||0)*100),
        title:(expenseCategory.expenseCategory||"Other")+" is the largest 30-day category matched through confirmed supplier aliases.",
        detail:"Management signal only. Thebe has not posted an accounting classification or journal entry.",
        tone:Number(expenseCategory.shareOfCurrent30Outflow||0)>=0.5?"risk":"neutral"
      }));
      const supplierTrend=(moneyIntel.supplierSpendTrends||[]).find(item=>item?.attention==="increase");
      if(supplierTrend)box.append(signalCard({
        label:"Supplier cost watch",
        value:"+"+pct(Number(supplierTrend.changePct||0)*100),
        title:(supplierTrend.supplierName||"Confirmed supplier")+" matched cash outflow increased versus the prior 30 days.",
        detail:`Current ${money(Number(supplierTrend.current30OutflowMinor||0)/100)} · prior ${money(Number(supplierTrend.prior30OutflowMinor||0)/100)} · ${Number(supplierTrend.currentTransactionCount||0)} current transaction(s). This can reflect volume, timing or price; it is not a unit-price inflation claim.`,
        tone:"risk"
      }));
      const payableTop=moneyIntel.payableConcentration?.topSupplier;
      if(payableTop?.shareOfOutstanding>=0.5)box.append(signalCard({
        label:"Supplier payable concentration",
        value:pct(Number(payableTop.shareOfOutstanding||0)*100),
        title:(payableTop.supplierName||"One supplier")+" holds a large share of recorded outstanding supplier payables.",
        detail:`${money(Number(payableTop.outstandingMinor||0)/100)} outstanding across ${Number(payableTop.outstandingPayableCount||0)} payable(s). Supplier identity comes from the canonical supplier ledger.`,
        tone:"risk"
      }));
      const largeDebits=Array.isArray(trend.largeDebits)?trend.largeDebits.length:0;
      if(largeDebits>0)box.append(signalCard({
        label:"Large debits",
        value:String(largeDebits),
        title:"Recent debits crossed Thebe’s deterministic review threshold.",
        detail:"Review the underlying transactions before treating any debit as unusual or incorrect.",
        tone:"risk"
      }));
    }

    if(model.projectedMonthlyRevenue!==null&&model.target){
      const gap=model.targetGapPct||0;
      box.append(signalCard({
        label:"Revenue pace",
        value:`${money(model.projectedMonthlyRevenue)} projected`,
        title:gap>0
          ?`Revenue pace is ${pct(gap)} below your monthly target.`
          :`Revenue pace is ${pct(gap)} above your monthly target.`,
        detail:`Projection uses your ${model.operatingDays}-day operating-month assumption and the learned ${model.sampleDays}-day reported revenue baseline. Target: ${money(model.target)}.`,
        tone:gap>5?"risk":gap<-5?"positive":"neutral",
        actionLabel:"Review daily reports",
        action:()=>route("dailyreports")
      }));
    }else{
      box.append(signalCard({
        label:"Revenue pace",
        value:model.sampleDays>=3?`${money(model.dailyReportedRevenue)}/day baseline`:"Learning",
        title:model.sampleDays>=3
          ?"Thebe has a reported revenue baseline, but no monthly target projection yet."
          :"Thebe needs more reporting history before it can judge revenue pace.",
        detail:model.sampleDays>=3
          ?"Add your monthly revenue target and operating days to compare run-rate with plan."
          :"At least three historical reporting days are required before trend advice is treated as decision-ready.",
        tone:"neutral"
      }));
    }

    const watch=model.sales?.conversionWatch;
    if(watch&&watch.change<0){
      box.append(signalCard({
        label:"Sales conversion",
        value:`${pct(watch.current.conversion)} now`,
        title:`${watch.location} resolved-quote conversion fell from ${pct(watch.previous.conversion)} to ${pct(watch.current.conversion)}.`,
        detail:`Comparison uses resolved quotations issued in consecutive 30-day windows (${watch.previous.resolved} prior and ${watch.current.resolved} current). Open quotations are excluded until won or lost.`,
        tone:watch.change<=-5?"risk":"neutral",
        actionLabel:"Open sales intelligence",
        action:openSalesWorkspace
      }));
    }else if(model.branch){
      const change=model.branch.revenueChange;
      const hasRevenue=change!==null;
      const delta=hasRevenue?change:model.branch.customerChange;
      const metric=hasRevenue?"reported revenue":"reported customers/jobs";
      box.append(signalCard({
        label:"Location watch",
        value:`${delta<0?"↓":"↑"} ${pct(delta)}`,
        title:`${model.branch.locationName} ${metric} is ${pct(delta)} ${delta<0?"below":"above"} its 30-day baseline.`,
        detail:"Thebe compares the recent 7-day run-rate with the location's learned 30-day baseline. Review source reports before attributing a cause.",
        tone:delta<-10?"risk":delta>10?"positive":"neutral",
        actionLabel:"Open source reports",
        action:()=>route("dailyreports")
      }));
    }else{
      box.append(signalCard({
        label:"Sales conversion",
        value:"Learning",
        title:"Record enough resolved quotations to compare sales conversion by location.",
        detail:"Thebe waits for at least three won/lost quotations in both comparison windows before calling a conversion change.",
        tone:"neutral",
        actionLabel:"Add quotations",
        action:openSalesWorkspace
      }));
    }

    if(model.sales?.dormantCount>0){
      const rate=model.sales.recoveryRate!==null
        ?` · ${pct(model.sales.recoveryRate)} ${model.sales.recoveryRateSource}`
        :"";
      box.append(signalCard({
        label:"Dormant quotations",
        value:`${model.sales.dormantCount} · ${money(model.sales.dormantValue)}`,
        title:`${model.sales.dormantCount} open quotation${model.sales.dormantCount===1?" has":"s have"} gone beyond the follow-up threshold.`,
        detail:`Dormant means no recorded follow-up for at least ${model.sales.source.settings.dormantDays} days${rate}.`,
        tone:"risk",
        actionLabel:"Review quotations",
        action:openSalesWorkspace
      }));
    }else{
      box.append(signalCard({
        label:"Dormant quotations",
        value:"0",
        title:"No recorded open quotation is currently beyond the follow-up threshold.",
        detail:`Threshold: ${model.sales?.source.settings.dormantDays||10} days since the last recorded follow-up.`,
        tone:"positive",
        actionLabel:"Open quotations",
        action:openSalesWorkspace
      }));
    }

    if(model.labourShare!==null){
      box.append(signalCard({
        label:"Labour cost",
        value:pct(model.labourShare),
        title:`Labour cost is ${pct(model.labourShare)} of projected reported revenue.`,
        detail:`Uses your monthly labour-cost assumption (${money(model.labour)}) divided by the current revenue run-rate projection. Treat this as a management ratio, not an employee performance score.`,
        tone:model.labourShare>=30?"risk":model.labourShare<=20?"positive":"neutral",
        actionLabel:"Review people & operations",
        action:()=>route("peopleops")
      }));
    }else{
      box.append(signalCard({
        label:"Labour cost",
        value:"Not configured",
        title:"Add monthly labour cost to monitor cost pressure against revenue pace.",
        detail:"Thebe will calculate the ratio from your assumption without inferring individual employee performance.",
        tone:"neutral"
      }));
    }

    if(model.daysToBuffer!==null){
      const days=Math.floor(model.daysToBuffer);
      box.append(signalCard({
        label:"Cash buffer",
        value:`${days} days`,
        title:`Cash is projected to reach your minimum buffer in about ${days} days at the current scenario run-rate.`,
        detail:`Scenario uses current cash ${money(model.currentCash)}, minimum buffer ${money(model.cashFloor)}, projected reported revenue and your monthly cash-outflow assumption.`,
        tone:days<60?"risk":days>120?"positive":"neutral"
      }));
    }else if(model.monthEndBefore!==null&&model.cashFloor!==null){
      box.append(signalCard({
        label:"Cash buffer",
        value:money(model.monthEndBefore),
        title:model.monthEndBefore<model.cashFloor
          ?"Projected month-end cash is below your minimum buffer."
          :"Projected month-end cash stays above your minimum buffer in this scenario.",
        detail:`Minimum buffer: ${money(model.cashFloor)}. This is a scenario estimate, not an accounting forecast.`,
        tone:model.monthEndBefore<model.cashFloor?"risk":"positive"
      }));
    }else{
      box.append(signalCard({
        label:"Cash buffer",
        value:"Not configured",
        title:"Add current cash, monthly cash outflows and your minimum buffer to unlock cash-risk warnings.",
        detail:"Thebe will keep the result clearly labelled as a scenario until accounting/bank integrations provide authoritative balances.",
        tone:"neutral"
      }));
    }
  }

  function actionRow(index,title,detail,label,fn){
    const row=document.createElement("div");
    row.className="owner-action";
    row.append(text("span",index,"owner-action-index"));
    const copy=document.createElement("div");
    copy.className="owner-action-copy";
    copy.append(text("b",title),text("span",detail));
    row.append(copy);
    if(label&&fn)row.append(button(label,fn,"btn soft"));
    return row;
  }

  function recommendedActions(model){
    const actions=[];

    if(model.cashRisk&&model.purchase){
      actions.push({
        priority:100,
        title:`Delay or phase the ${money(model.purchase)} ${decisionInputs(latestStateEnvelope?.state||{}).plannedPurchaseLabel}.`,
        detail:`In this scenario, delaying the purchase improves month-end cash by ${money(model.purchase)} and directly protects the cash buffer.`,
        label:"See simulation",
        fn:()=>q("#ownerSimulationPanel")?.scrollIntoView({behavior:"smooth",block:"center"})
      });
    }

    if(model.sales?.dormantCount>0&&(model.targetGapPct===null||model.targetGapPct>0||model.cashRisk)){
      const potential=model.sales.recoveryPotentialRevenue!==null
        ?` At the ${pct(model.sales.recoveryRate)} ${model.sales.recoveryRateSource}, this is a ${money(model.sales.recoveryPotentialRevenue)} booked-revenue scenario.`
        :"";
      actions.push({
        priority:96,
        title:`Follow up ${model.sales.dormantCount} dormant quotation${model.sales.dormantCount===1?"":"s"} worth ${money(model.sales.dormantValue)}.`,
        detail:`These quotations have exceeded the ${model.sales.source.settings.dormantDays}-day follow-up threshold.${potential}`,
        label:"Open quotations",
        fn:openSalesWorkspace
      });
    }

    const watch=model.sales?.conversionWatch;
    if(watch&&watch.change<=-3){
      actions.push({
        priority:92,
        title:`Investigate ${watch.location} sales conversion before changing price or staffing.`,
        detail:`Resolved-quote conversion moved from ${pct(watch.previous.conversion)} to ${pct(watch.current.conversion)} across consecutive 30-day quote cohorts. Check loss reasons and follow-up discipline before attributing a cause.`,
        label:"Review sales",
        fn:openSalesWorkspace
      });
    }

    const shift=model.sales?.campaignShift;
    if(shift){
      actions.push({
        priority:88,
        title:`Move ${money(shift.move)} of monthly spend from ${shift.worst.name} to ${shift.best.name}.`,
        detail:`Current attributed ROAS is ${shift.worst.roas.toFixed(2)}× versus ${shift.best.roas.toFixed(2)}×, each with at least three resolved quotations. If those economics persist, the shift models about ${money(shift.incrementalRevenue)} more attributable revenue.`,
        label:"Review campaigns",
        fn:openSalesWorkspace
      });
    }

    if(model.targetGapPct!==null&&model.targetGapPct>5){
      actions.push({
        priority:70,
        title:`Close the ${money(Math.max(0,model.targetGapBwp||0))} projected revenue gap with measurable sales actions.`,
        detail:"Use quotation follow-up, conversion and campaign evidence above before increasing total spend.",
        label:"Sales intelligence",
        fn:openSalesWorkspace
      });
    }

    if(model.labourShare!==null&&model.labourShare>=30){
      actions.push({
        priority:60,
        title:"Review labour cost against workload and sales capacity.",
        detail:`The current scenario ratio is ${pct(model.labourShare)}. Use rosters, overtime, vacancies and demand context; do not use this ratio alone for employment decisions.`,
        label:"People & operations",
        fn:()=>route("peopleops")
      });
    }

    if(model.branch&&((model.branch.revenueChange??model.branch.customerChange)??0)<-10){
      actions.push({
        priority:50,
        title:`Review ${model.branch.locationName} operating performance.`,
        detail:"Its recent run-rate is materially below its learned baseline. Check source reports and operational blockers before changing spend or staffing.",
        label:"Open reports",
        fn:()=>route("dailyreports")
      });
    }

    return actions.sort((a,b)=>b.priority-a.priority).slice(0,3);
  }

  function renderActions(model){
    const panel=q("#ownerActionPanel");
    if(!panel)return;
    panel.replaceChildren();

    const head=document.createElement("div");
    head.className="owner-panel-head";
    const copy=document.createElement("div");
    copy.append(text("div","Recommended action","section-eyebrow"),text("h4","What Thebe recommends now"));
    head.append(copy,text("span","Decision support","badge"));
    panel.append(head);

    const list=document.createElement("div");
    list.className="owner-action-list";
    const actions=recommendedActions(model);
    if(actions.length){
      actions.forEach((action,index)=>{
        list.append(actionRow(index+1,action.title,action.detail,action.label,action.fn));
      });
    }else{
      list.append(actionRow(
        1,
        "Keep collecting operational and sales data and confirm your business targets.",
        "No decision threshold is currently strong enough for a specific financial recommendation. Thebe will stay conservative rather than manufacture one.",
        "Update assumptions",
        ()=>{
          const details=q("#ownerDecisionInputs");
          if(details){
            details.open=true;
            details.scrollIntoView({behavior:"smooth",block:"center"});
          }
        }
      ));
    }
    panel.append(list);
  }

  function renderSimulation(model){
    const panel=q("#ownerSimulationPanel");
    if(!panel)return;
    panel.replaceChildren();

    const head=document.createElement("div");
    head.className="owner-panel-head";
    const copy=document.createElement("div");
    copy.append(text("div","Simulation","section-eyebrow"),text("h4","What happens if you act?"));
    head.append(copy,text("span","Scenario","badge"));
    panel.append(head);

    if(model.monthEndBefore!==null&&model.recommendedCashImpact>0){
      const comparison=document.createElement("div");
      comparison.className="owner-sim-comparison";
      const before=document.createElement("div");
      before.className="owner-sim-value";
      before.append(text("span","Month-end cash · current plan"),text("b",money(model.monthEndBefore)));
      const arrow=text("div","→","owner-sim-arrow");
      const after=document.createElement("div");
      after.className="owner-sim-value";
      after.append(text("span","Recommended scenario"),text("b",money(model.monthEndAfter)));
      comparison.append(before,arrow,after);

      const parts=[];
      if(model.purchaseDelayImpact){
        parts.push(`${money(model.purchaseDelayImpact)} from delaying/phasing the planned purchase`);
      }
      if(model.salesCashImpact){
        parts.push(`${money(model.salesCashImpact)} same-month cash from the sales scenario`);
      }

      panel.append(
        comparison,
        text(
          "div",
          `Scenario improves month-end cash by ${money(model.recommendedCashImpact)}${parts.length?` (${parts.join(" + ")})`:""}.`,
          "owner-sim-impact"
        ),
        text(
          "div",
          `Sales revenue scenario: ${money(model.salesRevenueScenario)}. Same-month collection assumption: ${model.collectionPct!==null?pct(model.collectionPct):"not set"}. Revenue recovery uses recorded quotation/campaign economics and remains a scenario, not guaranteed cash.`,
          "owner-sim-caveat"
        )
      );
      return;
    }

    if(model.salesRevenueScenario>0){
      const value=document.createElement("div");
      value.className="owner-sim-value";
      value.append(
        text("span","Potential booked revenue · sales scenario"),
        text("b",money(model.salesRevenueScenario))
      );
      const detail=model.collectionPct===null
        ?"Add a same-month collection percentage under Business targets & scenario assumptions before Thebe translates this revenue scenario into projected cash."
        :`At ${pct(model.collectionPct)} same-month collection, the sales scenario represents about ${money(model.salesCashImpact)} cash.`;
      panel.append(value,text("div",detail,"owner-sim-caveat"));
      return;
    }

    if(model.monthEndBefore!==null){
      const value=document.createElement("div");
      value.className="owner-sim-value";
      value.append(text("span","Projected month-end cash"),text("b",money(model.monthEndBefore)));
      panel.append(
        value,
        text(
          "div",
          "Add a planned purchase, dormant quotations or campaign history to compare the current plan with an action scenario.",
          "owner-sim-caveat"
        )
      );
      return;
    }

    panel.append(text(
      "div",
      "Add current cash, monthly outflows and operating days to unlock cash simulation. Sales scenarios activate automatically as quotation and campaign history becomes decision-ready.",
      "owner-command-empty"
    ));
  }

  function field(label,{id,type="text",value="",placeholder="",min=null,max=null,step=null}={}){
    const wrap=document.createElement("div");
    const lab=text("label",label);
    lab.htmlFor=id;
    const input=document.createElement("input");
    input.id=id;
    input.type=type;
    if(value!==null&&value!==undefined&&value!=="")input.value=String(value);
    if(placeholder)input.placeholder=placeholder;
    if(min!==null)input.min=String(min);
    if(max!==null)input.max=String(max);
    if(step!==null)input.step=String(step);
    wrap.append(lab,input);
    return {wrap,input};
  }

  function selectField(label,{id,options=[],value=""}={}){
    const wrap=document.createElement("div");
    const lab=text("label",label);
    lab.htmlFor=id;
    const select=document.createElement("select");
    select.id=id;
    for(const option of options){
      const node=document.createElement("option");
      node.value=String(option.value);
      node.textContent=String(option.label);
      if(String(option.value)===String(value))node.selected=true;
      select.append(node);
    }
    wrap.append(lab,select);
    return {wrap,select};
  }

  function salesMetric(label,value,detail){
    const card=document.createElement("div");
    card.className="owner-sales-metric";
    card.append(text("span",label),text("b",value),text("small",detail));
    return card;
  }

  function statusBadge(status){
    return text("span",String(status||"").toUpperCase(),`owner-sales-status ${status||"open"}`);
  }

  function campaignById(model,id){
    return model.campaigns.find(c=>c.id===id)||null;
  }

  function salesStatusNode(){
    return q("#ownerSalesStatus");
  }

  function ensureSalesMutable(company){
    if(!company.salesIntelligence||typeof company.salesIntelligence!=="object"){
      company.salesIntelligence={
        version:1,
        settings:{dormantDays:10,dormantRecoveryPct:null},
        opportunities:[],
        campaigns:[]
      };
    }
    const sales=company.salesIntelligence;
    if(!sales.settings||typeof sales.settings!=="object"){
      sales.settings={dormantDays:10,dormantRecoveryPct:null};
    }
    if(!Array.isArray(sales.opportunities))sales.opportunities=[];
    if(!Array.isArray(sales.campaigns))sales.campaigns=[];
    return sales;
  }

  function queueCompanyMutation(mutator,statusNode=salesStatusNode()){
    if(!canEditSales()||!latestStateEnvelope?.state){
      if(statusNode)statusNode.textContent="Your role cannot change sales records.";
      return Promise.resolve(false);
    }

    stateWriteQueue=stateWriteQueue.then(async()=>{
      if(statusNode)statusNode.textContent="Saving…";
      const next=clone(latestStateEnvelope.state);
      const company=activeCompanyFromState(next);
      if(!company)throw new Error("Active company not found.");
      await mutator(company);
      const result=await request("/api/state",{
        method:"PUT",
        body:JSON.stringify({
          version:latestStateEnvelope.version,
          state:next
        })
      });
      latestStateEnvelope={
        version:Number(result?.version||latestStateEnvelope.version+1),
        state:next
      };
      if(statusNode)statusNode.textContent="Saved";
      await renderOwnerBrief(true);
      return true;
    }).catch(async error=>{
      if(statusNode){
        statusNode.textContent=String(error?.message||"Could not save sales data").slice(0,180);
      }
      try{latestStateEnvelope=await request("/api/state")}catch{}
      return false;
    });

    return stateWriteQueue;
  }

  function addQuotation(){
    const status=salesStatusNode();
    const reference=cleanText(q("#salesQuoteReference")?.value,120);
    const location=cleanText(q("#salesQuoteLocation")?.value,80);
    const value=Number(q("#salesQuoteValue")?.value||0);
    const quotedAt=String(q("#salesQuoteDate")?.value||"");
    const lastContactAt=String(q("#salesQuoteFollowup")?.value||quotedAt);
    const quoteStatus=String(q("#salesQuoteStatus")?.value||"open");
    const campaignId=String(q("#salesQuoteCampaign")?.value||"")||null;

    if(
      !reference
      ||!location
      ||!Number.isFinite(value)
      ||value<0
      ||!isoDateValid(quotedAt)
      ||!isoDateValid(lastContactAt)
      ||!["open","won","lost"].includes(quoteStatus)
    ){
      if(status)status.textContent="Complete the quotation reference, location, value and valid dates.";
      return;
    }

    queueCompanyMutation(company=>{
      const sales=ensureSalesMutable(company);
      if(sales.opportunities.length>=MAX_OPPORTUNITIES){
        throw new Error(`Quotation limit reached (${MAX_OPPORTUNITIES}). Export/archive older records before adding more.`);
      }
      if(campaignId&&!sales.campaigns.some(c=>String(c.id)===campaignId)){
        throw new Error("Selected campaign is no longer available.");
      }
      const now=new Date().toISOString();
      sales.opportunities.unshift({
        id:newId("quote"),
        reference,
        location,
        quoteValueBwp:value,
        quotedAt,
        lastContactAt,
        status:quoteStatus,
        closedAt:quoteStatus==="open"?null:lastContactAt,
        campaignId,
        createdAt:now,
        updatedAt:now
      });
    },status);
  }

  function addCampaign(){
    const status=salesStatusNode();
    const name=cleanText(q("#salesCampaignName")?.value,80);
    const spend=Number(q("#salesCampaignSpend")?.value||0);
    if(!name||!Number.isFinite(spend)||spend<0){
      if(status)status.textContent="Enter a campaign name and monthly spend.";
      return;
    }

    queueCompanyMutation(company=>{
      const sales=ensureSalesMutable(company);
      if(sales.campaigns.length>=MAX_CAMPAIGNS){
        throw new Error(`Campaign limit reached (${MAX_CAMPAIGNS}).`);
      }
      const now=new Date().toISOString();
      sales.campaigns.unshift({
        id:newId("campaign"),
        name,
        monthlySpendBwp:spend,
        active:true,
        createdAt:now,
        updatedAt:now
      });
    },status);
  }

  function updateQuote(id,action){
    const status=salesStatusNode();
    const today=gaboroneDate();
    queueCompanyMutation(company=>{
      const sales=ensureSalesMutable(company);
      const row=sales.opportunities.find(item=>String(item.id)===String(id));
      if(!row)throw new Error("Quotation no longer exists.");
      if(action==="followup"){
        row.lastContactAt=today;
        row.updatedAt=new Date().toISOString();
      }else if(action==="won"||action==="lost"){
        row.status=action;
        row.closedAt=today;
        row.lastContactAt=today;
        row.updatedAt=new Date().toISOString();
      }else if(action==="reopen"){
        row.status="open";
        row.closedAt=null;
        row.updatedAt=new Date().toISOString();
      }
    },status);
  }

  function saveSalesSettings(){
    const status=salesStatusNode();
    const dormantDays=Number(q("#salesDormantDays")?.value||10);
    const recoveryRaw=String(q("#salesRecoveryPct")?.value||"").trim();
    const recoveryPct=recoveryRaw===""?null:Number(recoveryRaw);
    if(
      !Number.isFinite(dormantDays)
      ||dormantDays<3
      ||dormantDays>90
      ||!(recoveryPct===null||(Number.isFinite(recoveryPct)&&recoveryPct>=0&&recoveryPct<=100))
    ){
      if(status)status.textContent="Dormant days must be 3–90 and recovery scenario 0–100%.";
      return;
    }

    queueCompanyMutation(company=>{
      const sales=ensureSalesMutable(company);
      sales.settings.dormantDays=Math.round(dormantDays);
      sales.settings.dormantRecoveryPct=recoveryPct;
    },status);
  }

  function renderSalesWorkspace(company,model){
    const body=q("#ownerSalesBody");
    const summary=q("#ownerSalesSummary");
    if(!body||!summary)return;
    summary.textContent=`Sales intelligence & quotations · ${model.openCount} open · ${model.dormantCount} dormant · ${model.campaigns.length} campaigns`;
    body.replaceChildren();

    const intro=document.createElement("div");
    intro.className="owner-sales-intro";
    const introCopy=document.createElement("div");
    introCopy.append(
      text("div","Commercial evidence","section-eyebrow"),
      text("h4","Turn quotations and marketing spend into decisions."),
      text(
        "p",
        "Record quotation outcomes, follow-up dates and campaign attribution. Thebe calculates conversion and campaign economics from these records; it does not invent customer activity."
      )
    );
    const status=text("span","","owner-input-status");
    status.id="ownerSalesStatus";
    intro.append(introCopy,status);
    body.append(intro);

    const metrics=document.createElement("div");
    metrics.className="owner-sales-metrics";
    metrics.append(
      salesMetric(
        "Open quotations",
        String(model.openCount),
        `${money(sum(model.opportunities.filter(row=>row.status==="open"),"quoteValueBwp"))} quoted value`
      ),
      salesMetric(
        "Dormant follow-up",
        String(model.dormantCount),
        `${money(model.dormantValue)} beyond ${model.source.settings.dormantDays} days`
      ),
      salesMetric(
        "Resolved conversion",
        model.current.conversion===null?"—":pct(model.current.conversion),
        `${model.current.won}/${model.current.resolved} won in current 30-day quote cohort`
      ),
      salesMetric(
        "Won quote value",
        money(model.current.wonRevenue),
        "Current 30-day quote cohort"
      )
    );
    body.append(metrics);

    if(canEditSales()){
      const forms=document.createElement("div");
      forms.className="owner-sales-forms";

      const quoteCard=document.createElement("section");
      quoteCard.className="owner-sales-form-card";
      quoteCard.append(
        text("h4","Add quotation / opportunity"),
        text(
          "p",
          "Use a customer or quotation reference only. Do not enter phone numbers, identity numbers, banking details or other sensitive personal data.",
          "muted small"
        )
      );
      const quoteGrid=document.createElement("div");
      quoteGrid.className="owner-sales-form-grid";

      const referenceField=field("Customer / quotation reference",{
        id:"salesQuoteReference",
        placeholder:"e.g. QT-1042 · Mpho Supplies"
      });
      const locationField=field("Location",{
        id:"salesQuoteLocation",
        placeholder:"e.g. Francistown"
      });
      const valueField=field("Quote value (P)",{
        id:"salesQuoteValue",
        type:"number",
        min:0,
        step:1
      });
      const dateField=field("Quote date",{
        id:"salesQuoteDate",
        type:"date",
        value:gaboroneDate()
      });
      const followField=field("Last follow-up",{
        id:"salesQuoteFollowup",
        type:"date",
        value:gaboroneDate()
      });
      const statusField=selectField("Status",{
        id:"salesQuoteStatus",
        value:"open",
        options:[
          {value:"open",label:"Open"},
          {value:"won",label:"Won"},
          {value:"lost",label:"Lost"}
        ]
      });
      const campaignOptions=[
        {value:"",label:"No campaign attribution"},
        ...model.campaigns.map(campaign=>({value:campaign.id,label:campaign.name}))
      ];
      const campaignField=selectField("Campaign",{
        id:"salesQuoteCampaign",
        options:campaignOptions
      });

      quoteGrid.append(
        referenceField.wrap,
        locationField.wrap,
        valueField.wrap,
        dateField.wrap,
        followField.wrap,
        statusField.wrap,
        campaignField.wrap
      );
      quoteCard.append(quoteGrid,button("Add quotation",addQuotation,"btn"));

      const campaignCard=document.createElement("section");
      campaignCard.className="owner-sales-form-card";
      campaignCard.append(
        text("h4","Campaign economics"),
        text(
          "p",
          "Monthly spend is compared with quote outcomes explicitly attributed to each campaign.",
          "muted small"
        )
      );
      const campaignGrid=document.createElement("div");
      campaignGrid.className="owner-sales-form-grid";
      const campaignName=field("Campaign name",{
        id:"salesCampaignName",
        placeholder:"e.g. Facebook Campaign A"
      });
      const campaignSpend=field("Monthly spend (P)",{
        id:"salesCampaignSpend",
        type:"number",
        min:0,
        step:1
      });
      const dormantDays=field("Dormant after days",{
        id:"salesDormantDays",
        type:"number",
        value:model.source.settings.dormantDays,
        min:3,
        max:90,
        step:1
      });
      const recovery=field("Dormant recovery scenario %",{
        id:"salesRecoveryPct",
        type:"number",
        value:model.source.settings.dormantRecoveryPct??"",
        placeholder:"blank = observed rate",
        min:0,
        max:100,
        step:.1
      });
      campaignGrid.append(
        campaignName.wrap,
        campaignSpend.wrap,
        dormantDays.wrap,
        recovery.wrap
      );
      const campaignActions=document.createElement("div");
      campaignActions.className="owner-sales-form-actions";
      campaignActions.append(
        button("Add campaign",addCampaign,"btn"),
        button("Save sales assumptions",saveSalesSettings,"btn alt")
      );
      campaignCard.append(campaignGrid,campaignActions);
      forms.append(quoteCard,campaignCard);
      body.append(forms);
    }

    const lists=document.createElement("div");
    lists.className="owner-sales-lists";

    const quoteList=document.createElement("section");
    quoteList.className="owner-sales-list-card";
    const quoteHead=document.createElement("div");
    quoteHead.className="owner-sales-list-head";
    quoteHead.append(
      text("h4","Recent quotations"),
      text("span",`${model.opportunities.length}/${MAX_OPPORTUNITIES} records`,"badge")
    );
    quoteList.append(quoteHead);

    const rows=document.createElement("div");
    rows.className="owner-sales-quote-list";
    const sorted=[...model.opportunities]
      .sort((a,b)=>String(b.quotedAt).localeCompare(String(a.quotedAt)))
      .slice(0,40);

    if(!sorted.length){
      rows.append(text(
        "div",
        "No quotations recorded yet. Add the first quotation above to activate conversion and dormant-follow-up intelligence.",
        "owner-command-empty"
      ));
    }else{
      for(const row of sorted){
        const card=document.createElement("article");
        card.className="owner-sales-quote";
        const top=document.createElement("div");
        top.className="owner-sales-quote-head";
        const copy=document.createElement("div");
        copy.append(
          text("b",row.reference),
          text("span",`${row.location} · quoted ${row.quotedAt} · ${money(row.quoteValueBwp)}`)
        );
        top.append(copy,statusBadge(row.status));
        card.append(top);

        const campaign=campaignById(model,row.campaignId);
        const age=daysSince(row.lastContactAt||row.quotedAt,gaboroneDate());
        card.append(text(
          "div",
          `Last follow-up: ${row.lastContactAt}${campaign?` · Campaign: ${campaign.name}`:""}${row.status==="open"&&age!==null?` · ${age} day${age===1?"":"s"} since follow-up`:""}`,
          "muted small"
        ));

        if(canEditSales()){
          const actions=document.createElement("div");
          actions.className="owner-sales-row-actions";
          if(row.status==="open"){
            actions.append(
              button("Followed up today",()=>updateQuote(row.id,"followup"),"btn soft"),
              button("Mark won",()=>updateQuote(row.id,"won"),"btn soft"),
              button("Mark lost",()=>updateQuote(row.id,"lost"),"btn soft")
            );
          }else{
            actions.append(button("Reopen",()=>updateQuote(row.id,"reopen"),"btn soft"));
          }
          card.append(actions);
        }
        rows.append(card);
      }
    }
    quoteList.append(rows);

    const campaignList=document.createElement("section");
    campaignList.className="owner-sales-list-card";
    const campaignHead=document.createElement("div");
    campaignHead.className="owner-sales-list-head";
    campaignHead.append(
      text("h4","Campaign performance"),
      text("span",`${model.campaigns.length}/${MAX_CAMPAIGNS} campaigns`,"badge")
    );
    campaignList.append(campaignHead);

    const campaignRows=document.createElement("div");
    campaignRows.className="owner-sales-campaign-list";
    if(!model.campaignStats.length){
      campaignRows.append(text(
        "div",
        "No campaigns recorded. Add campaign spend and attribute quotations to compare conversion and ROAS.",
        "owner-command-empty"
      ));
    }else{
      for(const campaign of model.campaignStats){
        const card=document.createElement("article");
        card.className="owner-sales-campaign";
        card.append(
          text("b",campaign.name),
          text(
            "span",
            `${money(campaign.monthlySpendBwp)} monthly spend · ${campaign.resolved} resolved quotations · ${campaign.won} won`
          ),
          text(
            "span",
            campaign.roas===null
              ?"ROAS unavailable until spend and won revenue are recorded"
              :`Attributed ROAS ${campaign.roas.toFixed(2)}× · won quote value ${money(campaign.wonRevenue)}`
          )
        );
        campaignRows.append(card);
      }
    }
    campaignList.append(campaignRows);
    lists.append(quoteList,campaignList);
    body.append(lists);

    if(model.campaignShift){
      const shift=model.campaignShift;
      const callout=document.createElement("div");
      callout.className="owner-sales-callout";
      callout.append(
        text(
          "b",
          `Campaign reallocation scenario: ${money(shift.move)} from ${shift.worst.name} → ${shift.best.name}`
        ),
        text(
          "span",
          `Observed current-cohort ROAS: ${shift.worst.roas.toFixed(2)}× → ${shift.best.roas.toFixed(2)}×. If those economics persist, the reallocation models about ${money(shift.incrementalRevenue)} additional attributable revenue without increasing total campaign spend.`
        )
      );
      body.append(callout);
    }
  }

  function inputField(label,key,value,{placeholder="",min="0",max="",step="1",type="number"}={}){
    const wrap=document.createElement("div");
    const lab=text("label",label);
    const id=`owner-${key}`;
    lab.htmlFor=id;
    const input=document.createElement("input");
    input.id=id;
    input.type=type;
    input.dataset.key=key;
    if(value!==null&&value!==undefined&&value!=="")input.value=String(value);
    if(placeholder)input.placeholder=placeholder;
    if(min!=="")input.min=String(min);
    if(max!=="")input.max=String(max);
    if(step!=="")input.step=String(step);
    wrap.append(lab,input);
    return wrap;
  }

  function renderInputs(inputs){
    const body=q("#ownerInputsBody");
    if(!body)return;
    body.replaceChildren();
    body.append(text(
      "div",
      "These values are owner-entered assumptions used only for decision support. Reported revenue and recorded sales outcomes remain separately labelled. Thebe will not present a scenario estimate as an accounting fact.",
      "owner-input-help"
    ));
    const grid=document.createElement("div");
    grid.className="owner-input-grid";
    grid.append(
      inputField("Monthly revenue target (P)","monthlyRevenueTargetBwp",inputs.monthlyRevenueTargetBwp),
      inputField("Operating days per month","operatingDaysPerMonth",inputs.operatingDaysPerMonth,{
        placeholder:"e.g. 26",min:"1",max:"31"
      }),
      inputField("Monthly labour cost (P)","monthlyLabourCostBwp",inputs.monthlyLabourCostBwp),
      inputField("Current cash available (P)","currentCashBwp",inputs.currentCashBwp),
      inputField("Minimum cash buffer (P)","minimumCashBufferBwp",inputs.minimumCashBufferBwp),
      inputField("Monthly cash outflows (P)","monthlyCashOutflowsBwp",inputs.monthlyCashOutflowsBwp),
      inputField("Planned purchase (P)","plannedPurchaseBwp",inputs.plannedPurchaseBwp),
      inputField("Same-month collection %","sameMonthCollectionPct",inputs.sameMonthCollectionPct,{
        placeholder:"e.g. 70",min:"0",max:"100",step:"0.1"
      }),
      inputField("Purchase label","plannedPurchaseLabel",inputs.plannedPurchaseLabel,{
        type:"text",min:"",max:"",step:"",placeholder:"e.g. equipment purchase"
      })
    );
    body.append(grid);

    const actions=document.createElement("div");
    actions.className="owner-input-actions";
    const status=text("span","","owner-input-status");
    status.id="ownerInputStatus";
    if(canEdit()){
      actions.append(button("Save assumptions",()=>saveInputs(status),"btn"));
    }else{
      actions.append(text("span","Only the business owner can change financial assumptions.","owner-input-status"));
    }
    actions.append(status);
    body.append(actions);
  }

  async function saveInputs(status){
    if(!canEdit()||!latestStateEnvelope?.state)return;
    try{
      status.textContent="Saving…";
      const next=clone(latestStateEnvelope.state);
      const company=activeCompanyFromState(next);
      if(!company)throw new Error("Active company not found.");
      company.profile=company.profile&&typeof company.profile==="object"?company.profile:{};

      for(const [logical,key] of Object.entries(PROFILE_KEYS)){
        const input=q(`#owner-${logical}`);
        if(!input)continue;
        if(logical==="plannedPurchaseLabel"){
          company.profile[key]=String(input.value||"").trim().slice(0,80);
          continue;
        }
        const raw=String(input.value||"").trim();
        const value=raw===""?null:Number(raw);
        if(value!==null&&!Number.isFinite(value)){
          throw new Error("Enter valid numeric assumptions.");
        }
        if(logical==="sameMonthCollectionPct"&&value!==null&&(value<0||value>100)){
          throw new Error("Same-month collection must be between 0% and 100%.");
        }
        company.profile[key]=value;
      }

      const result=await request("/api/state",{
        method:"PUT",
        body:JSON.stringify({
          version:latestStateEnvelope.version,
          state:next
        })
      });
      status.textContent="Saved. Recalculating…";
      latestStateEnvelope={
        version:Number(result?.version||latestStateEnvelope.version+1),
        state:next
      };
      await renderOwnerBrief(true);
      status.textContent="Saved";
    }catch(error){
      status.textContent=String(error?.message||"Could not save assumptions").slice(0,160);
    }
  }


  function propertyPortfolioMoneyMinor(value){
    const amount=Number(value||0)/100;
    return "P"+amount.toLocaleString("en-BW",{minimumFractionDigits:0,maximumFractionDigits:2});
  }

  function propertyPortfolioNotify(message,type="success"){
    try{global.BW?.notifications?.notify?.(String(message||""),{type,duration:5200})}catch{}
  }

  function propertyPortfolioStatus(id,message){
    const node=q("#"+id);
    if(node)node.textContent=String(message||"");
  }

  function propertyPortfolioField(labelValue,control){
    const wrap=document.createElement("div");
    const label=document.createElement("label");
    label.htmlFor=control.id;
    label.textContent=labelValue;
    wrap.append(label,control);
    return wrap;
  }

  function propertyPortfolioInput(id,{type="text",placeholder="",min=null,step=null,maxLength=null}={}){
    const input=document.createElement("input");
    input.id=id;
    input.type=type;
    if(placeholder)input.placeholder=placeholder;
    if(min!==null)input.min=String(min);
    if(step!==null)input.step=String(step);
    if(maxLength!==null)input.maxLength=Number(maxLength);
    return input;
  }

  function propertyPortfolioSelect(id,choices=[]){
    const select=document.createElement("select");
    select.id=id;
    for(const [value,label] of choices){
      const option=document.createElement("option");
      option.value=value;
      option.textContent=label;
      select.append(option);
    }
    return select;
  }

  function propertyPortfolioMetric(labelValue,id){
    const card=document.createElement("div");
    card.className="card";
    const label=text("div",labelValue,"kpi");
    const value=text("div","—","score");
    value.id=id;
    card.append(label,value);
    return card;
  }

  function propertyMajorToMinor(id,{optional=false}={}){
    const raw=String(q("#"+id)?.value||"").trim();
    if(!raw)return optional?null:0;
    const major=Number(raw);
    if(!Number.isFinite(major)||major<0)return NaN;
    const minor=Math.round(major*100);
    return Number.isSafeInteger(minor)?minor:NaN;
  }

  function ensurePropertyPortfolioShell(){
    const view=q("#propertyintelligence");
    if(!view)return null;
    const existing=q("#propertyPortfolioWorkspace",view);
    if(existing)return existing;
    const scenario=q(".property-layout",view);
    if(!scenario)return null;

    const heroCopy=q(".hub-hero .muted",view);
    if(heroCopy)heroCopy.textContent="Use the canonical register for owned property and signed professional valuation reports. Keep prospective-deal underwriting separate: Thebe calculates scenarios from your assumptions but does not invent, certify or sign market value.";

    const shell=document.createElement("div");
    shell.id="propertyPortfolioWorkspace";
    shell.className="card";
    shell.style.marginBottom="16px";

    const head=document.createElement("div");
    head.className="between row";
    const headText=document.createElement("div");
    headText.append(text("div","Portfolio records","section-eyebrow"),text("h3","Property portfolio & professional valuations"));
    head.append(headText,text("span","Governed records","badge info"));
    shell.append(head);

    const boundary=document.createElement("div");
    boundary.className="notice small";
    boundary.style.marginTop="12px";
    boundary.append(
      text("b","Authority boundary: "),
      document.createTextNode("Market value enters Thebe only from a professional report you record. Thebe does not create, certify, sign or independently verify a valuation or the valuer's registration.")
    );
    shell.append(boundary);

    const metrics=document.createElement("div");
    metrics.className="grid g4";
    metrics.style.marginTop="14px";
    metrics.append(
      propertyPortfolioMetric("Active property assets","propertyPortfolioAssetCount"),
      propertyPortfolioMetric("Recorded professional value","propertyPortfolioRecordedValue"),
      propertyPortfolioMetric("Recorded debt","propertyPortfolioDebt"),
      propertyPortfolioMetric("Valuation coverage","propertyPortfolioCoverage")
    );
    shell.append(metrics);
    const portfolioAlerts=document.createElement("div");
    portfolioAlerts.className="grid g2";
    portfolioAlerts.style.marginTop="10px";
    const renewalAlert=text("div","Renewal status will appear after portfolio data loads.","notice small");
    renewalAlert.id="propertyPortfolioRenewalStatus";
    const evidenceAlert=text("div","Report-evidence status will appear after portfolio data loads.","notice small");
    evidenceAlert.id="propertyPortfolioEvidenceStatus";
    portfolioAlerts.append(renewalAlert,evidenceAlert);
    shell.append(portfolioAlerts);

    const forms=document.createElement("div");
    forms.className="grid g2";
    forms.style.marginTop="14px";

    const assetDetails=document.createElement("details");
    assetDetails.id="propertyAssetFormPanel";
    assetDetails.className="card";
    const assetSummary=document.createElement("summary");
    assetSummary.textContent="Add property to canonical register";
    assetDetails.append(assetSummary);
    const assetGrid=document.createElement("div");
    assetGrid.className="formgrid property-form";
    assetGrid.style.marginTop="12px";
    assetGrid.append(
      propertyPortfolioField("Property name",propertyPortfolioInput("portfolioAssetName",{placeholder:"e.g. Phakalane rental house",maxLength:160})),
      propertyPortfolioField("Asset code",propertyPortfolioInput("portfolioAssetCode",{placeholder:"Optional internal reference",maxLength:80})),
      propertyPortfolioField("Property type",propertyPortfolioSelect("portfolioAssetType",[
        ["residential","Residential"],["commercial","Commercial"],["industrial","Industrial"],["land","Land"],["mixed_use","Mixed use"],["other","Other"]
      ])),
      propertyPortfolioField("Tenure",propertyPortfolioSelect("portfolioAssetTenure",[
        ["freehold","Freehold"],["leasehold","Leasehold"],["customary","Customary"],["state","State"],["other","Other"],["unknown","Unknown"]
      ])),
      propertyPortfolioField("Location",propertyPortfolioInput("portfolioAssetLocation",{placeholder:"Town / area / plot description",maxLength:240})),
      propertyPortfolioField("Acquisition date",propertyPortfolioInput("portfolioAssetAcquisitionDate",{type:"date"})),
      propertyPortfolioField("Acquisition cost (P)",propertyPortfolioInput("portfolioAssetAcquisitionCost",{type:"number",min:0,step:"0.01",placeholder:"Optional"})),
      propertyPortfolioField("Annual rent (P)",propertyPortfolioInput("portfolioAssetAnnualRent",{type:"number",min:0,step:"0.01",placeholder:"0"})),
      propertyPortfolioField("Annual operating costs (P)",propertyPortfolioInput("portfolioAssetAnnualOpex",{type:"number",min:0,step:"0.01",placeholder:"0"})),
      propertyPortfolioField("Debt balance (P)",propertyPortfolioInput("portfolioAssetDebt",{type:"number",min:0,step:"0.01",placeholder:"0"}))
    );
    const assetStatusWrap=propertyPortfolioField("Record status",propertyPortfolioSelect("portfolioAssetStatus",[["active","Active"],["archived","Archived"]]));
    assetStatusWrap.id="portfolioAssetStatusWrap";
    assetStatusWrap.hidden=true;
    const archiveReasonWrap=propertyPortfolioField("Archive reason",propertyPortfolioInput("portfolioAssetArchiveReason",{placeholder:"Required when archiving",maxLength:500}));
    archiveReasonWrap.id="portfolioAssetArchiveReasonWrap";
    archiveReasonWrap.hidden=true;
    assetGrid.append(assetStatusWrap,archiveReasonWrap);
    const assetActions=document.createElement("div");
    assetActions.className="actions";
    assetActions.style.marginTop="12px";
    const assetSave=button("Add property",()=>void createPropertyAsset(),"btn");
    assetSave.id="portfolioAssetSaveButton";
    const assetCancel=button("Cancel edit",()=>resetPropertyAssetForm(),"btn soft");
    assetCancel.id="portfolioAssetCancelButton";
    assetCancel.hidden=true;
    assetActions.append(assetSave,assetCancel);
    const assetStatus=text("span","","muted small");
    assetStatus.id="propertyAssetFormStatus";
    assetActions.append(assetStatus);
    assetDetails.append(assetGrid,assetActions);

    const valuationDetails=document.createElement("details");
    valuationDetails.id="propertyValuationFormPanel";
    valuationDetails.className="card";
    const valuationSummary=document.createElement("summary");
    valuationSummary.textContent="Record professional valuation report";
    valuationDetails.append(valuationSummary);
    const valuationNotice=document.createElement("div");
    valuationNotice.className="notice small";
    valuationNotice.style.marginTop="10px";
    valuationNotice.textContent="Owner-only immutable ledger entry. Link an already issued professional report where approved, scan-clean evidence exists. If no review due date is supplied, Thebe creates a 12-month reminder policy; that reminder is not a valuation expiry.";
    valuationDetails.append(valuationNotice);
    const valuationGrid=document.createElement("div");
    valuationGrid.className="formgrid property-form";
    valuationGrid.style.marginTop="12px";
    const assetSelect=propertyPortfolioSelect("portfolioValuationAsset",[["","Choose property"]]);
    valuationGrid.append(
      propertyPortfolioField("Property",assetSelect),
      propertyPortfolioField("Valuation date",propertyPortfolioInput("portfolioValuationDate",{type:"date"})),
      propertyPortfolioField("Market value (P)",propertyPortfolioInput("portfolioValuationValue",{type:"number",min:0,step:"0.01",placeholder:"Value shown on signed report"})),
      propertyPortfolioField("Valuer name",propertyPortfolioInput("portfolioValuerName",{placeholder:"Professional valuer",maxLength:160})),
      propertyPortfolioField("Registration reference",propertyPortfolioInput("portfolioValuerRegistration",{placeholder:"Registration / licence reference",maxLength:120})),
      propertyPortfolioField("Report reference",propertyPortfolioInput("portfolioValuationReportRef",{placeholder:"Report number / reference",maxLength:160})),
      propertyPortfolioField("Review / renewal due",propertyPortfolioInput("portfolioValuationReviewDue",{type:"date"})),
      propertyPortfolioField("Signed report evidence",propertyPortfolioSelect("portfolioValuationEvidence",[["","No approved clean evidence selected"]]))
    );
    const noteWrap=document.createElement("div");
    const noteLabel=document.createElement("label");
    noteLabel.htmlFor="portfolioValuationMethodology";
    noteLabel.textContent="Methodology note";
    const note=document.createElement("textarea");
    note.id="portfolioValuationMethodology";
    note.maxLength=500;
    note.rows=3;
    note.placeholder="Optional note copied from or describing the professional report";
    noteWrap.append(noteLabel,note);
    valuationGrid.append(noteWrap);
    const valuationActions=document.createElement("div");
    valuationActions.className="actions";
    valuationActions.style.marginTop="12px";
    valuationActions.append(button("Record signed report",()=>void recordPropertyProfessionalValuation(),"btn"));
    const valuationStatus=text("span","","muted small");
    valuationStatus.id="propertyValuationFormStatus";
    valuationActions.append(valuationStatus);
    valuationDetails.append(valuationGrid,valuationActions);

    forms.append(assetDetails,valuationDetails);
    shell.append(forms);

    const servicePanel=document.createElement("div");
    servicePanel.id="propertyValuationServicePanel";
    servicePanel.className="card";
    servicePanel.style.marginTop="14px";
    const serviceHead=document.createElement("div");
    serviceHead.className="between row";
    const serviceHeadText=document.createElement("div");
    serviceHeadText.append(text("div","Professional service","section-eyebrow"),text("h3","Request a professional property valuation"));
    serviceHead.append(serviceHeadText,text("span","Quote required","badge info"));
    servicePanel.append(serviceHead);
    const serviceBoundary=text("div","Thebe coordinates the workflow and payment. A verified human valuer must inspect, prepare, review and sign the professional report; Thebe does not create or sign the valuation.","notice small");
    serviceBoundary.style.marginTop="10px";servicePanel.append(serviceBoundary);
    const serviceGrid=document.createElement("div");
    serviceGrid.className="formgrid property-form";
    serviceGrid.style.marginTop="12px";
    const serviceProperty=propertyPortfolioSelect("portfolioValuationServiceProperty",[["","Choose active property"]]);
    const servicePurpose=propertyPortfolioSelect("portfolioValuationServicePurpose",[
      ["finance","Finance / mortgage"],["sale","Sale"],["purchase","Purchase"],["insurance","Insurance"],
      ["financial_reporting","Financial reporting"],["estate","Estate"],["legal","Legal"],["tax","Tax"],["internal","Internal"],["other","Other"]
    ]);
    serviceGrid.append(
      propertyPortfolioField("Property",serviceProperty),
      propertyPortfolioField("Purpose",servicePurpose),
      propertyPortfolioField("Desired by",propertyPortfolioInput("portfolioValuationServiceDesiredBy",{type:"date"})),
      propertyPortfolioField("Access contact",propertyPortfolioInput("portfolioValuationServiceContact",{placeholder:"Person who can provide property access",maxLength:160})),
      propertyPortfolioField("Access phone",propertyPortfolioInput("portfolioValuationServicePhone",{placeholder:"+267 ...",maxLength:40}))
    );
    const serviceNotesWrap=document.createElement("div");
    const serviceNotesLabel=document.createElement("label");
    serviceNotesLabel.htmlFor="portfolioValuationServiceNotes";serviceNotesLabel.textContent="Request notes";
    const serviceNotes=document.createElement("textarea");
    serviceNotes.id="portfolioValuationServiceNotes";serviceNotes.maxLength=1200;serviceNotes.rows=3;
    serviceNotes.placeholder="Purpose, access constraints, lender/client instructions, or timing notes";
    serviceNotesWrap.append(serviceNotesLabel,serviceNotes);serviceGrid.append(serviceNotesWrap);
    servicePanel.append(serviceGrid);
    const serviceActions=document.createElement("div");serviceActions.className="actions";serviceActions.style.marginTop="12px";
    const serviceRequestButton=button("Request valuation quote",()=>void requestPropertyValuationService(),"btn");
    serviceRequestButton.id="propertyValuationServiceRequestButton";
    const serviceStatus=text("span","","muted small");serviceStatus.id="propertyValuationServiceStatus";
    serviceActions.append(serviceRequestButton,serviceStatus);servicePanel.append(serviceActions);
    const serviceList=document.createElement("div");serviceList.id="propertyValuationServiceList";serviceList.style.marginTop="14px";
    serviceList.append(text("div","No valuation service requests loaded yet.","muted small"));servicePanel.append(serviceList);
    servicePanel.hidden=role()!=="owner"&&role()!=="manager";
    shell.append(servicePanel);

    const listHead=document.createElement("div");
    listHead.className="between row";
    listHead.style.marginTop="16px";
    listHead.append(text("div","Canonical property register","section-eyebrow"),button("Refresh",()=>void renderPropertyPortfolio(true),"btn soft"));
    const list=document.createElement("div");
    list.id="propertyPortfolioList";
    list.className="property-risk-list";
    list.style.marginTop="8px";
    list.append(text("div","Loading property portfolio…","muted small"));
    const history=document.createElement("div");
    history.id="propertyValuationHistory";
    history.style.marginTop="14px";
    shell.append(listHead,list,history);

    view.insertBefore(shell,scenario);
    valuationDetails.hidden=role()!=="owner";
    return shell;
  }

  function propertyPortfolioSetValuationOptions(items,businessDate,evidenceItems=[]){
    const select=q("#portfolioValuationAsset");
    if(select){
      const current=select.value;
      select.replaceChildren();
      const placeholder=document.createElement("option");
      placeholder.value="";
      placeholder.textContent="Choose property";
      select.append(placeholder);
      for(const item of items||[]){
        if(String(item?.status||"active")!=="active")continue;
        const option=document.createElement("option");
        option.value=String(item.id||"");
        option.textContent=String(item.name||"Property");
        select.append(option);
      }
      if([...select.options].some(option=>option.value===current))select.value=current;
    }
    const serviceSelect=q("#portfolioValuationServiceProperty");
    if(serviceSelect){
      const current=serviceSelect.value;
      serviceSelect.replaceChildren();
      const placeholder=document.createElement("option");placeholder.value="";placeholder.textContent="Choose active property";serviceSelect.append(placeholder);
      for(const item of items||[]){
        if(String(item?.status||"active")!=="active")continue;
        const option=document.createElement("option");option.value=String(item.id||"");option.textContent=String(item.name||"Property");serviceSelect.append(option);
      }
      if([...serviceSelect.options].some(option=>option.value===current))serviceSelect.value=current;
    }
    const serviceDesired=q("#portfolioValuationServiceDesiredBy");
    if(serviceDesired)serviceDesired.min=String(businessDate||gaboroneDate());
    const date=q("#portfolioValuationDate");
    if(date){
      date.max=String(businessDate||gaboroneDate());
      if(!date.value)date.value=String(businessDate||gaboroneDate());
    }
    const evidence=q("#portfolioValuationEvidence");
    if(evidence){
      const selected=evidence.value;
      evidence.replaceChildren();
      const none=document.createElement("option");
      none.value="";
      none.textContent=evidenceItems.length?"No report evidence selected":"No approved clean evidence available";
      evidence.append(none);
      for(const row of evidenceItems){
        const option=document.createElement("option");
        option.value=String(row.id||"");
        option.textContent=String(row.display_name||row.displayName||"Evidence");
        evidence.append(option);
      }
      if([...evidence.options].some(option=>option.value===selected))evidence.value=selected;
    }
  }

  function propertyPortfolioEligibleEvidence(payload){
    const rows=Array.isArray(payload?.items)?payload.items:[];
    return rows.filter(row=>
      String(row?.review_status||"")==="approved"
      &&String(row?.scan_status||"")==="clean"
      &&!!row?.scanned_at
      &&!row?.malware_name
    );
  }

  function resetPropertyAssetForm(){
    propertyAssetEditingId=null;
    for(const id of ["portfolioAssetName","portfolioAssetCode","portfolioAssetLocation","portfolioAssetAcquisitionDate","portfolioAssetAcquisitionCost","portfolioAssetAnnualRent","portfolioAssetAnnualOpex","portfolioAssetDebt","portfolioAssetArchiveReason"]){
      const node=q("#"+id);if(node)node.value="";
    }
    const type=q("#portfolioAssetType");if(type)type.value="residential";
    const tenure=q("#portfolioAssetTenure");if(tenure)tenure.value="freehold";
    const status=q("#portfolioAssetStatus");if(status)status.value="active";
    const statusWrap=q("#portfolioAssetStatusWrap");if(statusWrap)statusWrap.hidden=true;
    const reasonWrap=q("#portfolioAssetArchiveReasonWrap");if(reasonWrap)reasonWrap.hidden=true;
    const save=q("#portfolioAssetSaveButton");if(save)save.textContent="Add property";
    const cancel=q("#portfolioAssetCancelButton");if(cancel)cancel.hidden=true;
    const summary=q("#propertyAssetFormPanel summary");if(summary)summary.textContent="Add property to canonical register";
    propertyPortfolioStatus("propertyAssetFormStatus","");
  }

  function editPropertyAsset(item){
    if(!item)return;
    propertyAssetEditingId=String(item.id||"");
    const values={
      portfolioAssetName:item.name||"",
      portfolioAssetCode:item.assetCode||"",
      portfolioAssetLocation:item.location||"",
      portfolioAssetAcquisitionDate:item.acquisitionDate||"",
      portfolioAssetAcquisitionCost:item.acquisitionCostMinor==null?"":Number(item.acquisitionCostMinor)/100,
      portfolioAssetAnnualRent:Number(item.annualRentMinor||0)/100,
      portfolioAssetAnnualOpex:Number(item.annualOperatingCostMinor||0)/100,
      portfolioAssetDebt:Number(item.debtBalanceMinor||0)/100,
      portfolioAssetArchiveReason:item.archiveReason||""
    };
    for(const [id,value] of Object.entries(values)){const node=q("#"+id);if(node)node.value=String(value??"")}
    const type=q("#portfolioAssetType");if(type)type.value=String(item.propertyType||"other");
    const tenure=q("#portfolioAssetTenure");if(tenure)tenure.value=String(item.tenureType||"unknown");
    const status=q("#portfolioAssetStatus");if(status)status.value=String(item.status||"active");
    const statusWrap=q("#portfolioAssetStatusWrap");if(statusWrap)statusWrap.hidden=role()!=="owner";
    const reasonWrap=q("#portfolioAssetArchiveReasonWrap");if(reasonWrap)reasonWrap.hidden=role()!=="owner";
    const save=q("#portfolioAssetSaveButton");if(save)save.textContent="Save property changes";
    const cancel=q("#portfolioAssetCancelButton");if(cancel)cancel.hidden=false;
    const summary=q("#propertyAssetFormPanel summary");if(summary)summary.textContent="Edit canonical property record";
    const panel=q("#propertyAssetFormPanel");if(panel){panel.open=true;panel.scrollIntoView({behavior:"smooth",block:"center"})}
  }

  function propertyPortfolioAssetCard(item,businessDate){
    const card=document.createElement("div");
    card.className="item";
    const top=document.createElement("div");
    top.className="between row";
    const identity=document.createElement("div");
    const title=text("b",item?.name||"Property");
    const meta=[
      item?.assetCode||null,
      String(item?.propertyType||"other").replaceAll("_"," "),
      item?.tenureType||null,
      item?.location||null,
      item?.status==="archived"?"archived":null
    ].filter(Boolean).join(" · ");
    identity.append(title,text("div",meta||"Registered property","muted small"));
    const latest=item?.latestProfessionalValuation||null;
    let badgeLabel="Valuation missing",badgeClass="badge warn";
    if(item?.status==="archived"){badgeLabel="Archived";badgeClass="badge";}
    else if(latest?.renewalStatus==="due"){badgeLabel="Valuation review due";badgeClass="badge warn";}
    else if(latest?.renewalStatus==="due_soon"){badgeLabel="Review due soon";badgeClass="badge warn";}
    else if(latest&&!latest.reportEvidenceReady){badgeLabel="Report evidence gap";badgeClass="badge warn";}
    else if(latest){badgeLabel="Professional report recorded";badgeClass="badge good";}
    top.append(identity,text("span",badgeLabel,badgeClass));
    card.append(top);

    const facts=document.createElement("div");
    facts.className="small";
    facts.style.marginTop="8px";
    const value=latest?propertyPortfolioMoneyMinor(latest.marketValueMinor):"Not recorded";
    const noi=Number(item?.annualRentMinor||0)-Number(item?.annualOperatingCostMinor||0);
    const yieldPct=latest?.marketValueMinor>0?Math.round((noi/Number(latest.marketValueMinor))*10000)/100:null;
    facts.textContent="Acquisition cost "+(item?.acquisitionCostMinor==null?"Not recorded":propertyPortfolioMoneyMinor(item.acquisitionCostMinor))+
      " · Annual rent "+propertyPortfolioMoneyMinor(item?.annualRentMinor)+
      " · Operating costs "+propertyPortfolioMoneyMinor(item?.annualOperatingCostMinor)+
      " · NOI proxy "+propertyPortfolioMoneyMinor(noi)+
      " · Debt "+propertyPortfolioMoneyMinor(item?.debtBalanceMinor)+
      " · Professional value "+value+
      (yieldPct==null?"":" · NOI yield "+yieldPct.toFixed(2)+"%");
    card.append(facts);

    if(latest){
      const evidenceCopy=latest.reportEvidenceReady
        ?" · report evidence "+String(latest.reportEvidence?.displayName||"linked and ready")
        :" · signed report evidence not linked/ready";
      const provenance=text("div",
        "Latest report: "+String(latest.valuationDate||"date unavailable")+" · "+String(latest.valuerName||"valuer not recorded")+
        " · registration "+String(latest.valuerRegistrationRef||"not recorded")+" · report "+String(latest.reportReference||"not recorded")+
        " · review due "+String(latest.reviewDueDate||"not set")+evidenceCopy+
        ". Thebe has not independently verified the professional credential.",
        "muted small"
      );
      provenance.style.marginTop="6px";
      card.append(provenance);
    }
    if(item?.status==="archived"&&item?.archiveReason){
      const archived=text("div","Archived: "+String(item.archiveReason),"muted small");
      archived.style.marginTop="6px";card.append(archived);
    }

    const actions=document.createElement("div");
    actions.className="actions";
    actions.style.marginTop="8px";
    actions.append(
      button("Performance history",()=>void showPropertyPerformanceHistory(String(item.id||""),String(item.name||"Property")),"btn soft"),
      button("Valuation history",()=>void showPropertyValuationHistory(String(item.id||""),String(item.name||"Property")),"btn soft"),
      button("Edit record",()=>editPropertyAsset(item),"btn soft")
    );
    if(latest?.reportEvidence?.id)actions.append(button("Open Documents",()=>route("evidencehub"),"btn soft"));
    if(role()==="owner"&&item?.status==="active"){
      actions.append(button("Record valuation",()=>{
        const select=q("#portfolioValuationAsset");
        const panel=q("#propertyValuationFormPanel");
        if(select)select.value=String(item.id||"");
        if(panel){panel.open=true;panel.scrollIntoView({behavior:"smooth",block:"center"})}
      },"btn soft"));
    }
    card.append(actions);
    return card;
  }

  async function renderPropertyPortfolio(force=false){
    if(!canView())return;
    const shell=ensurePropertyPortfolioShell();
    if(!shell||propertyPortfolioBusy)return;
    propertyPortfolioBusy=true;
    const list=q("#propertyPortfolioList");
    if(list)list.replaceChildren(text("div","Reading canonical property records…","muted small"));
    try{
      const [portfolio,evidencePayload,valuationServices]=await Promise.all([
        request("/api/property/portfolio"),
        request("/api/evidence").catch(()=>({items:[]})),
        request("/api/property/valuation-services").catch(()=>({available:false,items:[]}))
      ]);
      propertyPortfolioCache=portfolio;
      propertyEvidenceOptions=propertyPortfolioEligibleEvidence(evidencePayload);
      const set=(id,value)=>{const node=q("#"+id);if(node)node.textContent=value};
      if(portfolio?.available!==true){
        set("propertyPortfolioAssetCount","Unavailable");
        set("propertyPortfolioRecordedValue","—");
        set("propertyPortfolioDebt","—");
        set("propertyPortfolioCoverage","—");
        if(list){
          const notice=text("div","Property records are not available yet. Migration 060 must be verified before this portfolio can be used.","notice bad");
          list.replaceChildren(notice,button("Retry",()=>void renderPropertyPortfolio(true),"btn soft"));
        }
        return;
      }
      set("propertyPortfolioAssetCount",String(Number(portfolio.assetCount||0)));
      set("propertyPortfolioRecordedValue",propertyPortfolioMoneyMinor(portfolio.recordedProfessionalValueMinor));
      set("propertyPortfolioDebt",propertyPortfolioMoneyMinor(portfolio.debtBalanceMinor));
      set("propertyPortfolioCoverage",portfolio.valuationCoveragePct==null?"—":pct(Number(portfolio.valuationCoveragePct)));
      const renewal=q("#propertyPortfolioRenewalStatus");
      if(renewal){
        const due=Number(portfolio.professionalValuationRenewalDueCount||0),soon=Number(portfolio.professionalValuationRenewalDueSoonCount||0);
        renewal.className="notice small"+(due?" bad":soon?" warn":" good");
        renewal.textContent=due?due+" professional valuation review(s) are due.":soon?soon+" professional valuation review(s) are due within 60 days.":"No recorded professional valuation review is currently due within 60 days.";
      }
      const evidenceStatus=q("#propertyPortfolioEvidenceStatus");
      if(evidenceStatus){
        const gaps=Number(portfolio.valuationReportEvidenceGapCount||0);
        evidenceStatus.className="notice small"+(gaps?" warn":" good");
        evidenceStatus.textContent=gaps?gaps+" valued property record(s) lack linked approved, scan-clean signed-report evidence.":"All currently valued property records have linked approved, scan-clean signed-report evidence.";
      }
      const items=Array.isArray(portfolio.items)?portfolio.items:[];
      propertyPortfolioSetValuationOptions(items,portfolio.businessDate,propertyEvidenceOptions);
      const valuationPanel=q("#propertyValuationFormPanel");
      if(valuationPanel)valuationPanel.hidden=role()!=="owner";
      const serviceButton=q("#propertyValuationServiceRequestButton");if(serviceButton)serviceButton.hidden=role()!=="owner";
      renderPropertyValuationServices(valuationServices);
      if(list){
        if(!items.length){
          list.replaceChildren(text("div","No property assets are recorded yet. Add the first property to start the canonical portfolio.","notice"));
        }else{
          list.replaceChildren(...items.map(item=>propertyPortfolioAssetCard(item,portfolio.businessDate)));
        }
      }
    }catch(error){
      propertyPortfolioCache=null;
      if(list){
        const notice=text("div","Property portfolio unavailable: "+String(error?.message||"secure read failed").slice(0,180)+". No value has been inferred.","notice bad");
        list.replaceChildren(notice,button("Retry",()=>void renderPropertyPortfolio(true),"btn soft"));
      }
    }finally{
      propertyPortfolioBusy=false;
    }
  }

  function valuationServiceMoney(value){
    const n=Number(value);return Number.isFinite(n)?"P"+n.toLocaleString("en-BW",{minimumFractionDigits:0,maximumFractionDigits:0}):"Quote pending";
  }

  function renderPropertyValuationServices(payload){
    const box=q("#propertyValuationServiceList");if(!box)return;
    const items=Array.isArray(payload?.items)?payload.items:[];
    if(payload?.available===false){
      box.replaceChildren(text("div","Valuation-service workflow is not available yet. Existing property and valuation records are unaffected.","notice"));
      return;
    }
    if(!items.length){
      box.replaceChildren(text("div","No professional valuation service requests yet.","muted small"));return;
    }
    const summary=payload?.summary||{};
    const summaryStrip=document.createElement("div");
    summaryStrip.className="outcome-status-strip";
    const summaryPairs=[
      [String(Number(summary.activeRequests||0)),"active"],
      [valuationServiceMoney(summary.quotedPipelineBwp||0),"awaiting-payment pipeline"],
      [String(Number(summary.inProgress||0)),"in progress"],
      [valuationServiceMoney(summary.completedRevenueBwp||0),"completed service value"]
    ];
    for(const [value,label] of summaryPairs){
      const chip=document.createElement("span");chip.className="outcome-status-chip";
      chip.append(text("b",value),document.createTextNode(" "+label));summaryStrip.append(chip);
    }
    const nodes=items.map(item=>{
      const row=document.createElement("div");row.className="item";
      const top=document.createElement("div");top.className="between row";
      const left=document.createElement("div");
      left.append(text("b",String(item.propertyName||"Property")+" · "+String(item.purpose||"valuation").replaceAll("_"," ")),
        text("div","Requested "+(item.createdAt?new Date(item.createdAt).toLocaleDateString():"")+" · "+String(item.status||"requested").replaceAll("_"," "),"muted small"));
      const badge=text("span",String(item.status||"requested").replaceAll("_"," "),"badge"+(["report_issued"].includes(item.status)?" good":["canceled","declined","refunded"].includes(item.status)?"":" info"));
      top.append(left,badge);row.append(top);
      const details=[];
      if(item.quotedFeeBwp!=null)details.push("Quoted fee "+valuationServiceMoney(item.quotedFeeBwp));
      else details.push("Fee quote pending");
      if(item.quoteExpiresAt)details.push((item.quoteExpired?"quote expired ":"quote expires ")+new Date(item.quoteExpiresAt).toLocaleDateString());
      if(item.assignedProfessional?.displayName)details.push("valuer "+item.assignedProfessional.displayName+(item.assignedProfessional.registrationRef?" · reg "+item.assignedProfessional.registrationRef:""));
      if(item.inspectionScheduledAt)details.push("inspection "+new Date(item.inspectionScheduledAt).toLocaleString());
      row.append(text("div",details.join(" · "),"small"));
      const authority=text("div","Human professional sign-off required. Thebe is workflow and evidence infrastructure, not the valuer.","muted small");
      authority.style.marginTop="5px";row.append(authority);
      const actions=document.createElement("div");actions.className="actions";actions.style.marginTop="8px";
      if(item.status==="awaiting_payment"&&item.serviceOrderId&&role()==="owner"&&item.payable){
        actions.append(button("Pay quoted fee",async()=>{
          try{
            const checkout=await request("/api/payments/service-checkout",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({serviceOrderId:item.serviceOrderId})});
            if(!checkout?.paymentOrder?.id)throw new Error("Payment order could not be created.");
            const hosted=await request("/api/payments/create-checkout",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({paymentOrderId:checkout.paymentOrder.id})});
            if(!hosted?.checkoutUrl)throw new Error(hosted?.error||"Checkout is not configured.");
            global.location.assign(hosted.checkoutUrl);
          }catch(error){propertyPortfolioNotify(String(error?.message||"Payment checkout failed"),"error")}
        },"btn"));
      }else if(item.status==="awaiting_payment"&&item.quoteExpired){
        actions.append(text("span","Quote expired · a fresh quote is required before payment.","badge warn"));
      }
      actions.append(button("View timeline",()=>void showPropertyValuationServiceTimeline(item.id,item.propertyName),"btn soft"));
      if(["requested","quoted","awaiting_payment"].includes(item.status)&&role()==="owner"){
        actions.append(button("Cancel request",async()=>{
          try{await request("/api/property/valuation-services/"+encodeURIComponent(item.id),{method:"DELETE"});propertyPortfolioNotify("Valuation request canceled.");await renderPropertyPortfolio(true)}
          catch(error){propertyPortfolioNotify(String(error?.message||"Could not cancel request"),"error")}
        },"btn soft"));
      }
      if(item.issuedValuationId)actions.append(button("Open valuation history",()=>void showPropertyValuationHistory(item.propertyId,item.propertyName),"btn soft"));
      if(actions.childNodes.length)row.append(actions);
      return row;
    });
    box.replaceChildren(summaryStrip,...nodes);
  }

  async function showPropertyValuationServiceTimeline(requestId,propertyName="Property"){
    const box=q("#propertyValuationHistory");if(!box||!requestId)return;
    box.replaceChildren(text("div","Loading valuation-service timeline…","muted small"));
    try{
      const payload=await request("/api/property/valuation-services/"+encodeURIComponent(requestId));
      const item=payload?.item||{},events=Array.isArray(payload?.events)?payload.events:[];
      const panel=document.createElement("div");panel.className="card";
      const head=document.createElement("div");head.className="between row";
      head.append(text("h3",propertyName+" · valuation-service timeline"),text("span",String(item.status||"requested").replaceAll("_"," "),"badge info"));
      panel.append(head);
      panel.append(text("div","Commercial workflow timeline only. A verified human professional remains responsible for inspection, valuation judgment, review and signature.","muted small"));
      if(item.assignedProfessional?.displayName){
        panel.append(text("div","Assigned professional: "+item.assignedProfessional.displayName+(item.assignedProfessional.registrationRef?" · registration "+item.assignedProfessional.registrationRef:""),"notice small"));
      }
      if(!events.length)panel.append(text("div","No workflow events recorded yet.","muted small"));
      for(const eventItem of events){
        const row=document.createElement("div");row.className="item";row.style.marginTop="8px";
        row.append(text("b",String(eventItem.type||"event").replaceAll("_"," ")),text("div",eventItem.at?new Date(eventItem.at).toLocaleString():"Time unavailable","muted small"));
        panel.append(row);
      }
      box.replaceChildren(panel);box.scrollIntoView({behavior:"smooth",block:"nearest"});
    }catch(error){
      box.replaceChildren(text("div","Valuation-service timeline unavailable: "+String(error?.message||"secure read failed").slice(0,180),"notice bad"));
    }
  }

  async function requestPropertyValuationService(){
    if(role()!=="owner"){propertyPortfolioStatus("propertyValuationServiceStatus","Only the account owner can request a paid professional valuation.");return}
    const propertyId=String(q("#portfolioValuationServiceProperty")?.value||"");
    const purpose=String(q("#portfolioValuationServicePurpose")?.value||"finance");
    const desiredByDate=String(q("#portfolioValuationServiceDesiredBy")?.value||"")||null;
    const accessContactName=cleanText(q("#portfolioValuationServiceContact")?.value,160);
    const accessContactPhone=cleanText(q("#portfolioValuationServicePhone")?.value,40);
    const clientNotes=cleanText(q("#portfolioValuationServiceNotes")?.value,1200);
    if(!propertyId){propertyPortfolioStatus("propertyValuationServiceStatus","Choose an active property.");return}
    propertyPortfolioStatus("propertyValuationServiceStatus","Submitting quote request…");
    try{
      await request("/api/property/valuation-services",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        propertyId,purpose,desiredByDate,accessContactName,accessContactPhone,clientNotes
      })});
      for(const id of ["portfolioValuationServiceDesiredBy","portfolioValuationServiceContact","portfolioValuationServicePhone","portfolioValuationServiceNotes"]){
        const node=q("#"+id);if(node)node.value="";
      }
      propertyPortfolioStatus("propertyValuationServiceStatus","Request submitted. A fee is not due until a quote is issued.");
      propertyPortfolioNotify("Professional valuation quote requested.");
      await renderPropertyPortfolio(true);
    }catch(error){propertyPortfolioStatus("propertyValuationServiceStatus",String(error?.message||"Could not request valuation").slice(0,180))}
  }

  async function createPropertyAsset(){
    if(!canView())return;
    const name=cleanText(q("#portfolioAssetName")?.value,160);
    if(name.length<2){propertyPortfolioStatus("propertyAssetFormStatus","Enter a property name.");return}
    const acquisitionCostMinor=propertyMajorToMinor("portfolioAssetAcquisitionCost",{optional:true});
    const annualRentMinor=propertyMajorToMinor("portfolioAssetAnnualRent");
    const annualOperatingCostMinor=propertyMajorToMinor("portfolioAssetAnnualOpex");
    const debtBalanceMinor=propertyMajorToMinor("portfolioAssetDebt");
    if([acquisitionCostMinor,annualRentMinor,annualOperatingCostMinor,debtBalanceMinor].some(value=>Number.isNaN(value))){
      propertyPortfolioStatus("propertyAssetFormStatus","Enter valid non-negative BWP amounts.");
      return;
    }
    const editing=!!propertyAssetEditingId;
    const status=editing?String(q("#portfolioAssetStatus")?.value||"active"):"active";
    const archiveReason=cleanText(q("#portfolioAssetArchiveReason")?.value,500);
    if(editing&&status==="archived"&&role()==="owner"&&archiveReason.length<3){
      propertyPortfolioStatus("propertyAssetFormStatus","Enter an archive reason before archiving this property.");
      return;
    }
    const payload={
      name,
      assetCode:cleanText(q("#portfolioAssetCode")?.value,80),
      propertyType:String(q("#portfolioAssetType")?.value||"other"),
      tenureType:String(q("#portfolioAssetTenure")?.value||"unknown"),
      location:cleanText(q("#portfolioAssetLocation")?.value,240),
      acquisitionDate:String(q("#portfolioAssetAcquisitionDate")?.value||"")||null,
      acquisitionCostMinor,
      annualRentMinor,
      annualOperatingCostMinor,
      debtBalanceMinor,
      ...(editing?{status,archiveReason}: {})
    };
    propertyPortfolioStatus("propertyAssetFormStatus",editing?"Saving governed changes…":"Saving…");
    try{
      if(editing){
        await request("/api/property/assets/"+encodeURIComponent(propertyAssetEditingId),{
          method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(payload)
        });
        propertyPortfolioNotify(status==="archived"?"Property archived with audit history preserved.":"Canonical property record updated.");
      }else{
        await request("/api/property/assets",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
        propertyPortfolioNotify("Property added to the canonical register.");
      }
      resetPropertyAssetForm();
      propertyPortfolioStatus("propertyAssetFormStatus",editing?"Changes saved.":"Saved to canonical register.");
      await renderPropertyPortfolio(true);
    }catch(error){
      propertyPortfolioStatus("propertyAssetFormStatus",String(error?.message||"Could not save property").slice(0,180));
    }
  }

  async function recordPropertyProfessionalValuation(){
    if(role()!=="owner"){propertyPortfolioStatus("propertyValuationFormStatus","Only the account owner can record a professional valuation.");return}
    const propertyId=String(q("#portfolioValuationAsset")?.value||"");
    const valuationDate=String(q("#portfolioValuationDate")?.value||"");
    const reviewDueDate=String(q("#portfolioValuationReviewDue")?.value||"");
    const evidenceId=String(q("#portfolioValuationEvidence")?.value||"");
    const marketValueMinor=propertyMajorToMinor("portfolioValuationValue");
    const valuerName=cleanText(q("#portfolioValuerName")?.value,160);
    const valuerRegistrationRef=cleanText(q("#portfolioValuerRegistration")?.value,120);
    const reportReference=cleanText(q("#portfolioValuationReportRef")?.value,160);
    const methodologyNote=cleanText(q("#portfolioValuationMethodology")?.value,500);
    if(!propertyId||!valuationDate||!Number.isSafeInteger(marketValueMinor)||marketValueMinor<=0||valuerName.length<2||valuerRegistrationRef.length<2||reportReference.length<2){
      propertyPortfolioStatus("propertyValuationFormStatus","Choose a property and enter the signed report date, value, valuer, registration reference and report reference.");
      return;
    }
    if(reviewDueDate&&reviewDueDate<valuationDate){
      propertyPortfolioStatus("propertyValuationFormStatus","Review due date cannot be before the valuation date.");
      return;
    }
    propertyPortfolioStatus("propertyValuationFormStatus","Recording immutable report entry…");
    try{
      await request("/api/property/assets/"+encodeURIComponent(propertyId)+"/professional-valuations",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({valuationDate,reviewDueDate:reviewDueDate||null,evidenceId:evidenceId||null,marketValueMinor,valuerName,valuerRegistrationRef,reportReference,methodologyNote})
      });
      for(const id of ["portfolioValuationValue","portfolioValuerName","portfolioValuerRegistration","portfolioValuationReportRef","portfolioValuationMethodology","portfolioValuationReviewDue"]){
        const node=q("#"+id);if(node)node.value="";
      }
      const evidence=q("#portfolioValuationEvidence");if(evidence)evidence.value="";
      propertyPortfolioStatus("propertyValuationFormStatus","Professional report recorded.");
      propertyPortfolioNotify(evidenceId
        ?"Professional valuation report and approved scan-clean evidence were recorded together."
        :"Professional valuation recorded with a visible signed-report evidence gap.");
      await renderPropertyPortfolio(true);
      await showPropertyValuationHistory(propertyId,(propertyPortfolioCache?.items||[]).find(item=>String(item.id)===propertyId)?.name||"Property");
    }catch(error){
      propertyPortfolioStatus("propertyValuationFormStatus",String(error?.message||"Could not record professional valuation").slice(0,180));
    }
  }

  async function linkPropertyValuationEvidence(propertyId,valuationId,evidenceId,propertyName="Property"){
    if(role()!=="owner"||!propertyId||!valuationId||!evidenceId)return;
    const box=q("#propertyValuationHistory");
    try{
      if(box)box.prepend(text("div","Linking approved scan-clean signed report…","notice small"));
      await request("/api/property/assets/"+encodeURIComponent(propertyId)+"/professional-valuations/"+encodeURIComponent(valuationId)+"/evidence",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({evidenceId})
      });
      propertyPortfolioNotify("Signed valuation-report evidence linked without changing the immutable valuation record.");
      await renderPropertyPortfolio(true);
      await showPropertyValuationHistory(propertyId,propertyName);
    }catch(error){
      if(box)box.prepend(text("div","Could not link signed-report evidence: "+String(error?.message||"secure write failed").slice(0,180),"notice bad"));
    }
  }

  async function showPropertyValuationHistory(propertyId,propertyName="Property"){
    const box=q("#propertyValuationHistory");
    if(!box||!propertyId)return;
    box.replaceChildren(text("div","Loading valuation history…","muted small"));
    try{
      const result=await request("/api/property/assets/"+encodeURIComponent(propertyId)+"/professional-valuations");
      const rows=Array.isArray(result?.items)?result.items:[];
      const panel=document.createElement("div");
      panel.className="card";
      const heading=document.createElement("div");
      heading.className="between row";
      heading.append(text("h3",propertyName+" · valuation history"),text("span","Immutable ledger","badge"));
      panel.append(heading);
      const note=text("div","Recorded external professional reports only. Thebe does not certify these values or independently verify professional credentials. Review reminders are workflow controls, not valuation expiry statements.","muted small");
      note.style.marginTop="6px";
      panel.append(note);
      if(!rows.length){
        panel.append(text("div","No professional valuation reports are recorded for this property.","notice"));
      }else{
        rows.forEach((row,index)=>{
          const item=document.createElement("div");
          item.className="item";
          item.style.marginTop="8px";
          const prior=rows[index+1];
          const change=prior&&Number(prior.market_value_minor)>0
            ?Math.round(((Number(row.market_value_minor)-Number(prior.market_value_minor))/Number(prior.market_value_minor))*1000)/10
            :null;
          item.append(
            text("b",propertyPortfolioMoneyMinor(row.market_value_minor)+" · "+String(row.valuation_date||"date unavailable")+(change===null?"":" · "+(change>=0?"+":"")+change.toFixed(1)+"% vs prior report")),
            text("div",String(row.valuer_name||"valuer unavailable")+" · registration "+String(row.valuer_registration_ref||"not recorded")+" · report "+String(row.report_reference||"not recorded"),"muted small"),
            text("div","Review due "+String(row.review_due_date||"not set")+" · "+(row.review_due_source==="professional_report"?"date supplied from recorded report":"Thebe 12-month reminder policy"),"muted small"),
            text("div",row.report_evidence?.ready?"Evidence: "+String(row.report_evidence.display_name||"approved scan-clean document"):"Evidence gap: no linked approved, scan-clean signed report","muted small")
          );
          if(row.methodology_note)item.append(text("div",String(row.methodology_note),"small"));
          if(!row.report_evidence?.ready&&role()==="owner"&&propertyEvidenceOptions.length){
            const evidenceRow=document.createElement("div");
            evidenceRow.className="actions";
            evidenceRow.style.marginTop="8px";
            const select=document.createElement("select");
            const none=document.createElement("option");
            none.value="";
            none.textContent="Choose approved signed-report evidence";
            select.append(none);
            for(const evidence of propertyEvidenceOptions){
              const option=document.createElement("option");
              option.value=String(evidence.id||"");
              option.textContent=String(evidence.display_name||evidence.displayName||"Evidence");
              select.append(option);
            }
            const link=button("Link signed report",()=>{
              if(select.value)void linkPropertyValuationEvidence(propertyId,String(row.id||""),select.value,propertyName);
            },"btn soft");
            evidenceRow.append(select,link);
            item.append(evidenceRow);
          }
          panel.append(item);
        });
      }
      box.replaceChildren(panel);
      box.scrollIntoView({behavior:"smooth",block:"nearest"});
    }catch(error){
      box.replaceChildren(text("div","Valuation history unavailable: "+String(error?.message||"secure read failed").slice(0,180),"notice bad"));
    }
  }

  async function showPropertyPerformanceHistory(propertyId,propertyName="Property"){
    const box=q("#propertyValuationHistory");
    if(!box||!propertyId)return;
    box.replaceChildren(text("div","Loading property performance history…","muted small"));
    try{
      const result=await request("/api/property/assets/"+encodeURIComponent(propertyId)+"/performance-history");
      const panel=document.createElement("div");
      panel.className="card";
      const heading=document.createElement("div");
      heading.className="between row";
      heading.append(text("h3",propertyName+" · profitability history"),text("span","Owner-recorded operating history","badge"));
      panel.append(heading);
      const current=result?.current||{};
      const currentGrid=document.createElement("div");
      currentGrid.className="grid g4";
      currentGrid.style.marginTop="10px";
      const metric=(label,value)=>{const node=document.createElement("div");node.className="card";node.append(text("div",label,"kpi"),text("div",value,"score"));return node};
      currentGrid.append(
        metric("Annual rent",propertyPortfolioMoneyMinor(current.annualRentMinor)),
        metric("NOI proxy",propertyPortfolioMoneyMinor(current.netOperatingIncomeProxyMinor)),
        metric("Recorded debt",propertyPortfolioMoneyMinor(current.debtBalanceMinor)),
        metric("NOI yield",current.netOperatingYieldPct==null?"—":Number(current.netOperatingYieldPct).toFixed(2)+"%")
      );
      panel.append(currentGrid);
      const trend=result?.trend;
      const trendCopy=trend
        ?"Recorded change "+String(trend.fromDate)+" → "+String(trend.toDate)+": rent "+(trend.annualRentChangePct==null?"—":(trend.annualRentChangePct>=0?"+":"")+trend.annualRentChangePct+"%")+
          " · NOI proxy "+(trend.netOperatingIncomeProxyChangePct==null?"—":(trend.netOperatingIncomeProxyChangePct>=0?"+":"")+trend.netOperatingIncomeProxyChangePct+"%")+
          " · debt "+(trend.debtBalanceChangePct==null?"—":(trend.debtBalanceChangePct>=0?"+":"")+trend.debtBalanceChangePct+"%")
        :"A trend will appear after at least two materially different property operating snapshots are recorded.";
      const trendNode=text("div",trendCopy,"notice small");
      trendNode.style.marginTop="10px";panel.append(trendNode);
      const note=text("div","NOI is a proxy equal to recorded annual rent minus recorded annual operating cost. It is not audited accounting profit and does not include financing cost, tax, depreciation, vacancy or unrecorded expenses. Yield uses the latest recorded external professional value only.","muted small");
      note.style.marginTop="8px";panel.append(note);
      const snapshots=Array.isArray(result?.operatingSnapshots)?result.operatingSnapshots:[];
      for(const row of snapshots.slice().reverse().slice(0,24)){
        const item=document.createElement("div");item.className="item";item.style.marginTop="8px";
        item.append(
          text("b",String(row.snapshotDate||"date unavailable")+" · NOI proxy "+propertyPortfolioMoneyMinor(row.netOperatingIncomeProxyMinor)),
          text("div","Rent "+propertyPortfolioMoneyMinor(row.annualRentMinor)+" · operating costs "+propertyPortfolioMoneyMinor(row.annualOperatingCostMinor)+" · debt "+propertyPortfolioMoneyMinor(row.debtBalanceMinor)+" · "+String(row.sourceKind||"recorded update"),"muted small")
        );
        panel.append(item);
      }
      box.replaceChildren(panel);
      box.scrollIntoView({behavior:"smooth",block:"nearest"});
    }catch(error){
      box.replaceChildren(text("div","Performance history unavailable: "+String(error?.message||"secure read failed").slice(0,180),"notice bad"));
    }
  }

  function renderSummary(model){
    const box=q("#ownerCommandSummary");
    if(!box)return;
    const lines=[];
    let tone="neutral";

    if(model.businessBrief?.headline){
      lines.push(String(model.businessBrief.headline).slice(0,520));
      if((model.businessBrief.priorities||[]).some(item=>item?.severity==="high"))tone="risk";
    }

    if(model.targetGapPct!==null){
      const gap=model.targetGapPct;
      if(gap>0){
        lines.push(`Revenue is projected ${pct(gap)} below your monthly target.`);
        if(gap>5)tone="risk";
      }else{
        lines.push(`Revenue is projected ${pct(gap)} above your monthly target.`);
        tone="positive";
      }
    }

    const watch=model.sales?.conversionWatch;
    if(watch&&watch.change<0){
      lines.push(`${watch.location} sales conversion has fallen from ${pct(watch.previous.conversion)} to ${pct(watch.current.conversion)}.`);
      if(watch.change<=-5)tone="risk";
    }else if(model.branch&&model.branch.revenueChange!==null){
      const change=model.branch.revenueChange;
      lines.push(`${model.branch.locationName} reported revenue is running ${pct(change)} ${change<0?"below":"above"} its 30-day baseline.`);
      if(change<-10)tone="risk";
    }

    if(model.labourShare!==null&&model.labourShare>=30){
      lines.push(`Labour cost is ${pct(model.labourShare)} of projected reported revenue.`);
      tone="risk";
    }

    if(model.daysToBuffer!==null&&model.daysToBuffer<60){
      lines.push(`Cash is projected to reach your minimum buffer in about ${Math.floor(model.daysToBuffer)} days.`);
      tone="risk";
    }

    if(!lines.length&&model.sales?.dormantCount>0){
      lines.push(`${model.sales.dormantCount} dormant quotation${model.sales.dormantCount===1?" needs":"s need"} follow-up, worth ${money(model.sales.dormantValue)} in recorded quote value.`);
      tone="risk";
    }

    if(!lines.length){
      lines.push("Thebe is still learning enough operational and sales history to produce a decision-ready owner brief.");
    }

    box.textContent=lines.slice(0,4).join(" ");
    box.dataset.tone=tone;
  }

  async function renderOwnerBrief(force=false){
    const seq=++renderSeq;
    const shell=createShell();
    if(!shell)return;
    if(!canView()){
      shell.hidden=true;
      return;
    }
    shell.hidden=false;

    const summary=q("#ownerCommandSummary");
    if(summary){
      summary.textContent=force
        ?"Refreshing your business brief…"
        :"Building your business brief…";
    }

    try{
      const date=gaboroneDate();
      const [performance,stateEnvelope,finance,businessEnvelope]=await Promise.all([
        request(`/api/daily-reporting/performance?date=${encodeURIComponent(date)}`),
        request("/api/state"),
        request("/api/finance/summary").catch(()=>null),
        request("/api/business-context/brief").catch(()=>null)
      ]);
      if(seq!==renderSeq)return;

      latestStateEnvelope=stateEnvelope;
      const inputs=decisionInputs(stateEnvelope?.state||{});
      const sales=deriveSalesIntelligence(inputs.company,date);
      const model=deriveModel(performance,inputs,date,sales,finance,businessEnvelope?.brief||null);
      model.businessAnalytics=businessEnvelope?.analytics||businessEnvelope?.brief?.analytics||null;

      renderSummary(model);
      renderSources(model,inputs);
      renderSignals(model);
      renderBusinessAnalytics(model.businessAnalytics);
      renderActions(model);
      renderSimulation(model);
      renderSalesWorkspace(inputs.company,sales);
      renderInputs(inputs);
      await renderAgenticGovernance();
    }catch(error){
      if(seq!==renderSeq)return;
      const box=q("#ownerCommandSummary");
      if(box){
        box.textContent="Business owner brief unavailable. Thebe will not substitute missing data with invented advice.";
        box.dataset.tone="risk";
      }
      const signals=q("#ownerSignalList");
      if(signals){
        signals.replaceChildren(signalCard({
          label:"Data status",
          value:"Unavailable",
          title:"The business briefing could not be calculated from authoritative sources.",
          detail:String(error?.message||"Retry the brief or open Daily Reports to confirm source data.").slice(0,220),
          tone:"risk",
          actionLabel:"Retry",
          action:()=>renderOwnerBrief(true)
        }));
      }
      const analytics=q("#ownerAnalyticsPanel");
      if(analytics)analytics.replaceChildren(text("div","Analytics unavailable until source data can be read securely.","owner-command-empty"));
      const actions=q("#ownerActionPanel");
      if(actions)actions.replaceChildren();
      const simulation=q("#ownerSimulationPanel");
      if(simulation)simulation.replaceChildren();
      const sales=q("#ownerSalesBody");
      if(sales){
        sales.replaceChildren(text(
          "div",
          "Sales intelligence unavailable until the tenant state can be read securely.",
          "owner-command-empty"
        ));
      }
    }
  }

  function scheduleRender(){
    setTimeout(()=>renderOwnerBrief(false),220);
  }

  function boot(){
    createShell();
    scheduleRender();
    document.addEventListener("change",event=>{
      if(event.target?.id==="companySelect"){
        setTimeout(()=>renderOwnerBrief(true),500);
      }
    });
    const dashboard=q("#dashboard");
    if(dashboard){
      new MutationObserver(()=>{
        if(dashboard.classList.contains("active"))scheduleRender();
      }).observe(dashboard,{attributes:true,attributeFilter:["class"]});
    }
    const propertyView=q("#propertyintelligence");
    if(propertyView){
      ensurePropertyPortfolioShell();
      new MutationObserver(()=>{
        if(!propertyView.classList.contains("active"))return;
        if(!q("#propertyPortfolioWorkspace",propertyView))ensurePropertyPortfolioShell();
        void renderPropertyPortfolio(false);
      }).observe(propertyView,{attributes:true,attributeFilter:["class"],childList:true});
      if(propertyView.classList.contains("active"))void renderPropertyPortfolio(false);
    }
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",boot,{once:true});
  }else{
    boot();
  }

  global.ThebeOwnerCommandCentre=Object.freeze({
    release:RELEASE,
    refresh:()=>renderOwnerBrief(true),
    openSales:openSalesWorkspace,
    refreshAgentic:()=>renderAgenticGovernance(true),
    refreshPropertyPortfolio:()=>renderPropertyPortfolio(true),
    generatePlan:generateAgenticPlan
  });
})(window);
