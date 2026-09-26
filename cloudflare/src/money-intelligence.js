export const MONEY_INTELLIGENCE_VERSION="2026-09-26.v6";
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
  const monthlyLabourCostMinor=toMinor(assumptions.monthlyLabourCostBwp);
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
function supplierSpendTrend(rows=[]){
  return frozen((rows||[]).map(row=>{
    const currentOutflowMinor=number(row?.current_outflow_minor),priorOutflowMinor=number(row?.prior_outflow_minor);
    const currentTransactionCount=Math.max(0,number(row?.current_count)),priorTransactionCount=Math.max(0,number(row?.prior_count));
    const changePct=priorOutflowMinor>0?(currentOutflowMinor-priorOutflowMinor)/priorOutflowMinor:null;
    const absoluteChangeMinor=currentOutflowMinor-priorOutflowMinor;
    const enoughHistory=currentTransactionCount>=2&&priorTransactionCount>=2;
    const attention=enoughHistory&&changePct!=null&&changePct>=0.25&&absoluteChangeMinor>=100000
      ?"increase"
      :enoughHistory&&changePct!=null&&changePct<=-0.25&&absoluteChangeMinor<=-100000
        ?"decrease"
        :(enoughHistory?"stable":"sparse_history");
    return frozen({
      supplierId:clean(row?.supplier_id,120),supplierName:clean(row?.supplier_name,160),
      expenseCategory:clean(row?.expense_category,60)||"other",
      current30OutflowMinor:currentOutflowMinor,prior30OutflowMinor:priorOutflowMinor,currentTransactionCount,priorTransactionCount,
      currentAverageTransactionMinor:currentTransactionCount?Math.round(currentOutflowMinor/currentTransactionCount):null,
      priorAverageTransactionMinor:priorTransactionCount?Math.round(priorOutflowMinor/priorTransactionCount):null,
      changePct:changePct==null?null:Math.round(changePct*1000)/1000,
      absoluteChangeMinor,
      enoughHistory,
      attention,
      matchAuthority:"owner_confirmed_supplier_alias_exact_match",
      unitPriceInflationClaimed:false,
      qualification:"Change in total recorded supplier-matched cash outflow can reflect volume, timing or price. It is not a unit-price inflation measure."
    });
  }).sort((a,b)=>{
    const rank=value=>value==="increase"?0:value==="stable"?1:value==="decrease"?2:3;
    return rank(a.attention)-rank(b.attention)||Math.abs(b.absoluteChangeMinor)-Math.abs(a.absoluteChangeMinor);
  }));
}

function payableSupplierConcentration(payables={}){
  const total=Math.max(0,number(payables?.outstandingMinor)),suppliers=Array.isArray(payables?.suppliers)?payables.suppliers:[];
  const top=suppliers[0];
  if(!top||total<=0)return frozen({available:false,totalOutstandingMinor:total,topSupplier:null});
  const amount=Math.max(0,number(top?.outstandingMinor)),share=amount/total;
  return frozen({
    available:true,totalOutstandingMinor:total,
    topSupplier:frozen({
      supplierId:clean(top?.supplierId,120),supplierName:clean(top?.supplierName,160),
      outstandingMinor:amount,overdueMinor:Math.max(0,number(top?.overdueMinor)),
      outstandingPayableCount:Math.max(0,number(top?.outstandingPayableCount)),
      shareOfOutstanding:Math.round(share*1000)/1000
    }),
    supplierRowsShown:suppliers.length,
    supplierCount:Math.max(0,number(payables?.supplierCount)),
    canonical:true,
    supplierIdentity:"finance_suppliers"
  });
}

