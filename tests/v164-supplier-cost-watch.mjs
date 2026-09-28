import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {__moneyIntelligenceTest as money} from "../cloudflare/src/money-intelligence.js";

for(const path of [
  "cloudflare/src/money-intelligence.js",
  "cloudflare/src/business-context.js",
  "public/js/owner-command-centre.js",
  "public/js/executive-personalization.js",
  "cloudflare/src/production-entry.js"
]){
  execFileSync(process.execPath,["--check",path],{stdio:"pipe"});
}

const trends=money.supplierSpendTrend([
  {
    supplier_id:"s1",supplier_name:"Supplier A",expense_category:"materials",
    current_outflow_minor:600000,prior_outflow_minor:300000,current_count:3,prior_count:3
  },
  {
    supplier_id:"s2",supplier_name:"Supplier B",expense_category:"transport",
    current_outflow_minor:100000,prior_outflow_minor:200000,current_count:1,prior_count:3
  }
]);
assert.equal(trends[0].supplierName,"Supplier A");
assert.equal(trends[0].current30OutflowMinor,600000);
assert.equal(trends[0].prior30OutflowMinor,300000);
assert.equal(trends[0].changePct,1);
assert.equal(trends[0].absoluteChangeMinor,300000);
assert.equal(trends[0].attention,"increase");
assert.equal(trends[0].matchAuthority,"owner_confirmed_supplier_alias_exact_match");
assert.equal(trends[0].unitPriceInflationClaimed,false);
assert.match(trends[0].qualification,/volume, timing or price/i);
assert.equal(trends[1].attention,"sparse_history");

const concentration=money.payableSupplierConcentration({
  outstandingMinor:1000000,
  supplierCount:3,
  suppliers:[
    {supplierId:"s1",supplierName:"Supplier A",outstandingMinor:700000,overdueMinor:200000,outstandingPayableCount:2},
    {supplierId:"s2",supplierName:"Supplier B",outstandingMinor:200000,overdueMinor:0,outstandingPayableCount:1}
  ]
});
assert.equal(concentration.available,true);
assert.equal(concentration.topSupplier.shareOfOutstanding,0.7);
assert.equal(concentration.topSupplier.outstandingMinor,700000);
assert.equal(concentration.canonical,true);

const stress=money.cashCommitmentStress({
  cashPositionMinor:500000,
  cashCalendar:{next14:{committedOutflowMinor:700000}},
  minimumCashBufferMinor:100000
});
assert.equal(stress.coverageRatio,0.714);
assert.equal(stress.shortfallMinor,200000);
assert.equal(stress.cashAfterCommitted14dMinor,-200000);
assert.equal(stress.cashAfterCommittedVsOwnerBufferMinor,-300000);
assert.equal(stress.supplierPayablesOnly,true);
assert.equal(stress.excludesOtherFutureOutflows,true);
assert.equal(stress.receivablesAssumedCollected,false);
assert.equal(stress.formalForecast,false);

const source=fs.readFileSync("cloudflare/src/money-intelligence.js","utf8");
assert.match(source,/MONEY_INTELLIGENCE_VERSION="2026-09-27\.v7"/,"V168 market profiling preserves V164 supplier-watch semantics");
assert.match(source,/posted_on>=date\(\?,'-59 days'\)/);
assert.match(source,/SELECT DISTINCT t\.id transaction_id,t\.posted_on,ABS\(t\.amount_minor\) outflow_minor,a\.supplier_id/);
assert.match(source,/supplier_outflow_acceleration/);
assert.match(source,/supplier_payable_concentration/);
assert.match(source,/payable_cover_shortfall_14d/);
assert.match(source,/payable_cover_tight_14d/);
assert.match(source,/unitPriceInflationClaimed:false/);
assert.match(source,/supplierPayablesOnly:true/);
assert.doesNotMatch(source,/unitPriceInflationClaimed:true/);
assert.doesNotMatch(source,/executionAllowed:true/);

const context=fs.readFileSync("cloudflare/src/business-context.js","utf8");
assert.match(context,/BUSINESS_CONTEXT_VERSION="2026-09-27\.v175"/);
assert.match(context,/supplier_outflow_acceleration/);
assert.match(context,/supplier_payable_concentration/);
assert.match(context,/payable_cover_shortfall_14d/);
assert.match(context,/payableCoverage14dRatio/);

const owner=fs.readFileSync("public/js/owner-command-centre.js","utf8");
assert.match(owner,/const RELEASE="20260929-v173"/);
assert.match(owner,/Supplier cost watch/);
assert.match(owner,/Supplier payable concentration/);
assert.match(owner,/Payable cover:/);
assert.match(owner,/not a unit-price inflation claim/);

const personalization=fs.readFileSync("public/js/executive-personalization.js","utf8");
assert.match(personalization,/const RELEASE="20260929-v173"/);
const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
assert.match(production,/OWNER_COMMAND_CENTRE_RELEASE="20260929-v173"/);
assert.match(production,/EXECUTIVE_PERSONALIZATION_RELEASE="20260929-v173"/);

const profile=JSON.parse(fs.readFileSync("RELEASE_PROFILE.json","utf8"));
assert.equal(profile.money_intelligence_v4,true);
assert.equal(profile.money_intelligence_supplier_cost_watch,true);
assert.deepEqual(profile.money_intelligence_supplier_spend_comparison_windows_days,[30,30]);
assert.equal(profile.money_intelligence_supplier_match_authority,"owner_confirmed_alias_exact_match");
assert.equal(profile.money_intelligence_unit_price_inflation_claimed,false);
assert.equal(profile.money_intelligence_payable_cover_horizon_days,14);
assert.equal(profile.money_intelligence_payable_cover_excludes_other_future_outflows,true);
assert.equal(profile.money_intelligence_payable_cover_assumes_receivables_collected,false);
assert.equal(profile.v164_execution_authority_expanded,false);

console.log("v164 supplier cost watch safeguards preserved under V165 successor");
