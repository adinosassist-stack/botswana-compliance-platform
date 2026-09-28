import assert from "node:assert/strict";
import fs from "node:fs";
import {derivePortfolioMetrics,PROPERTY_PORTFOLIO_VERSION,__propertyPortfolioTest} from "../cloudflare/src/property-portfolio.js";

assert.equal(PROPERTY_PORTFOLIO_VERSION,"2026-09-27.v175");
assert.equal(__propertyPortfolioTest.addDaysIso("2026-09-27",365),"2027-09-27");
assert.equal(__propertyPortfolioTest.renewalStatus("2025-09-27","2026-09-27","2026-09-27"),"current");
assert.equal(__propertyPortfolioTest.renewalStatus("2025-09-26","2026-09-26","2026-09-27"),"due");
assert.equal(__propertyPortfolioTest.evidenceReady({
  evidence_id:"e1",evidence_review_status:"approved",evidence_scan_status:"clean",
  evidence_scanned_at:"2026-09-27T00:00:00Z",evidence_malware_name:null,evidence_deleted_at:null
}),true);
assert.equal(__propertyPortfolioTest.evidenceReady({
  evidence_id:"e1",evidence_review_status:"approved",evidence_scan_status:"pending",
  evidence_scanned_at:null,evidence_malware_name:null,evidence_deleted_at:null
}),false);

const metrics=derivePortfolioMetrics([
  {status:"active",acquisition_cost_minor:200000000,annual_rent_minor:18000000,annual_operating_cost_minor:3000000,debt_balance_minor:90000000,market_value_minor:260000000,valuation_date:"2025-08-01",review_due_date:"2026-08-01"},
  {status:"active",acquisition_cost_minor:80000000,annual_rent_minor:6000000,annual_operating_cost_minor:1000000,debt_balance_minor:0,market_value_minor:120000000,valuation_date:"2026-08-15",review_due_date:"2026-10-15",evidence_id:"e2",evidence_review_status:"approved",evidence_scan_status:"clean",evidence_scanned_at:"2026-09-01T00:00:00Z"},
  {status:"active",acquisition_cost_minor:50000000,annual_rent_minor:0,annual_operating_cost_minor:0,debt_balance_minor:0,market_value_minor:0,valuation_date:null},
  {status:"archived",acquisition_cost_minor:999999999,annual_rent_minor:999999999,annual_operating_cost_minor:0,debt_balance_minor:0,market_value_minor:0}
],{businessDate:"2026-09-27"});
assert.equal(metrics.assetCount,3);
assert.equal(metrics.valuedAssetCount,2);
assert.equal(metrics.unvaluedAssetCount,1);
assert.equal(metrics.professionalValuationRenewalDueCount,1);
assert.equal(metrics.professionalValuationRenewalDueSoonCount,1);
assert.equal(metrics.valuationReportEvidenceGapCount,1);
assert.equal(metrics.netOperatingIncomeProxyMinor,20000000);

const migration=fs.readFileSync("cloudflare/migrations/060_v175_property_evidence_profitability.sql","utf8");
const property=fs.readFileSync("cloudflare/src/property-portfolio.js","utf8");
const analytics=fs.readFileSync("cloudflare/src/business-analytics.js","utf8");
const context=fs.readFileSync("cloudflare/src/business-context.js","utf8");
const owner=fs.readFileSync("public/js/owner-command-centre.js","utf8");
const agentic=fs.readFileSync("cloudflare/src/agentic-entry.js","utf8");
const profile=JSON.parse(fs.readFileSync("RELEASE_PROFILE.json","utf8"));
const workflow=fs.readFileSync(".github/workflows/migrate-production-v175-property-evidence-profitability.yml","utf8");
const runner=fs.readFileSync("scripts/migrate-production-v175-property-evidence-profitability.mjs","utf8");

for(const table of ["property_valuation_evidence_links","property_operating_snapshots"]){
  assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
}
assert.match(migration,/ALTER TABLE property_assets ADD COLUMN archived_at TEXT/);
assert.match(migration,/ALTER TABLE property_professional_valuations ADD COLUMN review_due_date TEXT/);
assert.match(migration,/review_status='approved'/);
assert.match(migration,/scan_status='clean'/);
assert.match(migration,/property_valuation_evidence_immutable_update/);
assert.match(migration,/property_valuation_evidence_immutable_delete/);
assert.match(migration,/property_operating_snapshots_immutable_update/);
assert.match(migration,/property_operating_snapshots_immutable_delete/);
assert.match(migration,/source_kind IN \('migration_baseline','property_register_create','property_register_update'\)/);

assert.match(property,/owner_required_for_property_status/);
assert.match(property,/property_archive_reason_required/);
assert.match(property,/property_operating_snapshots/);
assert.match(property,/property_valuation_evidence_links/);
assert.match(property,/valuation_report_evidence_not_ready/);
assert.match(property,/reportEvidenceMustBeApprovedAndScanClean:true/);
assert.match(property,/performance-history/);
assert.match(property,/accountingProfitClaim:false/);
assert.match(property,/thebeMarketValuation:false/);
assert.doesNotMatch(property,/thebeCertification:true/);

assert.match(analytics,/property_valuation_review_due/);
assert.match(analytics,/property_valuation_report_evidence_gap/);
assert.match(analytics,/valuationReportEvidenceGapCount/);
assert.match(context,/property_valuation_evidence_links/);
assert.match(context,/property_operating_snapshots/);

assert.match(owner,/Performance history/);
assert.match(owner,/Archive reason/);
assert.match(owner,/Signed report evidence/);
assert.match(owner,/NOI is a proxy/);
assert.match(owner,/not audited accounting profit/);
assert.match(owner,/Thebe 12-month reminder policy/);
assert.match(owner,/approved, scan-clean/);
assert.match(owner,/professional valuation review/);

assert.equal(profile.latest_cloudflare_migration,"060_v175_property_evidence_profitability.sql");
assert.match(agentic,/060_v175_property_evidence_profitability\.sql/);
assert.match(agentic,/property_valuation_evidence_links/);
assert.match(agentic,/property_operating_snapshots/);
assert.match(workflow,/\[migrate-060\]/);
assert.match(workflow,/thebe\/production-d1-060/);
assert.match(workflow,/migration authority must be a two-parent merged PR commit/);
assert.match(runner,/blob:'bb96c52478b4e3a22868bdeb584e0d9dff8bf092'/);
assert.match(runner,/time_travel\/bookmark/);
assert.match(runner,/foreign_key_check/);

console.log("v175 property evidence, renewal, archive and profitability history passed");