function cashCommitmentStress({cashPositionMinor=0,cashCalendar={},minimumCashBufferMinor=null}={}){
  const cash=number(cashPositionMinor),committed14=Math.max(0,number(cashCalendar?.next14?.committedOutflowMinor));
  const after14=cash-committed14,coverage=committed14>0?cash/committed14:null;
  const buffer=minimumCashBufferMinor==null?null:Math.max(0,number(minimumCashBufferMinor));
  const after14VsBuffer=buffer==null?null:after14-buffer;
  return frozen({
    basis:"recorded_cash_position_vs_recorded_overdue_and_next_14_day_supplier_payables",
    cashPositionMinor:cash,
    committed14dMinor:committed14,
    cashAfterCommitted14dMinor:after14,
    coverageRatio:coverage==null?null:Math.round(coverage*1000)/1000,
    shortfallMinor:Math.max(0,-after14),
    minimumCashBufferMinor:buffer,
    cashAfterCommittedVsOwnerBufferMinor:after14VsBuffer,
    supplierPayablesOnly:true,
    excludesOtherFutureOutflows:true,
    receivablesAssumedCollected:false,
    formalForecast:false
  });
}

function weeklySpendEnvelope({cashPositionMinor=0,cashCalendar={},assumptions={},reconciliationStale=false}={}){
  const cash=number(cashPositionMinor);
  const committed7d=Math.max(0,number(cashCalendar?.next7?.committedOutflowMinor));
  const payroll=assumptions?.monthlyLabourCostMinor==null?null:Math.max(0,number(assumptions.monthlyLabourCostMinor));
  const buffer=assumptions?.minimumCashBufferMinor==null?null:Math.max(0,number(assumptions.minimumCashBufferMinor));
  const plannedPurchase=assumptions?.plannedPurchaseMinor==null?null:Math.max(0,number(assumptions.plannedPurchaseMinor));
  const missing=[];
  const evidenceIssues=[];
  if(payroll==null)missing.push("monthly_labour_cost");
  if(buffer==null)missing.push("minimum_cash_buffer");
  if(cashCalendar?.payablesAvailable!==true)evidenceIssues.push("supplier_payables_unavailable");
  if(reconciliationStale===true)evidenceIssues.push("finance_reconciliation_stale");
  const ready=missing.length===0&&evidenceIssues.length===0;
  const protectedBeforeDiscretionary=ready?committed7d+payroll+buffer:null;
  const rawEnvelope=ready?cash-protectedBeforeDiscretionary:null;
  const envelope=rawEnvelope==null?null:Math.max(0,rawEnvelope);
  const afterPlannedPurchase=envelope==null?null:Math.max(0,envelope-(plannedPurchase||0));
  const warnings=[
    "Uses recorded cash, recorded supplier payables due now/within 7 days, and owner-entered payroll/buffer assumptions.",
    "Assumes no receivables are collected before spending.",
    "Unknown, unrecorded or later-due obligations are not reserved."
  ];
  if(cashCalendar?.payablesAvailable!==true)warnings.push("The supplier-payables ledger is unavailable, so Thebe will not calculate a discretionary spend amount.");
  if(reconciliationStale)warnings.push("The latest finance reconciliation is stale, so Thebe will not calculate a discretionary spend amount until cash is reviewed.");
  if(plannedPurchase)warnings.push("An owner-entered planned purchase is shown separately because its timing is unspecified.");
  const state=missing.length&&evidenceIssues.length?"needs_inputs_and_finance_review":missing.length?"needs_owner_inputs":evidenceIssues.length?"needs_finance_review":(envelope>0?"available":"none");
  return frozen({
    ready,
    state,
    missingInputs:frozen(missing),
    blockingEvidence:frozen(evidenceIssues),
    currency:"BWP",
    horizonDays:7,
    recordedCashPositionMinor:cash,
    recordedSupplierPayablesDue7dMinor:cashCalendar?.payablesAvailable===true?committed7d:null,
    payrollReserveMinor:payroll,
    minimumCashBufferMinor:buffer,
    protectedBeforeDiscretionaryMinor:protectedBeforeDiscretionary,
    discretionaryEnvelopeMinor:envelope,
    ownerPlannedPurchaseMinor:plannedPurchase,
    discretionaryAfterPlannedPurchaseMinor:afterPlannedPurchase,
    receivablesAssumedCollected:false,
    fullMonthlyPayrollReserved:true,
    unknownFutureObligationsReserved:false,
    payablesAvailable:cashCalendar?.payablesAvailable===true,
    reconciliationStale:reconciliationStale===true,
    formalForecast:false,
    spendingAuthorization:false,
    financialAdvice:false,
    basis:"recorded_cash_minus_recorded_7_day_supplier_payables_minus_owner_monthly_labour_reserve_minus_owner_minimum_cash_buffer",
    warnings:frozen(warnings)
  });
}

