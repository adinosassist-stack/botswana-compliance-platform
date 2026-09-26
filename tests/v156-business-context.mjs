import assert from "node:assert/strict";
import fs from "node:fs";
import {__businessContextTest} from "../cloudflare/src/business-context.js";

const context={
  observedAt:"2026-09-26T06:00:00.000Z",
  businessDate:"2026-09-26",
  finance:{
    cashPositionMinor:7240000,
    reconciliation:{unresolvedCount:2,unresolvedExposureMinor:185000,stale:true},
    receivables:{outstandingMinor:3850000,overdueMinor:2750000,overdueInvoiceCount:3,overdueCustomerCount:2},
    today:{positiveInflowMinor:950000,customerCollectionMinor:700000}
  },
  compliance:{overdueCount:1,dueWithin14Days:2},
  operations:{pendingWorkflowCount:4,failedWorkflowCount:1,criticalPerformanceSignals:1},
  sales:{dormantQuotationCount:3,dormantQuotationValueBwp:27000},
  provenance:{authoritative:["finance_transactions"],ownerEntered:["app_state.active_company.profile"],rule:"facts stay separate from assumptions"}
};
const priorities=__businessContextTest.deriveBusinessPriorities(context);
assert.equal(priorities[0].key,"reconciliation_exception");
assert.equal(priorities[0].executionAllowed,false);
assert.equal(priorities[0].humanReviewRequired,true);
assert.ok(priorities.some(item=>item.key==="overdue_receivables"));
assert.ok(priorities.some(item=>item.key==="overdue_compliance"));
assert.ok(priorities.some(item=>item.key==="failed_workflows"));
assert.ok(priorities.some(item=>item.key==="dormant_quotations"));

const brief=__businessContextTest.buildDailyBusinessBrief(context);
assert.equal(brief.metrics.cashPositionMinor,7240000);
assert.equal(brief.metrics.receivablesOverdueMinor,2750000);
assert.equal(brief.authority.executionAllowed,false);
assert.equal(brief.authority.runtimeGuardBypassed,false);
assert.equal(brief.authority.assumptionsRemainNonAuthoritative,true);
assert.match(__businessContextTest.businessBriefText(brief),/Read-only brief/);

const state={
  activeCompanyId:"c1",
  companies:[{
    id:"c1",
    profile:{
      companyName:"Test SME",
      industry:"services",
      decisionMonthlyRevenueTargetBwp:150000,
      decisionCurrentCashBwp:50000,
      decisionMinimumCashBufferBwp:25000
    },
    salesIntelligence:{
      settings:{dormantDays:10},
      opportunities:[
        {status:"open",quoteValueBwp:12000,quotedAt:"2026-08-01",lastContactAt:"2026-09-01"},
        {status:"won",quoteValueBwp:8000,quotedAt:"2026-09-20",lastContactAt:"2026-09-20"}
      ]
    }
  }]
};
const memory=__businessContextTest.ownerEnteredMemory(state,"Test Tenant");
assert.equal(memory.authoritative,false);
assert.equal(memory.assumptions.monthlyRevenueTargetBwp,150000);
const sales=__businessContextTest.salesMemory(state,{businessDate:"2026-09-26"});
assert.equal(sales.openQuotationCount,1);
assert.equal(sales.dormantQuotationCount,1);
assert.equal(sales.dormantQuotationValueBwp,12000);

const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const agentic=fs.readFileSync("cloudflare/src/agentic-core.js","utf8");
const whatsapp=fs.readFileSync("cloudflare/src/agentic-whatsapp-core.js","utf8");
const voice=fs.readFileSync("cloudflare/src/agentic-live-voice.js","utf8");
const owner=fs.readFileSync("public/js/owner-command-centre.js","utf8");
const source=fs.readFileSync("cloudflare/src/business-context.js","utf8");

assert.match(worker,/handleBusinessContextRequest/);
assert.match(worker,/buildBusinessContext\(env,tenantId,\{actorRole\}\)/);
assert.match(worker,/type:"business_context",label:"Unified Thebe Business Context"/);
assert.match(agentic,/buildBusinessContext\(env,tenantId,\{actorRole\}\)/);
assert.match(agentic,/channelParity:"web_voice_whatsapp"/);
assert.match(whatsapp,/businessBriefText\(snapshot\.brief\)/);
assert.match(whatsapp,/receivablesOverdueMinor/);
assert.match(voice,/English, Setswana/);
assert.match(voice,/English-Setswana code-switching/);
assert.match(owner,/\/api\/business-context\/brief/);
assert.match(owner,/Unified Thebe Business Context/);
assert.match(source,/Authoritative records and owner-entered assumptions remain explicitly separated/);
assert.doesNotMatch(source,/payment\.execute|government_filing\.submit|employment\.terminate/);

console.log("v156 unified Business Context + Daily Brief checks passed");
