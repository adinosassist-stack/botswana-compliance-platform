import assert from "node:assert/strict";
import fs from "node:fs";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {AGENT_ACTION_CATALOG,AGENT_ACTION_LEVELS} from "../cloudflare/src/agent-policy.js";
import {
  financeDailyCollections,
  financeReceivablesSummary,
  __financeReceivablesTest
} from "../cloudflare/src/finance-receivables.js";

const migrationPath="cloudflare/migrations/049_v108_finance_receivables.sql";
const migration=fs.readFileSync(migrationPath,"utf8");
const runtime=fs.readFileSync("cloudflare/src/finance-receivables.js","utf8");
const core=fs.readFileSync("cloudflare/src/finance-core.js","utf8");
const entry=fs.readFileSync("cloudflare/src/agentic-entry.js","utf8");
const migrationScript=fs.readFileSync("scripts/migrate-production-v108-finance-receivables.mjs","utf8");
const migrationWorkflow=fs.readFileSync(".github/workflows/migrate-production-v108-finance-receivables.yml","utf8");

for(const path of [
  "cloudflare/src/finance-receivables.js",
  "cloudflare/src/finance-core.js",
  "cloudflare/src/agent-read-tools.js",
  "cloudflare/src/agentic-whatsapp-core.js",
  "cloudflare/src/whatsapp-inbound-core.js",
  "cloudflare/src/agentic-entry.js",
  "scripts/migrate-production-v108-finance-receivables.mjs"
]){
  execFileSync(process.execPath,["--check",path],{stdio:"pipe"});
}

