import assert from "node:assert/strict";
import fs from "node:fs";

const finance=fs.readFileSync("cloudflare/src/finance-core.js","utf8");
const agent=fs.readFileSync("cloudflare/src/agentic-finance-reconciliation.js","utf8");

const helperStart=finance.indexOf("export async function prepareFinanceReconciliationSnapshot");
const helperEnd=finance.indexOf("async function getFinanceConnection",helperStart);
assert.ok(helperStart>=0&&helperEnd>helperStart,"canonical reconciliation helper must exist");
const helper=finance.slice(helperStart,helperEnd);
assert.match(helper,/finance_accounts/);
assert.match(helper,/finance_transactions/);
assert.match(helper,/source_fingerprint/);
assert.match(helper,/snapshotHash/);
assert.match(helper,/mutationPerformed:false/);
assert.match(helper,/externalSideEffects:false/);
assert.doesNotMatch(helper,/INSERT INTO|UPDATE |DELETE FROM|enqueueTenantAlert|writeAudit/,"prepare helper must remain read-only");

const manualRoute=finance.slice(finance.indexOf('if(url.pathname==="/api/finance/reconciliations"&&request.method==="POST")'),finance.indexOf('if(url.pathname==="/api/finance/reconciliations"&&request.method==="GET")'));
assert.match(manualRoute,/prepareFinanceReconciliationSnapshot/,"manual reconciliation must reuse canonical preparation");
assert.match(manualRoute,/INSERT INTO finance_reconciliation_runs/,"human finance route must remain the canonical recorder");
assert.match(manualRoute,/FINANCE_RECONCILIATION_COMPLETED/);
assert.match(manualRoute,/finance_reconciliation_exception/);

assert.match(agent,/prepareFinanceReconciliationSnapshot/);
const calls=(agent.match(/prepareFinanceReconciliationSnapshot\(/g)||[]).length;
assert.equal(calls,2,"agent prepare must calculate then re-verify the canonical snapshot");
assert.match(agent,/verified\.snapshotHash!==first\.snapshotHash/);
assert.match(agent,/verified\.bookClosingMinor!==first\.bookClosingMinor/);
assert.match(agent,/verified\.differenceMinor!==first\.differenceMinor/);
assert.match(agent,/verified\.transactionCount!==first\.transactionCount/);
assert.match(agent,/finance_snapshot_changed_retry/);
assert.match(agent,/proposalBindingHash/);
assert.match(agent,/writesToFinanceCore:false/);
assert.match(agent,/externalSideEffects:false/);
assert.doesNotMatch(agent,/INSERT INTO finance_reconciliation_runs|enqueueTenantAlert|journal_entry|payment\.execute/,"agent prepare must not mutate canonical finance or trigger external actions");

console.log("v106 pass 2: finance reconciliation integrity adversarial PASS");
