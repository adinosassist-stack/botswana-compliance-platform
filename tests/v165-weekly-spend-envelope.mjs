import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {__moneyIntelligenceTest as money} from "../cloudflare/src/money-intelligence.js";

for(const path of [
  "cloudflare/src/money-intelligence.js",
  "cloudflare/src/business-context.js",
  "cloudflare/src/worker.js",
  "public/js/owner-command-centre.js",
  "public/js/executive-personalization.js",
  "cloudflare/src/production-entry.js"
]){
  execFileSync(process.execPath,["--check",path],{stdio:"pipe"});
}

const canonicalCalendar={payablesAvailable:true,next7:{committedOutflowMinor:2000000}};
const ready=money.weeklySpendEnvelope({
  cashPositionMinor:10000000,
  cashCalendar:canonicalCalendar,
  assumptions:{
    monthlyLabourCostMinor:3000000,
    minimumCashBufferMinor:1000000,
    plannedPurchaseMinor:1500000
  },
  reconciliationStale:false
});
assert.equal(ready.ready,true);
assert.equal(ready.state,"available");
assert.deepEqual(ready.blockingEvidence,[]);
assert.equal(ready.horizonDays,7);
assert.equal(ready.recordedCashPositionMinor,10000000);
assert.equal(ready.recordedSupplierPayablesDue7dMinor,2000000);
assert.equal(ready.payrollReserveMinor,3000000);
assert.equal(ready.minimumCashBufferMinor,1000000);
assert.equal(ready.protectedBeforeDiscretionaryMinor,6000000);
assert.equal(ready.discretionaryEnvelopeMinor,4000000);
assert.equal(ready.ownerPlannedPurchaseMinor,1500000);
assert.equal(ready.discretionaryAfterPlannedPurchaseMinor,2500000);
assert.equal(ready.receivablesAssumedCollected,false);
assert.equal(ready.fullMonthlyPayrollReserved,true);
assert.equal(ready.unknownFutureObligationsReserved,false);
assert.equal(ready.payablesAvailable,true);
assert.equal(ready.formalForecast,false);
assert.equal(ready.spendingAuthorization,false);
assert.equal(ready.financialAdvice,false);

const explicitZeroLabour=money.assumptionMetrics({
  cashPositionMinor:5000000,
  memory:{assumptions:{monthlyLabourCostBwp:0,minimumCashBufferBwp:0}}
});
assert.equal(explicitZeroLabour.monthlyLabourCostMinor,0);
assert.equal(explicitZeroLabour.minimumCashBufferMinor,0);
const zeroLabourEnvelope=money.weeklySpendEnvelope({
  cashPositionMinor:5000000,
  cashCalendar:{payablesAvailable:true,next7:{committedOutflowMinor:1000000}},
  assumptions:explicitZeroLabour
});
assert.equal(zeroLabourEnvelope.ready,true);
assert.equal(zeroLabourEnvelope.discretionaryEnvelopeMinor,4000000);

const missing=money.weeklySpendEnvelope({
  cashPositionMinor:10000000,
  cashCalendar:canonicalCalendar,
  assumptions:{}
});
assert.equal(missing.ready,false);
assert.equal(missing.state,"needs_owner_inputs");
assert.equal(missing.discretionaryEnvelopeMinor,null);
assert.deepEqual(missing.missingInputs,["monthly_labour_cost","minimum_cash_buffer"]);

const zero=money.weeklySpendEnvelope({
  cashPositionMinor:5000000,
  cashCalendar:canonicalCalendar,
  assumptions:{monthlyLabourCostMinor:2000000,minimumCashBufferMinor:1000000}
});
assert.equal(zero.ready,true);
assert.equal(zero.state,"none");
assert.equal(zero.discretionaryEnvelopeMinor,0);

const stale=money.weeklySpendEnvelope({
  cashPositionMinor:10000000,
  cashCalendar:{payablesAvailable:true,next7:{committedOutflowMinor:1000000}},
  assumptions:{monthlyLabourCostMinor:2000000,minimumCashBufferMinor:1000000},
  reconciliationStale:true
});
assert.equal(stale.ready,false);
assert.equal(stale.state,"needs_finance_review");
assert.equal(stale.discretionaryEnvelopeMinor,null);
assert.deepEqual(stale.blockingEvidence,["finance_reconciliation_stale"]);
assert.ok(stale.warnings.some(item=>/will not calculate/i.test(item)));

const unavailablePayables=money.weeklySpendEnvelope({
  cashPositionMinor:10000000,
  cashCalendar:{payablesAvailable:false,next7:{committedOutflowMinor:0}},
  assumptions:{monthlyLabourCostMinor:2000000,minimumCashBufferMinor:1000000},
  reconciliationStale:false
});
assert.equal(unavailablePayables.ready,false);
assert.equal(unavailablePayables.state,"needs_finance_review");
assert.equal(unavailablePayables.recordedSupplierPayablesDue7dMinor,null);
assert.equal(unavailablePayables.discretionaryEnvelopeMinor,null);
assert.deepEqual(unavailablePayables.blockingEvidence,["supplier_payables_unavailable"]);

