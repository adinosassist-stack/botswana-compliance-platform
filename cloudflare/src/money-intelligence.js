export const MONEY_INTELLIGENCE_VERSION="2026-09-26.v3";
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
    const ownerEnding=Math.round(number(cashPositionMinor)+dailyInflow*days-ownerDailyOutflow*days);
    const ownerEndingWithCollection=Math.round(ownerEnding+ownerCollection);
    return frozen({
      days,
      recordedRunRateEndingCashMinor:recordedEnding,
      ownerAssumptionEndingCashMinor:ownerEnding,
      ownerAssumptionEndingCashWithCollectionMinor:ownerEndingWithCollection,
      ownerCollectionUpsideMinor:ownerCollection,
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
    sameMonthReceivableCollectionUpsideMinor:collection30,
    receivableCollectionTreatment:"separate_upside_not_added_to_base_scenario",
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

function dateDiffDays(a,b){
  const am=startOfDay(a),bm=startOfDay(b);
  return am==null||bm==null?null:Math.round((am-bm)/dayMs);
}
function collectionBehavior(rows=[],businessDate){
  return frozen((rows||[]).map(row=>{
    const historyCount=Math.max(0,number(row?.historical_paid_count));
    const onTimeCount=Math.max(0,number(row?.historical_on_time_count));
    const historicalOnTimeRate=historyCount>0?Math.round((onTimeCount/historyCount)*1000)/1000:null;
    const earliestDue=dateOnly(row?.earliest_due_on),overdueDays=earliestDue&&earliestDue<businessDate?Math.max(0,dateDiffDays(businessDate,earliestDue)||0):0;
    let attention="normal";
    if(historyCount<3)attention=overdueDays>14?"watch":"insufficient_history";
    else if(overdueDays>=30&&historicalOnTimeRate<0.5)attention="higher_attention";
    else if(overdueDays>=14||historicalOnTimeRate<0.65)attention="watch";
    return frozen({
      customerId:clean(row?.customer_id,120),customerName:clean(row?.customer_name,160),
      outstandingMinor:number(row?.outstanding_minor),overdueMinor:number(row?.overdue_minor),
      earliestDueOn:earliestDue||null,overdueDays,
      historicalPaidInvoiceCount:historyCount,historicalOnTimeRate,
      attention,
      predictiveProbability:false,
      qualification:"Historical payment behavior and current overdue age only; not a probability of future payment."
    });
  }));
}
function expenseCategoryLearning(rows=[],currentOutflow=0){
  const items=(rows||[]).map(row=>{
    const total=number(row?.total_outflow_minor);
    return frozen({
      supplierId:clean(row?.supplier_id,120),supplierName:clean(row?.supplier_name,160),
      expenseCategory:clean(row?.expense_category,60)||"other",
      transactionCount:Math.max(0,number(row?.transaction_count)),
      totalOutflowMinor:total,
      shareOfCurrent30Outflow:currentOutflow>0?Math.round((total/currentOutflow)*1000)/1000:null,
      matchAuthority:"owner_confirmed_supplier_alias_exact_match",
      accountingPosting:false
    });
  });
  const byCategory=new Map();
  for(const item of items)byCategory.set(item.expenseCategory,(byCategory.get(item.expenseCategory)||0)+item.totalOutflowMinor);
  const categories=[...byCategory.entries()].map(([expenseCategory,totalOutflowMinor])=>frozen({
    expenseCategory,totalOutflowMinor,
    shareOfCurrent30Outflow:currentOutflow>0?Math.round((totalOutflowMinor/currentOutflow)*1000)/1000:null
  })).sort((a,b)=>b.totalOutflowMinor-a.totalOutflowMinor);
  return frozen({
    suppliers:frozen(items),
    categories:frozen(categories),
    basis:"recorded_negative_transactions_exactly_matching_owner_confirmed_supplier_aliases",
    accountingClassification:false
  });
}
function forwardCashCalendar({businessDate,cashPositionMinor=0,payables={},receivables={},collectionBehaviors=[]}={}){
  const behaviorByCustomer=new Map((collectionBehaviors||[]).map(item=>[String(item.customerId||""),item]));
  const events=[];
  for(const row of Array.isArray(payables?.payables)?payables.payables:[]){
    if(number(row?.outstandingMinor)<=0)continue;
    const rawDue=dateOnly(row?.dueOn),effectiveDate=rawDue&&rawDue<businessDate?businessDate:rawDue;
    if(!effectiveDate||dateDiffDays(effectiveDate,businessDate)>30)continue;
    events.push(frozen({
      date:effectiveDate,originalDueOn:rawDue||null,type:"committed_payable",direction:"outflow",
      amountMinor:number(row.outstandingMinor),label:clean(row?.supplierName||row?.payableNumber,160),
      reference:clean(row?.payableNumber,100)||null,canonical:true,includedInCommittedCash:true
    }));
  }
  for(const row of Array.isArray(receivables?.invoices)?receivables.invoices:[]){
    if(number(row?.outstandingMinor)<=0)continue;
    const due=dateOnly(row?.dueOn);if(!due||dateDiffDays(due,businessDate)>30)continue;
    const behavior=behaviorByCustomer.get(String(row?.customerId||""));
    events.push(frozen({
      date:due<businessDate?businessDate:due,originalDueOn:due,type:"potential_receivable",direction:"inflow",
      amountMinor:number(row.outstandingMinor),label:clean(row?.customerName||row?.invoiceNumber,160),
      reference:clean(row?.invoiceNumber,100)||null,canonical:true,includedInCommittedCash:false,
      collectionAttention:behavior?.attention||"insufficient_history",
      historicalOnTimeRate:behavior?.historicalOnTimeRate??null
    }));
  }
  events.sort((a,b)=>a.date.localeCompare(b.date)||(a.direction==="outflow"?-1:1)- (b.direction==="outflow"?-1:1));
  let committedCash=number(cashPositionMinor),lowestCommittedCash=committedCash,lowestDate=businessDate;
  const calendar=events.map(event=>{
    if(event.includedInCommittedCash&&event.direction==="outflow")committedCash-=event.amountMinor;
    if(committedCash<lowestCommittedCash){lowestCommittedCash=committedCash;lowestDate=event.date}
    return frozen({...event,committedCashAfterMinor:committedCash});
  });
  const visibleReceivables=Array.isArray(receivables?.invoices)?receivables.invoices.length:0;
  const totalOpenReceivables=number(receivables?.outstandingInvoiceCount);
  return frozen({
    basis:"canonical_payables_plus_potential_receivables",
    formalForecast:false,
    receivablesAssumedCollected:false,
    detailedEventCoverage:frozen({
      payableRowsShown:Array.isArray(payables?.payables)?payables.payables.length:0,
      payableRowsTotal:number(payables?.outstandingPayableCount),
      receivableRowsShown:visibleReceivables,
      receivableRowsTotal:totalOpenReceivables,
      payablesComplete:(Array.isArray(payables?.payables)?payables.payables.length:0)>=number(payables?.outstandingPayableCount),
      receivablesComplete:visibleReceivables>=totalOpenReceivables
    }),
    events:frozen(calendar),
    next7:frozen({
      committedOutflowMinor:number(payables?.overdueMinor)+number(payables?.due7dMinor),
      overdueOutflowMinor:number(payables?.overdueMinor),
      upcomingOutflowMinor:number(payables?.due7dMinor),
      potentialReceivableMinor:number(receivables?.overdueMinor)+number(receivables?.due7dMinor),
      overdueReceivableMinor:number(receivables?.overdueMinor),
      upcomingReceivableMinor:number(receivables?.due7dMinor)
    }),
    next14:frozen({
      committedOutflowMinor:number(payables?.overdueMinor)+number(payables?.due14dMinor),
      overdueOutflowMinor:number(payables?.overdueMinor),
      upcomingOutflowMinor:number(payables?.due14dMinor),
      potentialReceivableMinor:number(receivables?.overdueMinor)+number(receivables?.due14dMinor),
      overdueReceivableMinor:number(receivables?.overdueMinor),
      upcomingReceivableMinor:number(receivables?.due14dMinor)
    }),
    next30:frozen({
      committedOutflowMinor:number(payables?.overdueMinor)+number(payables?.due30dMinor),
      overdueOutflowMinor:number(payables?.overdueMinor),
      upcomingOutflowMinor:number(payables?.due30dMinor),
      potentialReceivableMinor:number(receivables?.overdueMinor)+number(receivables?.due30dMinor),
      overdueReceivableMinor:number(receivables?.overdueMinor),
      upcomingReceivableMinor:number(receivables?.due30dMinor)
    }),
    lowestCommittedCashMinor:lowestCommittedCash,
    lowestCommittedCashDate:lowestDate
  });
}

export async function buildMoneyIntelligence(env,tenantId,{businessDate,cashPositionMinor=0,memory={},receivables={},payables={}}={}){
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
  let largeDebits=[],concentrationRows=[],collectionRows=[],expenseRows=[];
  try{
    const [largeResult,concentrationResult,collectionResult,expenseResult]=await Promise.all([
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
        .bind(tenantId,businessDate,businessDate).all(),
      env.DB.prepare(`WITH alloc AS (
          SELECT a.invoice_id,
            SUM(CASE WHEN a.entry_type='apply' THEN a.amount_minor ELSE -a.amount_minor END) allocated_minor,
            MAX(CASE WHEN a.entry_type='apply' THEN t.posted_on END) last_payment_on
          FROM finance_invoice_allocations a
          JOIN finance_transactions t ON t.id=a.transaction_id AND t.tenant_id=a.tenant_id
          WHERE a.tenant_id=? GROUP BY a.invoice_id
        ), history AS (
          SELECT i.customer_id,
            SUM(CASE WHEN COALESCE(a.allocated_minor,0)>=i.total_minor THEN 1 ELSE 0 END) historical_paid_count,
            SUM(CASE WHEN COALESCE(a.allocated_minor,0)>=i.total_minor AND a.last_payment_on<=i.due_on THEN 1 ELSE 0 END) historical_on_time_count
          FROM finance_invoices i LEFT JOIN alloc a ON a.invoice_id=i.id
          WHERE i.tenant_id=? AND i.status='issued' GROUP BY i.customer_id
        ), open_rows AS (
          SELECT i.customer_id,c.name customer_name,i.due_on,
            i.total_minor-COALESCE(a.allocated_minor,0) outstanding_minor
          FROM finance_invoices i JOIN finance_customers c ON c.id=i.customer_id AND c.tenant_id=i.tenant_id
          LEFT JOIN alloc a ON a.invoice_id=i.id
          WHERE i.tenant_id=? AND i.status='issued' AND i.total_minor>COALESCE(a.allocated_minor,0)
        )
        SELECT o.customer_id,o.customer_name,SUM(o.outstanding_minor) outstanding_minor,
          SUM(CASE WHEN o.due_on<? THEN o.outstanding_minor ELSE 0 END) overdue_minor,MIN(o.due_on) earliest_due_on,
          COALESCE(h.historical_paid_count,0) historical_paid_count,COALESCE(h.historical_on_time_count,0) historical_on_time_count
        FROM open_rows o LEFT JOIN history h ON h.customer_id=o.customer_id
        GROUP BY o.customer_id,o.customer_name,h.historical_paid_count,h.historical_on_time_count
        ORDER BY overdue_minor DESC,outstanding_minor DESC LIMIT 20`)
        .bind(tenantId,tenantId,tenantId,businessDate).all(),
      env.DB.prepare(`SELECT s.id supplier_id,s.name supplier_name,s.default_expense_category expense_category,
          COUNT(*) transaction_count,SUM(ABS(t.amount_minor)) total_outflow_minor
        FROM finance_transactions t
        JOIN finance_supplier_aliases a ON a.tenant_id=t.tenant_id
          AND (LOWER(TRIM(t.description))=LOWER(TRIM(a.alias_text)) OR LOWER(TRIM(t.reference))=LOWER(TRIM(a.alias_text)))
        JOIN finance_suppliers s ON s.id=a.supplier_id AND s.tenant_id=t.tenant_id AND s.status='active'
        WHERE t.tenant_id=? AND t.posted_on>=date(?,'-29 days') AND t.posted_on<=date(?) AND t.amount_minor<0
        GROUP BY s.id,s.name,s.default_expense_category
        ORDER BY total_outflow_minor DESC LIMIT 20`)
        .bind(tenantId,businessDate,businessDate).all()
    ]);
    largeDebits=(largeResult.results||[]).map(row=>frozen({
      id:clean(row?.id,120),postedOn:dateOnly(row?.posted_on),description:clean(row?.description,120),
      reference:clean(row?.reference,80),amountMinor:number(row?.amount_minor)
    }));
    concentrationRows=concentrationResult.results||[];
    collectionRows=collectionResult.results||[];
    expenseRows=expenseResult.results||[];
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
  const scenario=cashScenario({cashPositionMinor,trend,assumptions,receivablesOutstandingMinor:Number(receivables?.outstandingMinor||0)});
  const commitments=ownerCommitments(assumptions);
  const debitConcentrations=debitConcentration(concentrationRows,currentOutflow);
  const collectionBehaviors=collectionBehavior(collectionRows,businessDate);
  const expenseLearning=expenseCategoryLearning(expenseRows,currentOutflow);
  const cashCalendar=forwardCashCalendar({businessDate,cashPositionMinor,payables,receivables,collectionBehaviors});
  const signals=[];
  if(trend.outflowChangePct!=null&&trend.outflowChangePct>=0.25)signals.push(frozen({key:"outflow_acceleration",severity:"medium",detail:`Recorded 30-day outflows are ${Math.round(trend.outflowChangePct*100)}% above the previous 30-day period.`,source:"finance_transactions"}));
  if(trend.largeDebits.length)signals.push(frozen({key:"large_debits",severity:"medium",detail:`${trend.largeDebits.length} recent debit(s) exceed the deterministic large-debit threshold.`,source:"finance_transactions"}));
  if(assumptions.estimatedRunwayDays!=null&&assumptions.estimatedRunwayDays<45)signals.push(frozen({key:"cash_runway",severity:"high",detail:`Estimated runway is ${assumptions.estimatedRunwayDays} days using owner-entered monthly outflows.`,source:"owner_entered_assumptions"}));
  if(scenario.firstOwnerBufferBreachHorizonDays!=null)signals.push(frozen({key:"cash_buffer_scenario",severity:"high",detail:`Owner-assumption cash scenario falls below the entered minimum cash buffer within the ${scenario.firstOwnerBufferBreachHorizonDays}-day horizon.`,source:"recorded_cash_run_rate_plus_owner_assumptions"}));
  if(commitments.totalUntimedOneOffMinor>0&&assumptions.safeDiscretionaryMinor!=null&&commitments.totalUntimedOneOffMinor>assumptions.safeDiscretionaryMinor)signals.push(frozen({key:"commitment_pressure",severity:"high",detail:"Owner-entered planned one-off commitments exceed current cash above the entered minimum cash buffer. Timing is not known.",source:"owner_entered_assumptions"}));
  const concentrated=debitConcentrations.find(row=>row.transactionCount>=3&&row.shareOfCurrent30Outflow!=null&&row.shareOfCurrent30Outflow>=0.35);
  if(concentrated)signals.push(frozen({key:"debit_concentration",severity:"medium",detail:`One repeated debit description represents ${Math.round(concentrated.shareOfCurrent30Outflow*100)}% of recorded 30-day outflows across ${concentrated.transactionCount} transaction(s). Thebe has not verified it as a supplier identity.`,source:"finance_transactions_description_only"}));
  if(scenario.cashFlowMarginProxyPct!=null&&scenario.cashFlowMarginProxyPct<0)signals.push(frozen({key:"cash_flow_margin_pressure",severity:"medium",detail:`Recorded 30-day cash-flow margin proxy is ${Math.round(scenario.cashFlowMarginProxyPct*100)}%. This is not accounting gross margin or profit.`,source:"finance_transactions"}));
  if(Number(payables?.overdueMinor||0)>0)signals.push(frozen({key:"overdue_payables",severity:"high",detail:`${Number(payables.overduePayableCount||0)} recorded payable(s) totaling ${Number(payables.overdueMinor||0)} minor units are overdue.`,source:"finance_payables"}));
  if((Number(payables?.overdueMinor||0)+Number(payables?.due14dMinor||0))>0&&(Number(payables?.overdueMinor||0)+Number(payables?.due14dMinor||0))>number(cashPositionMinor))signals.push(frozen({key:"payables_cash_pressure_14d",severity:"high",detail:"Recorded overdue supplier payables plus payables due within 14 days exceed the current recorded cash position.",source:"finance_payables_plus_finance_accounts"}));
  const customerAttention=collectionBehaviors.find(item=>item.attention==="higher_attention");
  if(customerAttention)signals.push(frozen({key:"collection_attention",severity:"medium",detail:`${customerAttention.customerName||"A customer"} has overdue receivables and weaker historical on-time payment behavior. This is an attention signal, not a payment probability.`,source:"finance_invoices_plus_allocations"}));
  const learnedCategory=expenseLearning.categories[0];
  if(learnedCategory?.shareOfCurrent30Outflow!=null&&learnedCategory.shareOfCurrent30Outflow>=0.5)signals.push(frozen({key:"expense_category_concentration",severity:"medium",detail:`${clean(learnedCategory.expenseCategory,60)} represents ${Math.round(learnedCategory.shareOfCurrent30Outflow*100)}% of 30-day outflows matched through owner-confirmed supplier aliases. This is not an accounting posting.`,source:"finance_transactions_plus_confirmed_supplier_aliases"}));
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
    collectionBehaviors,
    expenseLearning,
    cashCalendar,
    payables:frozen({available:payables?.available===true,outstandingMinor:number(payables?.outstandingMinor),overdueMinor:number(payables?.overdueMinor),due7dMinor:number(payables?.due7dMinor),due14dMinor:number(payables?.due14dMinor),due30dMinor:number(payables?.due30dMinor),supplierCount:number(payables?.supplierCount)}),
    signals:frozen(signals),
    authority:frozen({readOnly:true,executionAllowed:false,forecast:false,scenarioProjection:true,accountingMargin:false,accountingPosting:false,supplierPayments:false,financialAdvice:false})
  });
}
export const __moneyIntelligenceTest=frozen({summarizeTransactions,assumptionMetrics,cashScenario,ownerCommitments,debitConcentration,collectionBehavior,expenseCategoryLearning,forwardCashCalendar,pctChange});
