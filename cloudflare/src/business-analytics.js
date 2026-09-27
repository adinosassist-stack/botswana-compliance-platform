export const BUSINESS_ANALYTICS_VERSION="2026-09-27.v173";

const frozen=value=>Object.freeze(value);
const number=value=>Number.isFinite(Number(value))?Number(value):0;
const optionalNumber=value=>value==null||!Number.isFinite(Number(value))?null:Number(value);
const ratioPct=value=>value==null||!Number.isFinite(Number(value))?null:Math.round(Number(value)*1000)/10;

function signal(key,severity,title,detail,sourceRefs=[]){
  return frozen({
    key,
    severity,
    title:String(title||"").slice(0,180),
    detail:String(detail||"").slice(0,420),
    sourceRefs:frozen(sourceRefs.slice(0,12)),
    readOnly:true,
    executionAllowed:false
  });
}
function severityRank(value){return value==="high"?0:value==="medium"?1:2}
function dataReadiness({moneyAvailable,reconciliationCurrent,operationsAvailable}){
  if(!moneyAvailable)return "limited";
  if(!reconciliationCurrent||!operationsAvailable)return "partial";
  return "strong";
}

export function buildBusinessAnalytics(context={}){
  const finance=context?.finance||{},reconciliation=finance?.reconciliation||{};
  const receivables=finance?.receivables||{},payables=finance?.payables||{};
  const money=context?.moneyIntelligence||{},trend=money?.trend||{},current30=trend?.current30||{},prior30=trend?.prior30||{};
  const scenario=money?.scenario||{},commitmentStress=money?.commitmentStress||{};
  const operations=context?.operations||{},compliance=context?.compliance||{},sales=context?.sales||{},property=context?.property||{};
  const propertyAvailable=property?.available===true;
  const signals=[];

  if(Number(reconciliation?.unresolvedCount||0)>0)signals.push(signal(
    "finance_reconciliation_exceptions","high","Finance reconciliation needs attention",
    `${Number(reconciliation.unresolvedCount||0)} unresolved reconciliation exception(s) remain across the canonical Finance Core.`,
    ["finance_reconciliation_runs"]
  ));
  else if(reconciliation?.stale===true)signals.push(signal(
    "finance_reconciliation_stale","medium","Finance reconciliation is stale",
    "Refresh reconciliation before relying on cash analytics for management decisions.",
    ["finance_reconciliation_runs"]
  ));
  if(Number(receivables?.overdueMinor||0)>0)signals.push(signal(
    "overdue_receivables","high","Overdue customer money needs collection",
    `${Number(receivables.overdueInvoiceCount||0)} issued invoice(s) are overdue. Analytics reports the recorded balance only and does not assume collection.`,
    ["finance_invoices","finance_invoice_allocations"]
  ));
  if(Number(commitmentStress?.shortfallMinor||0)>0)signals.push(signal(
    "payables_cover_shortfall","high","Recorded cash does not cover near-term supplier commitments",
    "Recorded cash is below overdue plus next-14-day supplier payables. Other future outflows and future collections are excluded.",
    ["finance_accounts","finance_payables","finance_payable_allocations"]
  ));
  if(number(current30?.net)<0)signals.push(signal(
    "negative_30d_cash_movement","medium","30-day cash movement is negative",
    "Recorded cash outflows exceeded recorded inflows over the latest 30-day period. This is cash movement, not accounting profit.",
    ["finance_transactions"]
  ));
  if(optionalNumber(trend?.outflowChangePct)!==null&&Number(trend.outflowChangePct)>=0.15)signals.push(signal(
    "outflow_acceleration","medium","Cash outflows increased versus the prior 30 days",
    `Recorded 30-day outflows increased by ${Math.round(Number(trend.outflowChangePct)*100)}% versus the preceding 30-day period.`,
    ["finance_transactions"]
  ));
  if(Number(operations?.criticalPerformanceSignals||0)>0)signals.push(signal(
    "critical_operating_signals","high","Critical operating signals are open",
    `${Number(operations.criticalPerformanceSignals||0)} critical operating signal(s) remain open or acknowledged.`,
    ["performance_insights","daily_operations_summaries"]
  ));
  if(Number(compliance?.overdueCount||0)>0)signals.push(signal(
    "overdue_compliance","high","Compliance actions are overdue",
    `${Number(compliance.overdueCount||0)} tracked compliance obligation(s) are overdue.`,
    ["compliance_obligations"]
  ));
  if(Number(sales?.dormantQuotationCount||0)>0)signals.push(signal(
    "dormant_sales_pipeline","medium","Dormant quotations need follow-up",
    `${Number(sales.dormantQuotationCount||0)} owner-recorded quotation(s) have passed the configured dormancy threshold.`,
    ["app_state.active_company.salesIntelligence"]
  ));
  if(propertyAvailable&&Number(property?.unvaluedAssetCount||0)>0)signals.push(signal(
    "property_valuation_coverage","medium","Property portfolio has valuation coverage gaps",
    `${Number(property.unvaluedAssetCount||0)} active property asset(s) do not yet have a recorded professional valuation report.`,
    ["property_assets","property_professional_valuations"]
  ));
  if(propertyAvailable&&Number(property?.staleProfessionalValuationCount||0)>0)signals.push(signal(
    "property_professional_valuation_stale","medium","Some professional property valuations are older than 12 months",
    `${Number(property.staleProfessionalValuationCount||0)} active property asset(s) have a latest recorded professional valuation older than 12 months.`,
    ["property_professional_valuations"]
  ));
  if(propertyAvailable&&Number(property?.professionalValuationRenewalDueCount||0)>0)signals.push(signal(
    "property_valuation_review_due","medium","Professional property valuation review is due",
    `${Number(property.professionalValuationRenewalDueCount||0)} active property asset(s) have a recorded valuation review reminder that is due. A reminder is not a statement that a valuation has legally expired.`,
    ["property_professional_valuations"]
  ));
  else if(propertyAvailable&&Number(property?.professionalValuationRenewalDueSoonCount||0)>0)signals.push(signal(
    "property_valuation_review_due_soon","medium","Professional property valuation review is due soon",
    `${Number(property.professionalValuationRenewalDueSoonCount||0)} active property asset(s) have a recorded valuation review reminder due within 60 days.`,
    ["property_professional_valuations"]
  ));
  if(propertyAvailable&&Number(property?.valuationReportEvidenceGapCount||0)>0)signals.push(signal(
    "property_valuation_report_evidence_gap","medium","Signed valuation-report evidence is incomplete",
    `${Number(property.valuationReportEvidenceGapCount||0)} valued property asset(s) do not have linked approved, malware-scan-clean signed-report evidence.`,
    ["property_professional_valuations","property_valuation_evidence_links","evidence"]
  ));

  signals.sort((a,b)=>severityRank(a.severity)-severityRank(b.severity)||a.key.localeCompare(b.key));

  const moneyAvailable=money?.available===true;
  const reconciliationCurrent=Number(reconciliation?.unresolvedCount||0)===0&&reconciliation?.stale!==true;
  const operationsAvailable=!!operations?.latestSummaryDate;
  const readiness=dataReadiness({moneyAvailable,reconciliationCurrent,operationsAvailable});
  const highCount=signals.filter(item=>item.severity==="high").length;
  const mediumCount=signals.filter(item=>item.severity==="medium").length;

  return frozen({
    version:BUSINESS_ANALYTICS_VERSION,
    observedAt:context?.observedAt||null,
    businessDate:context?.businessDate||null,
    market:context?.market||null,
    summary:frozen({
      attentionCount:signals.length,
      highAttentionCount:highCount,
      mediumAttentionCount:mediumCount,
      headline:highCount
        ?`${highCount} high-attention business signal(s) need review.`
        :signals.length
          ?`${signals.length} management signal(s) are worth reviewing.`
          :"No configured analytics threshold is currently crossed."
    }),
    domains:frozen({
      money:frozen({
        available:moneyAvailable,
        cashPositionMinor:number(finance?.cashPositionMinor),
        current30InflowMinor:number(current30?.inflow),
        current30OutflowMinor:number(current30?.outflow),
        current30NetCashMovementMinor:number(current30?.net),
        prior30InflowMinor:number(prior30?.inflow),
        prior30OutflowMinor:number(prior30?.outflow),
        inflowChangePct:optionalNumber(trend?.inflowChangePct),
        outflowChangePct:optionalNumber(trend?.outflowChangePct),
        cashFlowMarginProxyPct:optionalNumber(scenario?.cashFlowMarginProxyPct),
        estimatedRunwayDays:optionalNumber(money?.assumptions?.estimatedRunwayDays),
        reconciliationCurrent,
        unresolvedReconciliationCount:number(reconciliation?.unresolvedCount),
        overdueReceivablesMinor:number(receivables?.overdueMinor),
        outstandingReceivablesMinor:number(receivables?.outstandingMinor),
        overduePayablesMinor:number(payables?.overdueMinor),
        payablesDue14dMinor:number(payables?.due14dMinor),
        payableCoverage14dRatio:optionalNumber(commitmentStress?.coverageRatio),
        payableShortfall14dMinor:number(commitmentStress?.shortfallMinor),
        accountingProfitAvailable:false,
        qualification:"Cash analytics are derived from canonical finance records; cash movement and margin proxies are not accounting profit."
      }),
      sales:frozen({
        available:context?.sales?.restricted!==true,
        openQuotationCount:number(sales?.openQuotationCount),
        openQuotationValueBwp:number(sales?.openQuotationValueBwp),
        dormantQuotationCount:number(sales?.dormantQuotationCount),
        dormantQuotationValueBwp:number(sales?.dormantQuotationValueBwp),
        basis:"owner_recorded_sales_pipeline"
      }),
      operations:frozen({
        available:operationsAvailable,
        latestSummaryDate:operations?.latestSummaryDate||null,
        latestCoverage:optionalNumber(operations?.latestCoverage),
        pendingWorkflowCount:number(operations?.pendingWorkflowCount),
        failedWorkflowCount:number(operations?.failedWorkflowCount),
        openPerformanceSignals:number(operations?.openPerformanceSignals),
        criticalPerformanceSignals:number(operations?.criticalPerformanceSignals)
      }),
      compliance:frozen({
        available:true,
        overdueCount:number(compliance?.overdueCount),
        dueWithin14Days:number(compliance?.dueWithin14Days),
        nextDueAt:compliance?.nextDueAt||null
      }),
      property:frozen({
        underwritingToolAvailable:true,
        portfolioAnalyticsAvailable:propertyAvailable,
        professionalValuationWorkflowAvailable:propertyAvailable,
        assetCount:number(property?.assetCount),
        valuedAssetCount:number(property?.valuedAssetCount),
        unvaluedAssetCount:number(property?.unvaluedAssetCount),
        staleProfessionalValuationCount:number(property?.staleProfessionalValuationCount),
        professionalValuationRenewalDueCount:number(property?.professionalValuationRenewalDueCount),
        professionalValuationRenewalDueSoonCount:number(property?.professionalValuationRenewalDueSoonCount),
        valuationReportEvidenceGapCount:number(property?.valuationReportEvidenceGapCount),
        acquisitionCostMinor:number(property?.acquisitionCostMinor),
        annualRentMinor:number(property?.annualRentMinor),
        annualOperatingCostMinor:number(property?.annualOperatingCostMinor),
        netOperatingIncomeProxyMinor:number(property?.netOperatingIncomeProxyMinor),
        debtBalanceMinor:number(property?.debtBalanceMinor),
        recordedProfessionalValueMinor:number(property?.recordedProfessionalValueMinor),
        valuationCoveragePct:optionalNumber(property?.valuationCoveragePct),
        debtToRecordedProfessionalValueRatio:optionalNumber(property?.debtToRecordedProfessionalValueRatio),
        authoritativeValueBasis:"recorded_external_professional_reports_only",
        thebeMarketValuation:false,
        reason:propertyAvailable
          ?"Portfolio analytics use the canonical property register. Market values are included only from recorded external professional valuation reports."
          :"Property underwriting remains available, but canonical portfolio records are not yet readable."
      })
    }),
    changes:frozen({
      inflowChangePct:optionalNumber(trend?.inflowChangePct),
      outflowChangePct:optionalNumber(trend?.outflowChangePct),
      inflowChangePercentagePoints:ratioPct(trend?.inflowChangePct),
      outflowChangePercentagePoints:ratioPct(trend?.outflowChangePct),
      comparisonWindow:"latest_30_days_vs_previous_30_days"
    }),
    signals:frozen(signals),
    dataQuality:frozen({
      readiness,
      financeReconciliationCurrent:reconciliationCurrent,
      moneyIntelligenceAvailable:moneyAvailable,
      operationsSummaryAvailable:operationsAvailable,
      ownerEnteredSalesPresent:Number(sales?.openQuotationCount||0)+Number(sales?.dormantQuotationCount||0)>0,
      rule:"Analytics must expose missing or stale source evidence rather than fill gaps with AI-generated facts."
    }),
    authority:frozen({
      readOnly:true,
      executionAllowed:false,
      formalForecast:false,
      accountingProfitClaim:false,
      propertyMarketValuation:false,
      registeredValuerSignOffRequiredForProfessionalValuation:true
    }),
    provenance:frozen({
      authoritative:frozen([
        "finance_accounts","finance_transactions","finance_reconciliation_runs","finance_invoices","finance_invoice_allocations",
        "finance_payables","finance_payable_allocations","property_assets","property_professional_valuations","property_valuation_evidence_links","property_operating_snapshots","daily_operations_summaries","performance_insights","compliance_obligations"
      ]),
      ownerEntered:frozen(["app_state.active_company.salesIntelligence","business_memory_items"]),
      rule:"Authoritative records, derived analytics and owner-entered assumptions remain visibly separated."
    })
  });
}

export const __businessAnalyticsTest=frozen({dataReadiness});
