import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {__moneyIntelligenceTest as money} from "../cloudflare/src/money-intelligence.js";
import {__v166Test as worker} from "../cloudflare/src/worker.js";

for(const path of [
  "cloudflare/src/money-intelligence.js",
  "cloudflare/src/worker.js",
  "cloudflare/src/business-context.js"
]){
  execFileSync(process.execPath,["--check",path],{stdio:"pipe"});
}

assert.equal(worker.extractSingleBwpAmountMinor("Can I spend P20,000 this week?"),2000000);
assert.equal(worker.extractSingleBwpAmountMinor("What happens if I buy equipment for P20k?"),2000000);
assert.equal(worker.extractSingleBwpAmountMinor("Can the business spend 20,000 pula?"),2000000);
assert.equal(worker.extractSingleBwpAmountMinor("What if it costs BWP 1,250.50?"),125050);
assert.equal(worker.extractSingleBwpAmountMinor("P20,000 now and P25,000 later"),null);
assert.equal(worker.extractSingleBwpAmountMinor("Can I spend 20000 this week?"),null);
assert.equal(worker.extractSingleBwpAmountMinor("Can I spend P20,000 if the quote is also P20,000?"),2000000);

const envelope={
  ready:true,state:"available",horizonDays:7,
  recordedCashPositionMinor:10000000,
  discretionaryEnvelopeMinor:4000000,
  missingInputs:[],blockingEvidence:[],
  warnings:["Planning envelope only"]
};
const within=money.simulateWeeklySpendDecision({spendEnvelope:envelope,proposedSpendMinor:2000000,label:"Equipment"});
assert.equal(within.ready,true);
assert.equal(within.state,"within_envelope");
assert.equal(within.proposedSpendMinor,2000000);
assert.equal(within.weeklyEnvelopeMinor,4000000);
assert.equal(within.withinEnvelope,true);
assert.equal(within.remainingEnvelopeMinor,2000000);
assert.equal(within.exceedsEnvelopeByMinor,0);
assert.equal(within.recordedCashAfterSpendMinor,8000000);
assert.equal(within.protectedReservesPreserved,true);
assert.equal(within.executionPerformed,false);
assert.equal(within.paymentInitiated,false);
assert.equal(within.spendingAuthorization,false);
assert.equal(within.financialAdvice,false);
assert.equal(within.formalForecast,false);
assert.equal(within.receivablesAssumedCollected,false);

const above=money.simulateWeeklySpendDecision({spendEnvelope:envelope,proposedSpendMinor:5000000});
assert.equal(above.ready,true);
assert.equal(above.state,"above_envelope");
assert.equal(above.withinEnvelope,false);
assert.equal(above.remainingEnvelopeMinor,0);
assert.equal(above.exceedsEnvelopeByMinor,1000000);
assert.equal(above.protectedReservesPreserved,false);
assert.equal(above.executionPerformed,false);

const blocked=money.simulateWeeklySpendDecision({
  spendEnvelope:{
    ready:false,state:"needs_finance_review",discretionaryEnvelopeMinor:null,
    missingInputs:[],blockingEvidence:["finance_reconciliation_stale"],
    warnings:["Thebe will not calculate a discretionary spend amount."]
  },
  proposedSpendMinor:2000000
});
assert.equal(blocked.ready,false);
assert.equal(blocked.state,"blocked");
assert.equal(blocked.withinEnvelope,null);
assert.equal(blocked.remainingEnvelopeMinor,null);
assert.deepEqual(blocked.blockingEvidence,["finance_reconciliation_stale"]);
assert.equal(blocked.executionPerformed,false);
assert.equal(blocked.spendingAuthorization,false);

const invalid=money.simulateWeeklySpendDecision({spendEnvelope:envelope,proposedSpendMinor:-100});
assert.equal(invalid.ready,false);
assert.equal(invalid.state,"invalid_amount");
assert.equal(invalid.proposedSpendMinor,null);

const workerSource=fs.readFileSync("cloudflare/src/worker.js","utf8");
assert.match(workerSource,/proposedSpendScenario/);
assert.match(workerSource,/extractSingleBwpAmountMinor/);
assert.match(workerSource,/use its deterministic arithmetic for that exact BWP amount/);
assert.match(workerSource,/if it is blocked, explain the blockers and do not invent a result/);
assert.match(workerSource,/roleAllowed\(a,"owner","manager"\)\?extractSingleBwpAmountMinor/);
assert.doesNotMatch(workerSource,/spendingAuthorization\s*:\s*true/);

const moneySource=fs.readFileSync("cloudflare/src/money-intelligence.js","utf8");
assert.match(moneySource,/MONEY_INTELLIGENCE_VERSION="2026-09-26\.v6"/);
assert.match(moneySource,/export function simulateWeeklySpendDecision/);
assert.match(moneySource,/comparison_to_fail_closed_weekly_discretionary_planning_envelope/);
assert.doesNotMatch(moneySource,/paymentInitiated:true/);
assert.doesNotMatch(moneySource,/executionPerformed:true/);
assert.doesNotMatch(moneySource,/spendingAuthorization:true/);

console.log("v166 deterministic spend what-if simulator checks passed");
