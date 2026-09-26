import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {__financePayablesTest as payablesTest} from "../cloudflare/src/finance-payables.js";
import {__moneyIntelligenceTest as money} from "../cloudflare/src/money-intelligence.js";

for(const path of [
  "cloudflare/src/finance-payables.js",
  "cloudflare/src/finance-core.js",
  "cloudflare/src/finance-receivables.js",
  "cloudflare/src/money-intelligence.js",
  "cloudflare/src/business-context.js",
  "cloudflare/src/agentic-entry.js",
  "public/js/owner-command-centre.js",
  "cloudflare/src/production-entry.js"
]){
  execFileSync(process.execPath,["--check",path],{stdio:"pipe"});
}

assert.equal(payablesTest.normalizeSupplierIdentity("  ABC (Pty) Ltd.  "),"abc pty ltd");
assert.equal(payablesTest.normalizeExpenseCategory("materials"),"materials");
assert.equal(payablesTest.normalizeExpenseCategory("mystery"),null);
assert.deepEqual(payablesTest.payableAllocationPath("/api/finance/payables/p1/allocations"),{payableId:"p1"});
assert.deepEqual(payablesTest.payableAllocationReversePath("/api/finance/payables/p1/allocations/a1/reverse"),{payableId:"p1",allocationId:"a1"});
assert.deepEqual(payablesTest.payableVoidPath("/api/finance/payables/p1/void"),{payableId:"p1"});
assert.deepEqual(payablesTest.supplierAliasesPath("/api/finance/suppliers/s1/aliases"),{supplierId:"s1"});

const collection=money.collectionBehavior([
  {customer_id:"c1",customer_name:"Customer A",outstanding_minor:120000,overdue_minor:120000,earliest_due_on:"2026-08-01",historical_paid_count:4,historical_on_time_count:1},
  {customer_id:"c2",customer_name:"Customer B",outstanding_minor:80000,overdue_minor:0,earliest_due_on:"2026-10-01",historical_paid_count:1,historical_on_time_count:1}
],"2026-09-26");
assert.equal(collection[0].attention,"higher_attention");
assert.equal(collection[0].predictiveProbability,false);
assert.match(collection[0].qualification,/not a probability of future payment/i);
assert.equal(collection[1].attention,"insufficient_history");

const calendar=money.forwardCashCalendar({
  businessDate:"2026-09-26",
  cashPositionMinor:500000,
  payables:{
    outstandingPayableCount:2,
    overdueMinor:100000,
    due7dMinor:0,
    due14dMinor:200000,
    due30dMinor:200000,
    payables:[
      {id:"p1",supplierName:"Supplier A",payableNumber:"A-1",dueOn:"2026-09-20",outstandingMinor:100000},
      {id:"p2",supplierName:"Supplier B",payableNumber:"B-1",dueOn:"2026-10-05",outstandingMinor:200000}
    ]
  },
  receivables:{
    outstandingInvoiceCount:2,
    overdueMinor:70000,
    due7dMinor:0,
    due14dMinor:30000,
    due30dMinor:30000,
    invoices:[
      {id:"i1",customerId:"c1",customerName:"Customer A",invoiceNumber:"INV-1",dueOn:"2026-09-20",outstandingMinor:70000},
      {id:"i2",customerId:"c2",customerName:"Customer B",invoiceNumber:"INV-2",dueOn:"2026-10-05",outstandingMinor:30000}
    ]
  },
  collectionBehaviors:collection
});
assert.equal(calendar.formalForecast,false);
assert.equal(calendar.receivablesAssumedCollected,false);
assert.equal(calendar.next14.committedOutflowMinor,300000);
assert.equal(calendar.next14.overdueOutflowMinor,100000);
assert.equal(calendar.next14.upcomingOutflowMinor,200000);
assert.equal(calendar.next14.potentialReceivableMinor,100000);
assert.equal(calendar.next14.overdueReceivableMinor,70000);
assert.equal(calendar.next14.upcomingReceivableMinor,30000);
assert.equal(calendar.events.find(x=>x.reference==="A-1").date,"2026-09-26");
assert.equal(calendar.events.find(x=>x.reference==="INV-1").includedInCommittedCash,false);
assert.equal(calendar.lowestCommittedCashMinor,200000);

