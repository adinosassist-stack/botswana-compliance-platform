import assert from "node:assert/strict";
import fs from "node:fs";
import {__financeTest} from "../cloudflare/src/finance-core.js";

assert.equal(__financeTest.validDate("2026-09-13"),true);
assert.equal(__financeTest.validDate("2026-02-30"),false);
assert.deepEqual(__financeTest.normalizeFinanceRow({postedOn:"2026-09-13",description:"Customer receipt",amountMinor:125050},0),{ok:true,row:{postedOn:"2026-09-13",description:"Customer receipt",reference:"",amountMinor:125050,sourceId:""}});
assert.deepEqual(__financeTest.normalizeFinanceRow({postedOn:"2026-09-13",description:"Provider receipt",amountMinor:2000,externalId:"txn-123"},0).row.sourceId,"txn-123");
assert.equal(__financeTest.normalizeFinanceRow({postedOn:"2026-09-13",description:"",amountMinor:10},2).error,"description_required");
assert.equal(__financeTest.normalizeFinanceRow({postedOn:"2026-09-13",description:"Invalid float",amountMinor:10.5},3).error,"invalid_amount_minor");
assert.equal(__financeTest.ACCOUNT_TYPES.has("bank"),true);
assert.equal(__financeTest.SOURCE_TYPES.has("adapter"),true);
assert.equal(__financeTest.MAX_IMPORT_ROWS,1000);
const base={tenantId:"t1",accountId:"a1",sourceType:"csv",provider:null,idempotencyKey:"batch-1",row:{postedOn:"2026-09-13",description:"Same merchant",reference:"",amountMinor:-5000,sourceId:""}};
assert.notDeepEqual(__financeTest.sourceFingerprintBasis({...base,index:0}),__financeTest.sourceFingerprintBasis({...base,index:1}));
const sourced={...base,sourceType:"adapter",provider:"bank-x",row:{...base.row,sourceId:"provider-42"}};
assert.deepEqual(__financeTest.sourceFingerprintBasis({...sourced,index:0}),__financeTest.sourceFingerprintBasis({...sourced,index:99}));
const migration=fs.readFileSync("cloudflare/migrations/044_v79_finance_reconciliation.sql","utf8");
for(const table of ["finance_accounts","finance_import_batches","finance_transactions","finance_reconciliation_runs","finance_lineage"])assert.match(migration,new RegExp("CREATE TABLE IF NOT EXISTS "+table));
assert.match(migration,/amount_minor INTEGER NOT NULL CHECK\(amount_minor<>0\)/);
assert.match(migration,/currency TEXT NOT NULL DEFAULT 'BWP' CHECK\(currency='BWP'\)/);
assert.match(migration,/UNIQUE\(tenant_id,idempotency_key\)/);
assert.match(migration,/UNIQUE\(tenant_id,sequence\)/);
const finance=fs.readFileSync("cloudflare/src/finance-core.js","utf8");
assert.match(finance,/env\.DB\.batch\(/);
assert.match(finance,/FROM json_each\(\?\)/);
assert.match(finance,/sourceFingerprintBasis/);
assert.match(finance,/prepareFinanceReconciliationSnapshot/);
assert.match(finance,/finance-reconciliation:\$\{prepared\.accountId\}:\$\{prepared\.statementFrom\}:\$\{prepared\.statementTo\}:\$\{prepared\.snapshotHash\}/);
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
assert.match(worker,/handleFinanceRequest/);
assert.match(worker,/const APP_RELEASE="v78\.1\.21\.101";/);
assert.match(worker,/const EXPECTED_SCHEMA_DELTA="046_v80_agentic_outcomes\.sql";/);
assert.match(worker,/SELECT 1 ok FROM finance_lineage/);
assert.match(worker,/SELECT id FROM agentic_runs LIMIT 1/);
assert.match(worker,/SELECT id FROM agentic_outcomes LIMIT 1/);
const profile=JSON.parse(fs.readFileSync("RELEASE_PROFILE.json","utf8"));
assert.ok(Number(String(profile.latest_cloudflare_migration||"").slice(0,3))>=49);
assert.equal(fs.existsSync("cloudflare/migrations/049_v108_finance_receivables.sql"),true);
assert.equal(profile.finance_reconciliation_v79,true);
assert.equal(profile.finance_provider_neutral,true);
assert.equal(profile.finance_whatsapp_exception_alerts_optional,true);
assert.equal(profile.agentic_foundation_v80,true);
assert.equal(profile.agentic_execution_enabled,false);
assert.equal(profile.agentic_stage2_execution_enabled,false);
assert.equal(profile.authenticated_route_branches,254);
const launch=fs.readFileSync("docs/LAUNCH.md","utf8"),deploy=fs.readFileSync("cloudflare/deploy-free.sh","utf8"),cloudflareReadme=fs.readFileSync("cloudflare/README.md","utf8");
assert.match(launch,/Migration 044 remains the finance reconciliation prerequisite/);
assert.match(launch,/through `049_v108_finance_receivables\.sql`/);
assert.doesNotMatch(launch,/No new schema migration is required\./);
assert.match(deploy,/Current reviewed schema delta: 049_v108_finance_receivables\.sql/);
assert.match(cloudflareReadme,/`migrations\/049_v108_finance_receivables\.sql`/);
for(const path of [
  "tests/v78-12167-session-generation-revocation-adversarial.mjs",
  "tests/v78-12157-authorization-reporting-concurrency-adversarial.mjs",
  "tests/v78-12153-payment-webhook-scheduled-restore-hardening-adversarial.mjs",
  "tests/v78-12154-idempotency-cross-layer-recovery-adversarial.mjs",
  "tests/v78-12152-tenant-lifecycle-purge-performance-adversarial.mjs"
]) assert.match(fs.readFileSync(path,"utf8"),/044_v79_finance_reconciliation\.sql/);
const delegated=fs.readFileSync("public/js/event-delegation.js","utf8"),routeGate=fs.readFileSync("tests/v78-12148-feature-security-csp-route-hardening-adversarial.mjs","utf8");
assert.match(delegated,/'testWhatsAppConnection'/);
assert.match(routeGate,/pkg\.version==="1\.21\.101"\?254/);
const owner=fs.readFileSync("public/js/owner-command-centre.js","utf8");
assert.match(owner,/\/api\/finance\/summary/);
assert.match(owner,/Canonical finance ledger/);
console.log("v79 finance reconciliation integrity tests passed with current agentic release successor");
