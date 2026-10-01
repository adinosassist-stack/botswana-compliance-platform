import assert from "node:assert/strict";
import fs from "node:fs";
import {__businessGoalDurableLoopTest} from "../cloudflare/src/business-goal-durable-loop.js";

const {summarizeBusinessGoalSnapshot}=__businessGoalDurableLoopTest;

const cash=summarizeBusinessGoalSnapshot("protect_cash",{
  "financial_position.read":{cashPositionMinor:125000,reconciliationExceptionCount:0,receivablesOverdueMinor:45000},
  "finance_data_quality.read":{failedImportBatchCount:0,missingSourceFingerprintCount:0,reconciliationExceptionCount:0},
  "receivables_summary.read":{outstandingMinor:90000,overdueMinor:45000,outstandingInvoiceCount:3,overdueInvoiceCount:1}
});
assert.equal(cash.code,"overdue_receivables");
assert.equal(cash.tone,"risk");
assert.equal(cash.metrics.cashPositionMinor,125000);
assert.equal(cash.metrics.overdueMinor,45000);

const compliance=summarizeBusinessGoalSnapshot("stay_compliant",{
  "compliance_status.read":{openObligationCount:4,overdueObligationCount:0,dueWithin14Days:2,nextDueAt:"2026-10-10T00:00:00Z"}
});
assert.equal(compliance.code,"compliance_due_soon");
assert.equal(compliance.tone,"neutral");
assert.equal(compliance.metrics.dueWithin14Days,2);

const operations=summarizeBusinessGoalSnapshot("watch_operations",{
  "daily_operations_summary.read":{available:false,summaryDate:null,metrics:{}}
});
assert.equal(operations.code,"operations_not_reported");
assert.equal(operations.metrics.available,false);

const runner=fs.readFileSync("cloudflare/src/business-goal-durable-loop.js","utf8");
const ui=fs.readFileSync("public/js/owner-command-centre.js","utf8");
assert.match(runner,/baselineEstablished=!previous/,"first verified run must be marked as a baseline rather than a no-change conclusion");
assert.match(runner,/signal:summarizeBusinessGoalSnapshot|const signal=summarizeBusinessGoalSnapshot/,
  "durable checkpoints must persist a bounded owner-facing signal");
assert.match(runner,/signalCode:signal\.code,signalTone:signal\.tone/,
  "audit event metadata must identify the deterministic outcome without copying raw source records");
assert.match(runner,/executionAllowed:false,externalActions:0/,
  "goal outcomes must not add execution or external-action authority");
assert.doesNotMatch(runner,/customerName|invoiceNumber/,
  "persistent goal outcome summaries must not persist customer or invoice identifiers");

assert.match(ui,/function businessGoalOutcome\(task\)/,"Goals & Ideas must render durable checkpoint outcomes");
assert.match(ui,/outcome\.state/,"goal cards must expose queued, baseline, changed, steady or paused state");
assert.match(ui,/Last · .*Next ·/s,"goal cards must expose compact last/next schedule state");
assert.doesNotMatch(ui,/Thebe remains observe-and-recommend only\."\)/,
  "per-card repeated authority copy should be removed in favor of a single global boundary");

console.log("PASS: V241 exposes compact deterministic goal outcomes without raw-record leakage or new authority.");