const learning=money.expenseCategoryLearning([
  {supplier_id:"s1",supplier_name:"Supplier A",expense_category:"materials",transaction_count:3,total_outflow_minor:300000},
  {supplier_id:"s2",supplier_name:"Supplier B",expense_category:"transport",transaction_count:2,total_outflow_minor:100000}
],500000);
assert.equal(learning.accountingClassification,false);
assert.equal(learning.suppliers[0].matchAuthority,"owner_confirmed_supplier_alias_exact_match");
assert.equal(learning.categories[0].expenseCategory,"materials");
assert.equal(learning.categories[0].shareOfCurrent30Outflow,0.6);

const migration=fs.readFileSync("cloudflare/migrations/058_v161_finance_suppliers_payables.sql","utf8");
assert.match(migration,/CREATE TABLE IF NOT EXISTS finance_suppliers/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS finance_supplier_aliases/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS finance_payables/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS finance_payable_allocations/);
assert.match(migration,/UNIQUE\(tenant_id,supplier_id,payable_number\)/);
assert.doesNotMatch(migration,/UNIQUE\(tenant_id,payable_number\)/);
assert.match(migration,/finance_supplier_name_alias_collision_guard/);
assert.match(migration,/finance_supplier_alias_canonical_collision_guard/);
assert.match(migration,/finance_payable_overallocation/);
assert.match(migration,/finance_transaction_overallocation/);
assert.match(migration,/finance_payable_allocation_immutable/);

const payablesSource=fs.readFileSync("cloudflare/src/finance-payables.js","utf8");
assert.match(payablesSource,/roleAllowed\(auth,"owner"\).*owner_required/s);
assert.match(payablesSource,/finance_supplier_alias_canonical_collision/);
assert.match(payablesSource,/sourceKind:"owner_confirmed"/);
assert.match(payablesSource,/idempotency_key_conflict/);
assert.match(payablesSource,/finance_payable_has_active_allocations/);
assert.doesNotMatch(payablesSource,/payment\.execute|bank_transfer|providerWriteBack:true/);

const financeCore=fs.readFileSync("cloudflare/src/finance-core.js","utf8");
assert.match(financeCore,/handleFinancePayablesRequest\(\{request,url,env,auth,json,readJson,id,appendLineage,writeAudit,sha256Hex,roleAllowed\}\)/);

const moneySource=fs.readFileSync("cloudflare/src/money-intelligence.js","utf8");
assert.match(moneySource,/WITH matched AS \(/);
assert.match(moneySource,/SELECT DISTINCT t\.id transaction_id,t\.amount_minor,a\.supplier_id/);
assert.match(moneySource,/receivablesAssumedCollected:false/);
assert.match(moneySource,/predictiveProbability:false/);
assert.match(moneySource,/accountingPosting:false/);
assert.match(moneySource,/supplierPayments:false/);
assert.match(moneySource,/Recorded overdue supplier payables plus payables due within 14 days/);
assert.doesNotMatch(moneySource,/executionAllowed:true/);

const owner=fs.readFileSync("public/js/owner-command-centre.js","utf8");
assert.match(owner,/Recorded overdue supplier payables plus payables due within 14 days/);
assert.match(owner,/Potential inflow only/);
assert.match(owner,/historical behavior, not a probability of future payment/);
assert.match(owner,/Management signal only/);

const agenticEntry=fs.readFileSync("cloudflare/src/agentic-entry.js","utf8");
assert.match(agenticEntry,/058_v161_finance_suppliers_payables\.sql/);
const profile=JSON.parse(fs.readFileSync("RELEASE_PROFILE.json","utf8"));
assert.equal(profile.finance_suppliers_payables_v161,true);
assert.equal(profile.money_intelligence_v3,true);
assert.equal(profile.v161_supplier_alias_confirmation_owner_only,true);
assert.equal(profile.v161_payable_number_scope,"tenant_supplier");
assert.equal(profile.v161_cash_horizons_include_overdue,true);
assert.equal(profile.v161_supplier_alias_match_deduplicated_per_transaction,true);
assert.equal(profile.money_intelligence_collection_behavior_not_probability,true);
assert.equal(profile.money_intelligence_expense_learning_accounting_posting,false);
assert.equal(profile.supplier_payments_execution_authority,false);
assert.equal(profile.v161_execution_authority_expanded,false);

console.log("v161 supplier payables + Money Intelligence v3 adversarial checks passed");