const combined=money.weeklySpendEnvelope({
  cashPositionMinor:10000000,
  cashCalendar:{payablesAvailable:false,next7:{committedOutflowMinor:0}},
  assumptions:{},
  reconciliationStale:true
});
assert.equal(combined.ready,false);
assert.equal(combined.state,"needs_inputs_and_finance_review");
assert.deepEqual(combined.missingInputs,["monthly_labour_cost","minimum_cash_buffer"]);
assert.deepEqual(combined.blockingEvidence,["supplier_payables_unavailable","finance_reconciliation_stale"]);
assert.equal(combined.discretionaryEnvelopeMinor,null);

const calendar=money.forwardCashCalendar({
  businessDate:"2026-09-26",
  cashPositionMinor:10000000,
  payables:{available:true,outstandingPayableCount:1,overdueMinor:0,due7dMinor:500000,due14dMinor:500000,due30dMinor:500000,payables:[
    {outstandingMinor:500000,dueOn:"2026-09-28",supplierName:"Supplier A",payableNumber:"P-1"}
  ]},
  receivables:{available:true,outstandingInvoiceCount:0,overdueMinor:0,due7dMinor:0,due14dMinor:0,due30dMinor:0,invoices:[]}
});
assert.equal(calendar.payablesAvailable,true);
assert.equal(calendar.next7.committedOutflowMinor,500000);

const source=fs.readFileSync("cloudflare/src/money-intelligence.js","utf8");
assert.match(source,/MONEY_INTELLIGENCE_VERSION="2026-09-27\.v7"/,"V168 market profiling extends the fail-closed V165 envelope without weakening it");
assert.match(source,/weeklySpendEnvelope/);
assert.match(source,/blockingEvidence/);
assert.match(source,/payablesAvailable:payables\?\.available===true/);
assert.match(source,/fullMonthlyPayrollReserved:true/);
assert.match(source,/receivablesAssumedCollected:false/);
assert.match(source,/unknownFutureObligationsReserved:false/);
assert.match(source,/spendingAuthorization:false/);
assert.match(source,/financialAdvice:false/);
assert.match(source,/weekly_spend_envelope_zero/);
assert.doesNotMatch(source,/spendingAuthorization:true/);

const context=fs.readFileSync("cloudflare/src/business-context.js","utf8");
assert.match(context,/BUSINESS_CONTEXT_VERSION="2026-09-27\.v175"/);
assert.match(context,/reconciliationStale:finance\?\.reconciliation\?\.stale===true/);
assert.match(context,/weeklySpendEnvelopeMinor/);
assert.match(context,/weeklySpendBlockingEvidenceCount/);
assert.match(context,/7-day discretionary planning envelope/);
assert.match(context,/withheld until finance reconciliation and supplier-payables evidence are current/);

const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
assert.match(worker,/blockingEvidence:Array\.isArray/);
assert.match(worker,/payablesAvailable:/);
assert.match(worker,/reconciliationStale:/);
assert.match(worker,/conservative planning envelope/);
assert.match(worker,/never present it as spending authorization or financial advice/);

const owner=fs.readFileSync("public/js/owner-command-centre.js","utf8");
assert.match(owner,/const RELEASE="20260926-v165"/);
assert.match(owner,/label:"Spend this week"/);
assert.match(owner,/Finance review/);
assert.match(owner,/withholding the spend envelope/);
assert.match(owner,/needs both owner assumptions and current finance evidence/);
assert.match(owner,/not spending authorization/);

const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
assert.match(production,/OWNER_COMMAND_CENTRE_RELEASE="20260926-v165"/);
assert.match(production,/EXECUTIVE_PERSONALIZATION_RELEASE="20260926-v165"/);

const profile=JSON.parse(fs.readFileSync("RELEASE_PROFILE.json","utf8"));
assert.equal(profile.money_intelligence_v5,true);
assert.equal(profile.weekly_spend_envelope_v165,true);
assert.equal(profile.weekly_spend_envelope_horizon_days,7);
assert.deepEqual(profile.weekly_spend_envelope_required_owner_inputs,["monthly_labour_cost","minimum_cash_buffer"]);
assert.equal(profile.weekly_spend_envelope_full_monthly_payroll_reserved,true);
assert.equal(profile.weekly_spend_envelope_receivables_assumed_collected,false);
assert.equal(profile.weekly_spend_envelope_unknown_future_obligations_reserved,false);
assert.equal(profile.weekly_spend_envelope_stale_reconciliation_fail_closed,true);
assert.equal(profile.weekly_spend_envelope_payables_unavailable_fail_closed,true);
assert.equal(profile.weekly_spend_envelope_withholds_numeric_amount_on_evidence_failure,true);
assert.equal(profile.weekly_spend_envelope_spending_authorization,false);
assert.equal(profile.v165_execution_authority_expanded,false);

console.log("v165 conservative weekly spend envelope checks passed");
