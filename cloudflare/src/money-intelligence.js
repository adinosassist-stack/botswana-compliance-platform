export const MONEY_INTELLIGENCE_VERSION="2026-09-26.v2";
const frozen=value=>Object.freeze(value);
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const clean=(value,max=180)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const dayMs=86400000;
function dateOnly(value){return String(value||"").slice(0,10)}
function startOfDay(date){const ms=Date.parse(`${dateOnly(date)}T00:00:00Z`);return Number.isFinite(ms)?ms:null}
function pctChange(current,prior){if(prior<=0)return current>0?null:0;return (current-prior)/prior}
function summarizeTransactions(rows,businessDate){
  const anchor=startOfDay(businessDate);
  const periods={current30:{inflow:0,outflow:0,count:0},prior30:{inflow:0,outflow:0,count:0}};
  const currentDebits=[];
  for(const row of rows||[]){
    const posted=startOfDay(row?.posted_on);if(anchor==null||posted==null)continue;
    const age=Math.floor((anchor-posted)/dayMs),amount=number(row?.amount_minor);
    let bucket=null;if(age>=0&&age<30)bucket=periods.current30;else if(age>=30&&age<60)bucket=periods.prior30;
    if(!bucket)continue;
    bucket.count++;
    if(amount>0)bucket.inflow+=amount;
    else if(amount<0){bucket.outflow+=Math.abs(amount);if(age<30)currentDebits.push({id:clean(row?.id,120),postedOn:dateOnly(row?.posted_on),description:clean(row?.description,120),reference:clean(row?.reference,80),amountMinor:amount})}
  }
  const avgDebit=currentDebits.length?currentDebits.reduce((sum,row)=>sum+Math.abs(row.amountMinor),0)/currentDebits.length:0;
  const threshold=Math.max(500000,Math.round(avgDebit*2.5));
  const largeDebits=currentDebits.filter(row=>Math.abs(row.amountMinor)>=threshold).sort((a,b)=>Math.abs(b.amountMinor)-Math.abs(a.amountMinor)).slice(0,5);
  return frozen({
    current30:frozen({...periods.current30,net:periods.current30.inflow-periods.current30.outflow}),
    prior30:frozen({...periods.prior30,net:periods.prior30.inflow-periods.prior30.outflow}),
    outflowChangePct:pctChange(periods.current30.outflow,periods.prior30.outflow),
    inflowChangePct:pctChange(periods.current30.inflow,periods.prior30.inflow),
    largeDebitThresholdMinor:threshold,
    largeDebits:frozen(largeDebits.map(frozen))
  });
}
function assumptionMetrics({cashPositionMinor=0,memory={}}={}){
  const assumptions=memory?.assumptions||{};
  const toMinor=(value,{positive=false}={})=>{const n=Number(value);return Number.isFinite(n)&&(positive?n>0:n>=0)?Math.round(n*100):null};
  const monthlyOutflowsMinor=toMinor(assumptions.monthlyCashOutflowsBwp,{positive:true});
  const minBufferMinor=toMinor(assumptions.minimumCashBufferBwp);
  const plannedPurchaseMinor=toMinor(assumptions.plannedPurchaseBwp,{positive:true});
  const monthlyLabourCostMinor=toMinor(assumptions.monthlyLabourCostBwp,{positive:true});
  const monthlyRevenueTargetMinor=toMinor(assumptions.monthlyRevenueTargetBwp,{positive:true});
  const collection=Number(assumptions.sameMonthCollectionPct);
  const sameMonthCollectionPct=Number.isFinite(collection)?Math.max(0,Math.min(100,collection)):null;
  const runwayDays=monthlyOutflowsMinor?Math.max(0,(Number(cashPositionMinor||0)/monthlyOutflowsMinor)*30):null;
  const safeDiscretionaryMinor=minBufferMinor==null?null:Math.max(0,Number(cashPositionMinor||0)-minBufferMinor);
  return frozen({
    monthlyOutflowsMinor,
    minimumCashBufferMinor:minBufferMinor,
    plannedPurchaseMinor,
    plannedPurchaseLabel:clean(assumptions.plannedPurchaseLabel,100)||null,
    monthlyLabourCostMinor,
    monthlyRevenueTargetMinor,
    sameMonthCollectionPct,
    estimatedRunwayDays:runwayDays==null?null:Math.round(runwayDays*10)/10,
    safeDiscretionaryMinor,
    basis:"owner_entered_assumptions",
    authoritative:false
  });
}
function cashScenario({cashPositionMinor=0,trend={},assumptions={},receivablesOutstandingMinor=0}={}){
  const current=trend?.current30||{},dailyInflow=number(current.inflow)/30,dailyOutflow=number(current.outflow)/30;
  const ownerDailyOutflow=assumptions.monthlyOutflowsMinor?number(assumptions.monthlyOutflowsMinor)/30:dailyOutflow;
  const collection30=assumptions.sameMonthCollectionPct==null?0:Math.round(Math.max(0,number(receivablesOutstandingMinor))*assumptions.sameMonthCollectionPct/100);
  const horizons=[7,30,90].map(days=>{
    const recordedEnding=Math.round(number(cashPositionMinor)+(dailyInflow-dailyOutflow)*days);
    const ownerCollection=Math.round(collection30*Math.min(1,days/30));
    const ownerEnding=Math.round(number(cashPositionMinor)+dailyInflow*days+ownerCollection-ownerDailyOutflow*days);
    return frozen({
      days,
      recordedRunRateEndingCashMinor:recordedEnding,
      ownerAssumptionEndingCashMinor:ownerEnding,
      ownerCollectionScenarioMinor:ownerCollection,
      minimumCashBufferMinor:assumptions.minimumCashBufferMinor,
      belowOwnerBuffer:assumptions.minimumCashBufferMinor==null?null:ownerEnding<assumptions.minimumCashBufferMinor
    });
  });
  const firstBufferBreach=horizons.find(row=>row.belowOwnerBuffer===true)?.days||null;
  const cashFlowMarginProxyPct=number(current.inflow)>0?(number(current.inflow)-number(current.outflow))/number(current.inflow):null;
  const targetCoveragePct=assumptions.monthlyRevenueTargetMinor?number(current.inflow)/assumptions.monthlyRevenueTargetMinor:null;
  return frozen({
    basis:"recorded_30_day_cash_run_rate_plus_owner_assumptions",
    formalForecast:false,
    accountingMargin:false,
    dailyRecordedInflowMinor:Math.round(dailyInflow),
    dailyRecordedOutflowMinor:Math.round(dailyOutflow),
    dailyOwnerScenarioOutflowMinor:Math.round(ownerDailyOutflow),
    sameMonthReceivableCollectionScenarioMinor:collection30,
    cashFlowMarginProxyPct:cashFlowMarginProxyPct==null?null:Math.round(cashFlowMarginProxyPct*1000)/1000,
    monthlyRevenueTargetCoveragePct:targetCoveragePct==null?null:Math.round(targetCoveragePct*1000)/1000,
    firstOwnerBufferBreachHorizonDays:firstBufferBreach,
    horizons:frozen(horizons)
  });
}
function ownerCommitments(assumptions={}){
  const items=[];
  if(assumptions.plannedPurchaseMinor)items.push(frozen({
    type:"planned_purchase",
    label:assumptions.plannedPurchaseLabel||"Owner-entered planned purchase",
    amountMinor:assumptions.plannedPurchaseMinor,
    timing:"unspecified",
    recurring:false,
    authoritative:false
  }));
  if(assumptions.monthlyLabourCostMinor)items.push(frozen({
    type:"monthly_labour_cost_assumption",
    label:"Owner-entered monthly labour cost",
    amountMinor:assumptions.monthlyLabourCostMinor,
    timing:"monthly",
    recurring:true,
    authoritative:false
  }));
  return frozen({
    items:frozen(items),
    totalUntimedOneOffMinor:items.filter(x=>!x.recurring).reduce((sum,x)=>sum+number(x.amountMinor),0),
    basis:"owner_entered_assumptions_not_accounts_payable",
    authoritative:false
  });
}
function debitConcentration(rows=[],currentOutflow=0){
  return frozen((rows||[]).map(row=>{
    const total=number(row?.total_outflow_minor),count=Math.max(0,number(row?.transaction_count));
    return frozen({
      descriptor:clean(row?.descriptor,120)||"Unlabelled debit",
      transactionCount:count,
      totalOutflowMinor:total,
      shareOfCurrent30Outflow:currentOutflow>0?Math.round((total/currentOutflow)*1000)/1000:null,
      identityConfidence:"description_only_not_supplier_verified"
    });
  }));
}

