import assert from "node:assert/strict";
import fs from "node:fs";
import {BUSINESS_ANALYTICS_VERSION,buildBusinessAnalytics} from "../cloudflare/src/business-analytics.js";

const context={
  observedAt:"2026-09-27T12:00:00.000Z",
  businessDate:"2026-09-27",
  market:{code:"BW",country:"Botswana",currency:"BWP"},
  finance:{
    cashPositionMinor:5000000,
    reconciliation:{unresolvedCount:0,unresolvedExposureMinor:0,stale:false},
    receivables:{outstandingMinor:2400000,overdueMinor:900000,overdueInvoiceCount:2},
    payables:{overdueMinor:300000,due14dMinor:1500000},
    today:{positiveInflowMinor:250000,customerCollectionMinor:180000}
  },
  moneyIntelligence:{
    available:true,
    trend:{
      current30:{inflow:10000000,outflow:11200000,net:-1200000},
      prior30:{inflow:9200000,outflow:9000000,net:200000},
      inflowChangePct:0.0869565,
      outflowChangePct:0.2444444
    },
    assumptions:{estimatedRunwayDays:42},
    scenario:{cashFlowMarginProxyPct:-0.12},
    commitmentStress:{coverageRatio:1.4,shortfallMinor:0}
  },
  sales:{openQuotationCount:7,openQuotationValueBwp:82000,dormantQuotationCount:2,dormantQuotationValueBwp:24000},
  operations:{latestSummaryDate:"2026-09-27",latestCoverage:0.82,pendingWorkflowCount:3,failedWorkflowCount:0,openPerformanceSignals:2,criticalPerformanceSignals:0},
  compliance:{overdueCount:1,dueWithin14Days:3,nextDueAt:"2026-10-01"}
};

const analytics=buildBusinessAnalytics(context);
assert.equal(BUSINESS_ANALYTICS_VERSION,"2026-09-27.v173");
assert.equal(analytics.domains.money.cashPositionMinor,5000000);
assert.equal(analytics.domains.money.current30NetCashMovementMinor,-1200000);
assert.equal(analytics.domains.money.accountingProfitAvailable,false);
assert.equal(analytics.domains.sales.openQuotationValueBwp,82000);
assert.equal(analytics.domains.operations.latestSummaryDate,"2026-09-27");
assert.equal(analytics.domains.compliance.overdueCount,1);
assert.equal(analytics.domains.property.portfolioAnalyticsAvailable,false);
assert.equal(analytics.domains.property.professionalValuationWorkflowAvailable,false);
assert.equal(analytics.authority.readOnly,true);
assert.equal(analytics.authority.executionAllowed,false);
assert.equal(analytics.authority.formalForecast,false);
assert.equal(analytics.authority.accountingProfitClaim,false);
assert.equal(analytics.authority.propertyMarketValuation,false);
assert.equal(analytics.authority.registeredValuerSignOffRequiredForProfessionalValuation,true);
assert.equal(analytics.dataQuality.readiness,"strong");
assert.ok(analytics.signals.some(x=>x.key==="negative_30d_cash_movement"));
assert.ok(analytics.signals.some(x=>x.key==="outflow_acceleration"));
assert.ok(analytics.signals.some(x=>x.key==="overdue_receivables"));
assert.ok(analytics.signals.some(x=>x.key==="overdue_compliance"));
assert.equal(analytics.changes.outflowChangePercentagePoints,24.4);

const stale=buildBusinessAnalytics({
  ...context,
  finance:{...context.finance,reconciliation:{unresolvedCount:2,unresolvedExposureMinor:100000,stale:true}}
});
assert.equal(stale.dataQuality.readiness,"partial");
assert.equal(stale.signals[0].severity,"high");
assert.ok(stale.signals.some(x=>x.key==="finance_reconciliation_exceptions"));

const noFinance=buildBusinessAnalytics({
  finance:{reconciliation:{unresolvedCount:0,stale:false},receivables:{},payables:{}},
  moneyIntelligence:{available:false},
  operations:{},
  compliance:{},
  sales:{}
});
assert.equal(noFinance.dataQuality.readiness,"limited");
assert.equal(noFinance.authority.executionAllowed,false);

const businessContext=fs.readFileSync("cloudflare/src/business-context.js","utf8");
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const owner=fs.readFileSync("public/js/owner-command-centre.js","utf8");
const analyticsSource=fs.readFileSync("cloudflare/src/business-analytics.js","utf8");

assert.match(businessContext,/buildBusinessAnalytics/);
assert.match(businessContext,/\/api\/business-context\/analytics/);
assert.match(businessContext,/analytics:context\.analytics/);
assert.match(worker,/analytics:businessPayload\.analytics\|\|null/);
assert.match(owner,/Analytics v1/);
assert.match(owner,/ownerAnalyticsPanel/);
assert.match(owner,/renderBusinessAnalytics/);
assert.match(analyticsSource,/cash movement, not accounting profit/i);
assert.match(analyticsSource,/registeredValuerSignOffRequiredForProfessionalValuation:true/);
assert.doesNotMatch(analyticsSource,/executionAllowed:true/);

console.log("v173 Business Analytics foundation: deterministic cross-domain analytics and authority boundaries passed");