function simulateWeeklySpendDecision({spendEnvelope={},proposedSpendMinor,label=null}={}){
  const amount=Number(proposedSpendMinor);
  const validAmount=Number.isSafeInteger(amount)&&amount>0&&amount<=100000000000000;
  const cleanLabel=clean(label,120)||"Proposed spend";
  if(!validAmount)return frozen({
    ready:false,state:"invalid_amount",error:"invalid_proposed_spend_minor",label:cleanLabel,
    proposedSpendMinor:null,withinEnvelope:null,remainingEnvelopeMinor:null,exceedsEnvelopeByMinor:null,
    protectedReservesPreserved:null,executionPerformed:false,spendingAuthorization:false,financialAdvice:false
  });
  if(spendEnvelope?.ready!==true||spendEnvelope?.discretionaryEnvelopeMinor==null){
    return frozen({
      ready:false,state:"blocked",error:"weekly_spend_envelope_unavailable",label:cleanLabel,
      proposedSpendMinor:amount,withinEnvelope:null,remainingEnvelopeMinor:null,exceedsEnvelopeByMinor:null,
      protectedReservesPreserved:null,
      envelopeState:clean(spendEnvelope?.state,80)||"unavailable",
      missingInputs:frozen(Array.isArray(spendEnvelope?.missingInputs)?spendEnvelope.missingInputs.slice(0,8):[]),
      blockingEvidence:frozen(Array.isArray(spendEnvelope?.blockingEvidence)?spendEnvelope.blockingEvidence.slice(0,8):[]),
      warnings:frozen(Array.isArray(spendEnvelope?.warnings)?spendEnvelope.warnings.slice(0,8):[]),
      executionPerformed:false,spendingAuthorization:false,financialAdvice:false
    });
  }
  const envelope=Math.max(0,number(spendEnvelope.discretionaryEnvelopeMinor));
  const within=amount<=envelope;
  const remaining=Math.max(0,envelope-amount);
  const overage=Math.max(0,amount-envelope);
  const cash=Math.max(0,number(spendEnvelope.recordedCashPositionMinor));
  return frozen({
    ready:true,state:within?"within_envelope":"above_envelope",label:cleanLabel,
    proposedSpendMinor:amount,weeklyEnvelopeMinor:envelope,withinEnvelope:within,
    remainingEnvelopeMinor:remaining,exceedsEnvelopeByMinor:overage,
    recordedCashAfterSpendMinor:cash-amount,
    protectedReservesPreserved:within,
    horizonDays:Number(spendEnvelope.horizonDays||7),
    basis:"comparison_to_fail_closed_weekly_discretionary_planning_envelope",
    receivablesAssumedCollected:false,
    formalForecast:false,
    executionPerformed:false,
    paymentInitiated:false,
    spendingAuthorization:false,
    financialAdvice:false
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
    payablesAvailable:payables?.available===true,
    receivablesAvailable:receivables?.available!==false,
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

export async function buildMoneyIntelligence(env,tenantId,{businessDate,cashPositionMinor=0,memory={},receivables={},payables={},reconciliationStale=false}={}){
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
  let largeDebits=[],concentrationRows=[],collectionRows=[],expenseRows=[],supplierTrendRows=[];
  try{
    const [largeResult,concentrationResult,collectionResult,expenseResult,supplierTrendResult]=await Promise.all([
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
      env.DB.prepare(`WITH matched AS (
          SELECT DISTINCT t.id transaction_id,t.amount_minor,a.supplier_id
          FROM finance_transactions t
          JOIN finance_supplier_aliases a ON a.tenant_id=t.tenant_id
            AND (LOWER(TRIM(t.description))=LOWER(TRIM(a.alias_text)) OR LOWER(TRIM(t.reference))=LOWER(TRIM(a.alias_text)))
          WHERE t.tenant_id=? AND t.posted_on>=date(?,'-29 days') AND t.posted_on<=date(?) AND t.amount_minor<0
        )
        SELECT s.id supplier_id,s.name supplier_name,s.default_expense_category expense_category,
          COUNT(*) transaction_count,SUM(ABS(m.amount_minor)) total_outflow_minor
        FROM matched m
        JOIN finance_suppliers s ON s.id=m.supplier_id AND s.status='active'
        GROUP BY s.id,s.name,s.default_expense_category
        ORDER BY total_outflow_minor DESC LIMIT 20`)
        .bind(tenantId,businessDate,businessDate).all(),
      env.DB.prepare(`WITH matched AS (
          SELECT DISTINCT t.id transaction_id,t.posted_on,ABS(t.amount_minor) outflow_minor,a.supplier_id
          FROM finance_transactions t
          JOIN finance_supplier_aliases a ON a.tenant_id=t.tenant_id
            AND (LOWER(TRIM(t.description))=LOWER(TRIM(a.alias_text)) OR LOWER(TRIM(t.reference))=LOWER(TRIM(a.alias_text)))
          WHERE t.tenant_id=? AND t.posted_on>=date(?,'-59 days') AND t.posted_on<=date(?) AND t.amount_minor<0
        )
        SELECT s.id supplier_id,s.name supplier_name,s.default_expense_category expense_category,
          SUM(CASE WHEN m.posted_on>=date(?,'-29 days') THEN m.outflow_minor ELSE 0 END) current_outflow_minor,
          SUM(CASE WHEN m.posted_on>=date(?,'-29 days') THEN 1 ELSE 0 END) current_count,
          SUM(CASE WHEN m.posted_on<date(?,'-29 days') THEN m.outflow_minor ELSE 0 END) prior_outflow_minor,
          SUM(CASE WHEN m.posted_on<date(?,'-29 days') THEN 1 ELSE 0 END) prior_count
        FROM matched m JOIN finance_suppliers s ON s.id=m.supplier_id AND s.status='active'
        GROUP BY s.id,s.name,s.default_expense_category
        ORDER BY current_outflow_minor DESC,prior_outflow_minor DESC,s.name ASC LIMIT 20`)
        .bind(tenantId,businessDate,businessDate,businessDate,businessDate,businessDate,businessDate).all()
    ]);
    largeDebits=(largeResult.results||[]).map(row=>frozen({
      id:clean(row?.id,120),postedOn:dateOnly(row?.posted_on),description:clean(row?.description,120),
      reference:clean(row?.reference,80),amountMinor:number(row?.amount_minor)
    }));
    concentrationRows=concentrationResult.results||[];
    collectionRows=collectionResult.results||[];
    expenseRows=expenseResult.results||[];
    supplierTrendRows=supplierTrendResult.results||[];
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
  const supplierSpendTrends=supplierSpendTrend(supplierTrendRows);
  const payableConcentration=payableSupplierConcentration(payables);
  const cashCalendar=forwardCashCalendar({businessDate,cashPositionMinor,payables,receivables,collectionBehaviors});
  const commitmentStress=cashCommitmentStress({cashPositionMinor,cashCalendar,minimumCashBufferMinor:assumptions.minimumCashBufferMinor});
  const spendEnvelope=weeklySpendEnvelope({cashPositionMinor,cashCalendar,assumptions,reconciliationStale});
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
  const customerAttention=collectionBehaviors.find(item=>item.attention==="higher_attention");
  if(customerAttention)signals.push(frozen({key:"collection_attention",severity:"medium",detail:`${customerAttention.customerName||"A customer"} has overdue receivables and weaker historical on-time payment behavior. This is an attention signal, not a payment probability.`,source:"finance_invoices_plus_allocations"}));
  const learnedCategory=expenseLearning.categories[0];
  if(learnedCategory?.shareOfCurrent30Outflow!=null&&learnedCategory.shareOfCurrent30Outflow>=0.5)signals.push(frozen({key:"expense_category_concentration",severity:"medium",detail:`${clean(learnedCategory.expenseCategory,60)} represents ${Math.round(learnedCategory.shareOfCurrent30Outflow*100)}% of 30-day outflows matched through owner-confirmed supplier aliases. This is not an accounting posting.`,source:"finance_transactions_plus_confirmed_supplier_aliases"}));
  const supplierIncrease=supplierSpendTrends.find(item=>item.attention==="increase");
  if(supplierIncrease)signals.push(frozen({
    key:"supplier_outflow_acceleration",severity:"medium",
    detail:`${supplierIncrease.supplierName||"A confirmed supplier"} matched cash outflow increased ${Math.round(Number(supplierIncrease.changePct||0)*100)}% versus the prior 30 days, an absolute increase of ${Math.round(Number(supplierIncrease.absoluteChangeMinor||0))} minor units. This can reflect volume, timing or price and is not a unit-price inflation claim.`,
    source:"finance_transactions_plus_owner_confirmed_supplier_aliases"
  }));
  if(payableConcentration?.topSupplier?.shareOfOutstanding>=0.5&&payableConcentration?.topSupplier?.outstandingPayableCount>=1)signals.push(frozen({
    key:"supplier_payable_concentration",severity:"medium",
    detail:`${payableConcentration.topSupplier.supplierName||"One supplier"} represents ${Math.round(payableConcentration.topSupplier.shareOfOutstanding*100)}% of recorded outstanding supplier payables.`,
    source:"finance_payables"
  }));
  if(spendEnvelope.ready&&spendEnvelope.discretionaryEnvelopeMinor===0)signals.push(frozen({
    key:"weekly_spend_envelope_zero",severity:"high",
    detail:"The conservative 7-day discretionary spend envelope is zero after reserving recorded supplier payables due now/within 7 days, the full owner-entered monthly labour cost and the owner-entered minimum cash buffer.",
    source:"finance_accounts_plus_finance_payables_plus_owner_assumptions"
  }));
    if(commitmentStress.shortfallMinor>0)signals.push(frozen({
    key:"payable_cover_shortfall_14d",severity:"high",
    detail:`Recorded cash is short of recorded overdue and next-14-day supplier payables by ${Math.round(commitmentStress.shortfallMinor)} minor units. This comparison excludes other future outflows and assumes no receivables are collected.`,
    source:"finance_accounts_plus_finance_payables"
  }));
  else if(commitmentStress.coverageRatio!=null&&commitmentStress.coverageRatio<1.25)signals.push(frozen({
    key:"payable_cover_tight_14d",severity:"medium",
    detail:`Recorded cash covers recorded overdue and next-14-day supplier payables by ${commitmentStress.coverageRatio.toFixed(2)}x. This is a payable-cover signal, not a full liquidity forecast.`,
    source:"finance_accounts_plus_finance_payables"
  }));
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
    supplierSpendTrends,
    payableConcentration,
    cashCalendar,
    commitmentStress,
    payables:frozen({available:payables?.available===true,outstandingMinor:number(payables?.outstandingMinor),overdueMinor:number(payables?.overdueMinor),due7dMinor:number(payables?.due7dMinor),due14dMinor:number(payables?.due14dMinor),due30dMinor:number(payables?.due30dMinor),supplierCount:number(payables?.supplierCount)}),
    signals:frozen(signals),
    authority:frozen({readOnly:true,executionAllowed:false,forecast:false,scenarioProjection:true,accountingMargin:false,accountingPosting:false,supplierPayments:false,financialAdvice:false})
  });
}
export const __moneyIntelligenceTest=frozen({summarizeTransactions,assumptionMetrics,cashScenario,ownerCommitments,debitConcentration,collectionBehavior,expenseCategoryLearning,supplierSpendTrend,payableSupplierConcentration,cashCommitmentStress,weeklySpendEnvelope,simulateWeeklySpendDecision,forwardCashCalendar,pctChange});