export async function buildMoneyIntelligence(env,tenantId,{businessDate,cashPositionMinor=0,memory={},receivablesOutstandingMinor=0}={}){
  if(!env?.DB||!tenantId||!businessDate)return frozen({version:MONEY_INTELLIGENCE_VERSION,available:false,error:"finance_transactions_unavailable"});
  let aggregate;
  try{
    aggregate=await env.DB.prepare(`SELECT
      COALESCE(SUM(CASE WHEN posted_on>=date(?,'-29 days') AND amount_minor>0 THEN amount_minor ELSE 0 END),0) current_inflow,
      COALESCE(SUM(CASE WHEN posted_on>=date(?,'-29 days') AND amount_minor<0 THEN ABS(amount_minor) ELSE 0 END),0) current_outflow,
      SUM(CASE WHEN posted_on>=date(?,'-29 days') THEN 1 ELSE 0 END) current_count,
      SUM(CASE WHEN posted_on>=date(?,'-29 days') AND amount_minor<0 THEN 1 ELSE 0 END) current_debit_count,
      COALESCE(SUM(CASE WHEN posted_on<date(?,'-29 days') AND amount_minor>0 THEN amount_minor ELSE 0 END),0) prior_inflow,
      COALESCE(SUM(CASE WHEN posted_on<date(?,'-29 days') AND amount_minor<0 THEN ABS(amount_minor) ELSE 0 END),0) prior_outflow,
      SUM(CASE WHEN posted_on<date(?,'-29 days') THEN 1 ELSE 0 END) prior_count
      FROM finance_transactions
      WHERE tenant_id=? AND posted_on>=date(?,'-59 days') AND posted_on<=date(?)`)
      .bind(businessDate,businessDate,businessDate,businessDate,businessDate,businessDate,businessDate,tenantId,businessDate,businessDate).first();
  }catch{
    return frozen({version:MONEY_INTELLIGENCE_VERSION,available:false,error:"finance_transactions_unavailable"});
  }
  const currentInflow=number(aggregate?.current_inflow),currentOutflow=number(aggregate?.current_outflow);
  const priorInflow=number(aggregate?.prior_inflow),priorOutflow=number(aggregate?.prior_outflow);
  const debitCount=Math.max(0,number(aggregate?.current_debit_count));
  const avgDebit=debitCount?currentOutflow/debitCount:0;
  const threshold=Math.max(500000,Math.round(avgDebit*2.5));
  let largeDebits=[],concentrationRows=[];
  try{
    const [largeResult,concentrationResult]=await Promise.all([
      env.DB.prepare(`SELECT id,posted_on,description,reference,amount_minor
        FROM finance_transactions
        WHERE tenant_id=? AND posted_on>=date(?,'-29 days') AND posted_on<=date(?)
          AND amount_minor<0 AND ABS(amount_minor)>=?
        ORDER BY ABS(amount_minor) DESC,posted_on DESC,id DESC LIMIT 5`)
        .bind(tenantId,businessDate,businessDate,threshold).all(),
      env.DB.prepare(`SELECT LOWER(TRIM(COALESCE(NULLIF(description,''),NULLIF(reference,'')))) descriptor,
          COUNT(*) transaction_count,SUM(ABS(amount_minor)) total_outflow_minor
        FROM finance_transactions
        WHERE tenant_id=? AND posted_on>=date(?,'-29 days') AND posted_on<=date(?)
          AND amount_minor<0 AND COALESCE(NULLIF(TRIM(description),''),NULLIF(TRIM(reference),'')) IS NOT NULL
        GROUP BY LOWER(TRIM(COALESCE(NULLIF(description,''),NULLIF(reference,''))))
        HAVING COUNT(*)>=2
        ORDER BY total_outflow_minor DESC,transaction_count DESC,descriptor ASC LIMIT 5`)
        .bind(tenantId,businessDate,businessDate).all()
    ]);
    largeDebits=(largeResult.results||[]).map(row=>frozen({
      id:clean(row?.id,120),postedOn:dateOnly(row?.posted_on),description:clean(row?.description,120),
      reference:clean(row?.reference,80),amountMinor:number(row?.amount_minor)
    }));
    concentrationRows=concentrationResult.results||[];
  }catch{
    return frozen({version:MONEY_INTELLIGENCE_VERSION,available:false,error:"finance_transactions_unavailable"});
  }
  const trend=frozen({
    current30:frozen({inflow:currentInflow,outflow:currentOutflow,count:number(aggregate?.current_count),net:currentInflow-currentOutflow}),
    prior30:frozen({inflow:priorInflow,outflow:priorOutflow,count:number(aggregate?.prior_count),net:priorInflow-priorOutflow}),
    outflowChangePct:pctChange(currentOutflow,priorOutflow),
    inflowChangePct:pctChange(currentInflow,priorInflow),
    largeDebitThresholdMinor:threshold,
    largeDebits:frozen(largeDebits)
  });
  const assumptions=assumptionMetrics({cashPositionMinor,memory});
  const scenario=cashScenario({cashPositionMinor,trend,assumptions,receivablesOutstandingMinor});
  const commitments=ownerCommitments(assumptions);
  const debitConcentrations=debitConcentration(concentrationRows,currentOutflow);
  const signals=[];
  if(trend.outflowChangePct!=null&&trend.outflowChangePct>=0.25)signals.push(frozen({key:"outflow_acceleration",severity:"medium",detail:`Recorded 30-day outflows are ${Math.round(trend.outflowChangePct*100)}% above the previous 30-day period.`,source:"finance_transactions"}));
  if(trend.largeDebits.length)signals.push(frozen({key:"large_debits",severity:"medium",detail:`${trend.largeDebits.length} recent debit(s) exceed the deterministic large-debit threshold.`,source:"finance_transactions"}));
  if(assumptions.estimatedRunwayDays!=null&&assumptions.estimatedRunwayDays<45)signals.push(frozen({key:"cash_runway",severity:"high",detail:`Estimated runway is ${assumptions.estimatedRunwayDays} days using owner-entered monthly outflows.`,source:"owner_entered_assumptions"}));
  if(scenario.firstOwnerBufferBreachHorizonDays!=null)signals.push(frozen({key:"cash_buffer_scenario",severity:"high",detail:`Owner-assumption cash scenario falls below the entered minimum cash buffer within the ${scenario.firstOwnerBufferBreachHorizonDays}-day horizon.`,source:"recorded_cash_run_rate_plus_owner_assumptions"}));
  if(commitments.totalUntimedOneOffMinor>0&&assumptions.safeDiscretionaryMinor!=null&&commitments.totalUntimedOneOffMinor>assumptions.safeDiscretionaryMinor)signals.push(frozen({key:"commitment_pressure",severity:"high",detail:"Owner-entered planned one-off commitments exceed current cash above the entered minimum cash buffer. Timing is not known.",source:"owner_entered_assumptions"}));
  const concentrated=debitConcentrations.find(row=>row.transactionCount>=3&&row.shareOfCurrent30Outflow!=null&&row.shareOfCurrent30Outflow>=0.35);
  if(concentrated)signals.push(frozen({key:"debit_concentration",severity:"medium",detail:`One repeated debit description represents ${Math.round(concentrated.shareOfCurrent30Outflow*100)}% of recorded 30-day outflows across ${concentrated.transactionCount} transaction(s). Thebe has not verified it as a supplier identity.`,source:"finance_transactions_description_only"}));
  if(scenario.cashFlowMarginProxyPct!=null&&scenario.cashFlowMarginProxyPct<0)signals.push(frozen({key:"cash_flow_margin_pressure",severity:"medium",detail:`Recorded 30-day cash-flow margin proxy is ${Math.round(scenario.cashFlowMarginProxyPct*100)}%. This is not accounting gross margin or profit.`,source:"finance_transactions"}));
  return frozen({
    version:MONEY_INTELLIGENCE_VERSION,
    available:true,
    businessDate,
    currency:"BWP",
    trend,
    assumptions,
    commitments,
    scenario,
    debitConcentrations,
    signals:frozen(signals),
    authority:frozen({readOnly:true,executionAllowed:false,forecast:false,scenarioProjection:true,accountingMargin:false,financialAdvice:false})
  });
}
export const __moneyIntelligenceTest=frozen({summarizeTransactions,assumptionMetrics,cashScenario,ownerCommitments,debitConcentration,pctChange});