for(const table of ["finance_customers","finance_invoices","finance_invoice_allocations"]){
  assert.match(migration,new RegExp("CREATE TABLE IF NOT EXISTS "+table+"\\b"));
}
assert.match(migration,/currency TEXT NOT NULL DEFAULT 'BWP' CHECK\(currency='BWP'\)/);
assert.match(migration,/finance_invoices_customer_tenant_guard/);
assert.match(migration,/finance_invoice_allocations_apply_guard/);
assert.match(migration,/finance_invoice_allocations_reverse_guard/);
assert.match(migration,/finance_invoice_overallocation/);
assert.match(migration,/finance_transaction_overallocation/);
assert.match(migration,/finance_allocation_immutable/);
assert.equal((migration.match(/SELECT \(CASE/g)||[]).length,6,'all trigger CASE expressions must use the D1-safe parenthesized form');
assert.doesNotMatch(migration,/SELECT CASE/,'unparenthesized CASE in D1 triggers is not allowed');
assert.match(migration,/UNIQUE\(tenant_id,reverses_allocation_id\)/);
assert.match(migration,/finance_transactions\(id\) ON DELETE RESTRICT/);

const blobSha=createHash("sha1")
  .update("blob "+Buffer.byteLength(migration)+"\0")
  .update(migration)
  .digest("hex");
assert.match(migrationScript,new RegExp("expectedGitBlobSha='"+blobSha+"'"));
assert.match(migrationScript,/time_travel\/bookmark/);
assert.match(migrationScript,/partial migration detected/);
assert.match(migrationScript,/exactKnownPrefix/);
assert.match(migrationScript,/assertKnownPrefixEmpty/);
assert.match(migrationScript,/resumeFromKnownPrefix\?8:0/);
assert.match(migrationScript,/resuming only the reviewed trigger suffix/);
assert.match(migrationScript,/PRAGMA foreign_key_check/);
assert.match(migrationWorkflow,/\[migrate-049\]/);
assert.match(migrationWorkflow,/scripts\/migrate-production-v108-finance-receivables\.mjs/);
assert.match(migrationWorkflow,/https:\/\/thebedesk\.com\/api\/ready/);

assert.match(core,/handleFinanceReceivablesRequest/);
assert.match(core,/financeReceivablesSummary/);
assert.match(runtime,/INVOICE_PAYMENT_ALLOCATED/);
assert.match(runtime,/INVOICE_PAYMENT_ALLOCATION_REVERSED/);
assert.match(runtime,/INVOICE_VOIDED/);
assert.match(runtime,/idempotency_key_required/);
assert.match(runtime,/amount_minor>0/);
assert.match(runtime,/tenant_id=\?/);
assert.doesNotMatch(runtime,/\bfetch\s*\(/);
assert.doesNotMatch(runtime,/customer_reminder|journal_entry|payment\.execute|money_movement/i);

const policy=AGENT_ACTION_CATALOG["receivables_summary.read"];
assert.ok(policy);
assert.equal(policy.level,AGENT_ACTION_LEVELS.READ);
assert.equal(policy.phase1Enabled,true);
assert.equal(policy.externalSideEffect,false);
assert.equal(policy.authoritativeSource,"finance_invoices_plus_transaction_allocations");
const releaseProfile=JSON.parse(fs.readFileSync("RELEASE_PROFILE.json","utf8"));
assert.ok(entry.includes(`const V81_SCHEMA_DELTA="${releaseProfile.latest_cloudflare_migration}"`),"agentic readiness tip must follow the authoritative release profile");
for(const table of ["finance_customers","finance_invoices","finance_invoice_allocations"]){
  assert.match(entry,new RegExp("\\(SELECT COUNT\\(\\*\\) FROM "+table+"\\)"));
}

const calls=[];
const DB={
  prepare(sql){
    const call={sql,bindings:[]};calls.push(call);
    return {
      bind(...bindings){
        call.bindings=bindings;
        return {
          async first(){
            if(sql.includes("positive_inflow_minor")){
              return {
                positive_inflow_minor:100000,
                positive_inflow_count:4,
                outflow_minor:25000,
                outflow_count:2,
                customer_collection_minor:65000,
                customer_collection_transaction_count:3
              };
            }
            if(sql.includes("outstanding_invoice_count")&&!sql.includes("GROUP BY customer_id")){
              return {
                outstanding_invoice_count:3,
                outstanding_minor:120000,
                overdue_invoice_count:1,
                overdue_minor:40000,
                customer_count:2,
                overdue_customer_count:1
              };
            }
            return {};
          },
          async all(){
            if(sql.includes("GROUP BY customer_id,customer_name")){
              return {results:[
                {customer_id:"c1",customer_name:"Alpha Trading",outstanding_invoice_count:2,outstanding_minor:80000,overdue_invoice_count:1,overdue_minor:40000,earliest_due_on:"2026-09-01"},
                {customer_id:"c2",customer_name:"Beta Works",outstanding_invoice_count:1,outstanding_minor:40000,overdue_invoice_count:0,overdue_minor:0,earliest_due_on:"2026-10-01"}
              ]};
            }
            if(sql.includes("FROM open_invoices ORDER BY overdue")){
              return {results:[
                {id:"i1",customer_id:"c1",customer_name:"Alpha Trading",invoice_number:"INV-001",issued_on:"2026-08-01",due_on:"2026-09-01",total_minor:100000,allocated_minor:60000,outstanding_minor:40000,overdue:1}
              ]};
            }
            return {results:[]};
          }
        };
      }
    };
  }
};

const collections=await financeDailyCollections({DB},"tenant-a",{businessDate:"2026-09-23"});
assert.equal(collections.customerCollectionClassificationAvailable,true);
assert.equal(collections.customerCollectionMinor,65000);
assert.equal(collections.unclassifiedPositiveInflowMinor,35000);
assert.match(collections.qualification,/explicitly allocated to issued invoices/i);

const receivables=await financeReceivablesSummary({DB},"tenant-a",{businessDate:"2026-09-23"});
assert.equal(receivables.outstandingMinor,120000);
assert.equal(receivables.overdueMinor,40000);
assert.equal(receivables.customers[0].customerName,"Alpha Trading");
assert.equal(receivables.invoices[0].overdue,true);
assert.equal(receivables.authority.canonical,true);
assert.equal(receivables.authority.estimated,false);
assert.equal(receivables.authority.transactionBackedCollections,true);

assert.equal(__financeReceivablesTest.invoiceAllocationPath("/api/finance/invoices/inv-1/allocations").invoiceId,"inv-1");
assert.equal(__financeReceivablesTest.invoiceAllocationReversePath("/api/finance/invoices/inv-1/allocations/a-1/reverse").allocationId,"a-1");
assert.equal(__financeReceivablesTest.invoiceVoidPath("/api/finance/invoices/inv-1/void").invoiceId,"inv-1");
assert.ok(calls.length>=4);
assert.ok(calls.every(call=>call.bindings.includes("tenant-a")),"all receivables reads must remain tenant scoped");

console.log("v108 finance receivables: schema, authority, migration and read-model adversarial checks PASS");
