import assert from "node:assert/strict";
import fs from "node:fs";
import {buildBusinessAnalytics} from "../cloudflare/src/business-analytics.js";

const base={
  observedAt:"2026-09-28T06:00:00.000Z",
  businessDate:"2026-09-28",
  market:{code:"BW",country:"Botswana",currency:"BWP"},
  finance:{
    cashPositionMinor:1000000,
    reconciliation:{unresolvedCount:0,unresolvedExposureMinor:0,stale:false},
    receivables:{outstandingMinor:0,overdueMinor:0,overdueInvoiceCount:0},
    payables:{overdueMinor:0,due14dMinor:0}
  },
  moneyIntelligence:{
    available:true,
    trend:{current30:{inflow:1000000,outflow:800000,net:200000},prior30:{inflow:900000,outflow:750000,net:150000}},
    commitmentStress:{coverageRatio:null,shortfallMinor:0}
  },
  operations:{latestSummaryDate:"2026-09-28",failedWorkflowCount:0,criticalPerformanceSignals:0},
  sales:{openQuotationCount:0,dormantQuotationCount:0},
  property:{available:false}
};

const inactive=buildBusinessAnalytics({
  ...base,
  compliance:{
    overdueCount:0,
    dueWithin14Days:0,
    nextDueAt:null,
    publishedRuleCount:0,
    approvedUnpublishedRuleCount:2,
    ruleCoverageStatus:"inactive"
  }
});
assert.equal(inactive.domains.compliance.publishedRuleCount,0);
assert.equal(inactive.domains.compliance.approvedUnpublishedRuleCount,2);
assert.equal(inactive.domains.compliance.ruleCoverageStatus,"inactive");
assert.equal(inactive.domains.compliance.coverageActive,false);
assert.ok(inactive.signals.some(item=>item.key==="compliance_rule_coverage_inactive"&&item.severity==="high"));
assert.match(inactive.signals.find(item=>item.key==="compliance_rule_coverage_inactive").detail,/zero overdue count is not compliance assurance/i);
assert.ok(inactive.summary.highAttentionCount>=1);

const active=buildBusinessAnalytics({
  ...base,
  compliance:{
    overdueCount:0,
    dueWithin14Days:0,
    nextDueAt:null,
    publishedRuleCount:10,
    approvedUnpublishedRuleCount:0,
    ruleCoverageStatus:"active"
  }
});
assert.equal(active.domains.compliance.coverageActive,true);
assert.ok(!active.signals.some(item=>item.key==="compliance_rule_coverage_inactive"));
assert.ok(!active.signals.some(item=>item.key==="compliance_rule_coverage_unknown"));

const unknown=buildBusinessAnalytics({
  ...base,
  compliance:{
    overdueCount:0,
    dueWithin14Days:0,
    nextDueAt:null,
    publishedRuleCount:null,
    approvedUnpublishedRuleCount:null,
    ruleCoverageStatus:"unknown"
  }
});
assert.equal(unknown.domains.compliance.publishedRuleCount,null);
assert.equal(unknown.domains.compliance.ruleCoverageStatus,"unknown");
assert.ok(unknown.signals.some(item=>item.key==="compliance_rule_coverage_unknown"));

const businessContext=fs.readFileSync("cloudflare/src/business-context.js","utf8");
const analyticsSource=fs.readFileSync("cloudflare/src/business-analytics.js","utf8");
const owner=fs.readFileSync("public/js/owner-command-centre.js","utf8");
const packageJson=JSON.parse(fs.readFileSync("package.json","utf8"));

assert.match(businessContext,/status='published'/);
assert.match(businessContext,/approved_unpublished_rule_count/);
assert.match(businessContext,/ruleCoverageStatus/);
assert.match(businessContext,/zero overdue count is not compliance assurance/i);
assert.doesNotMatch(businessContext,/UPDATE\s+regulatory_rules\s+SET\s+status\s*=\s*['"]published['"]/i);
assert.match(analyticsSource,/compliance_rule_coverage_inactive/);
assert.match(owner,/Coverage inactive/);
assert.match(owner,/zero overdue count is not compliance assurance/i);
assert.ok(packageJson.scripts["test:release-regressions"].includes("node tests/v179-compliance-coverage-truth.mjs"));

console.log("V179_COMPLIANCE_COVERAGE_TRUTH_PASS");
