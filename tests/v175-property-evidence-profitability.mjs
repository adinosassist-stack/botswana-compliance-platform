import assert from "node:assert/strict";
import fs from "node:fs";
import {derivePortfolioMetrics,PROPERTY_PORTFOLIO_VERSION,__propertyPortfolioTest} from "../cloudflare/src/property-portfolio.js";

assert.equal(PROPERTY_PORTFOLIO_VERSION,"2026-09-27.v175");
assert.equal(__propertyPortfolioTest.addDaysIso("2026-09-27",365),"2027-09-27");
assert.equal(__propertyPortfolioTest.renewalStatus("2025-06-01","2026-06-01","2026-09-27"),"due");
assert.equal(__propertyPortfolioTest.renewalStatus("2026-08-15","2026-10-30","2026-09-27"),"due_soon");
assert.equal(__propertyPortfolioTest.renewalStatus("2026-08-15","2027-08-15","2026-09-27"),"current");

const metrics=derivePortfolioMetrics([
  {
    status:"active",acquisition_cost_minor:200000000,annual_rent_minor:18000000,annual_operating_cost_minor:3000000,
    debt_balance_minor:90000000,market_value_minor:260000000,valuation_date:"2025-06-01",review_due_date:"2026-06-01",
    evidence_id:"ev-ready",evidence_review_status:"approved",evidence_scan_status:"clean",evidence_scanned_at:"2026-01-01",
    evidence_malware_name:null,evidence_deleted_at:null
  },
  {
    status:"active",acquisition_cost_minor:80000000,annual_rent_minor:6000000,annual_operating_cost_minor:1000000,
    debt_balance_minor:0,market_value_minor:100000000,valuation_date:"2026-08-15",review_due_date:"2026-10-30",
    evidence_id:null
  },
  {
    status:"active",acquisition_cost_minor:50000000,annual_rent_minor:0,annual_operating_cost_minor:100000,
    debt_balance_minor:0,market_value_minor:0,valuation_date:null
  },
  {status:"archived",acquisition_cost_minor:999999999,annual_rent_minor:999999999,annual_operating_cost_minor:0,debt_balance_minor:0,market_value_minor:0}
],{businessDate:"2026-09-27"});
assert.equal(metrics.assetCount,3);
assert.equal(metrics.valuedAssetCount,2);
assert.equal(metrics.unvaluedAssetCount,1);
assert.equal(metrics.staleProfessionalValuationCount,1);
assert.equal(metrics.professionalValuationRenewalDueCount,1);
assert.equal(metrics.professionalValuationRenewalDueSoonCount,1);
assert.equal(metrics.valuationReportEvidenceGapCount,1);
assert.equal(metrics.recordedProfessionalValueMinor,360000000);

const migration=fs.readFileSync("cloudflare/migrations/060_v175_property_evidence_profitability.sql","utf8");
const property=fs.readFileSync("cloudflare/src/property-portfolio.js","utf8");
const owner=fs.readFileSync("public/js/owner-command-centre.js","utf8");
const analytics=fs.readFileSync("cloudflare/src/business-analytics.js","utf8");
const context=fs.readFileSync("cloudflare/src/business-context.js","utf8");
const agentic=fs.readFileSync("cloudflare/src/agentic-entry.js","utf8");
const runner=fs.readFileSync("scripts/migrate-production-v175-property-evidence-profitability.mjs","utf8");
const workflow=fs.readFileSync(".github/workflows/migrate-production-v175-property-evidence-profitability.yml","utf8");

for(const column of ["archived_at","archived_by_user_id","archive_reason"])assert.match(migration,new RegExp(`ALTER TABLE property_assets ADD COLUMN ${column}`));
for(const column of ["review_due_date","review_due_source"])assert.match(migration,new RegExp(`ALTER TABLE property_professional_valuations ADD COLUMN ${column}`));
for(const table of ["property_valuation_evidence_links","property_operating_snapshots"])assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
assert.match(migration,/review_status='approved'/);
assert.match(migration,/scan_status='clean'/);
assert.match(migration,/scanned_at IS NOT NULL/);
assert.match(migration,/malware_name IS NULL/);
assert.match(migration,/property_valuation_evidence_immutable_update/);
assert.match(migration,/property_valuation_evidence_immutable_delete/);
assert.match(migration,/property_operating_snapshots_immutable_update/);
assert.match(migration,/property_operating_snapshots_immutable_delete/);
assert.match(migration,/migration_baseline/);
assert.match(migration,/property_register_create/);
assert.match(migration,/property_register_update/);
assert.match(migration,/property_valuation_review_due_invalid/);

assert.match(property,/PROPERTY_PORTFOLIO_VERSION="2026-09-27\.v175"/);
assert.match(property,/performance-history/);
assert.match(property,/owner_required_for_property_status/);
assert.match(property,/owner_required_for_archived_property/);
assert.match(property,/function valuationEvidenceRoute\(pathname\)/);
assert.match(property,/const valuationEvidence=valuationEvidenceRoute\(path\)/);
assert.match(property,/PROPERTY_VALUATION_EVIDENCE_LINKED/);
assert.match(property,/valuation_report_evidence_already_linked/);
assert.doesNotMatch(property,/UPDATE property_professional_valuations/);
assert.match(property,/property_archive_reason_required/);
assert.match(property,/valuation_report_evidence_not_ready/);
assert.match(property,/property_valuation_evidence_links/);
assert.match(property,/property_operating_snapshots/);
assert.match(property,/professionalValuationRenewalDueCount/);
assert.match(property,/professionalValuationRenewalDueSoonCount/);
assert.match(property,/valuationReportEvidenceGapCount/);
assert.match(property,/thebe_policy_365d/);
assert.match(property,/accountingProfitClaim:false/);
assert.match(property,/propertyMarketValuation:false/);
assert.match(property,/env\.DB\.batch\(statements\)/);
assert.doesNotMatch(property,/thebeCertification:true/);

assert.match(owner,/function editPropertyAsset\(item\)/);
assert.match(owner,/function linkPropertyValuationEvidence\(/);
assert.match(owner,/Link signed report/);
assert.match(owner,/without changing the immutable valuation record/);
assert.match(owner,/propertyValuationServicePanel/);
assert.match(owner,/requestPropertyValuationService/);
assert.match(owner,/function resetPropertyAssetForm\(\)/);
assert.match(owner,/showPropertyPerformanceHistory/);
assert.match(owner,/portfolioValuationEvidence/);
assert.match(owner,/portfolioAssetArchiveReason/);
assert.match(owner,/\/api\/evidence/);
assert.match(owner,/approved, scan-clean signed-report evidence/);
assert.match(owner,/NOI is a proxy/);
assert.match(owner,/not audited accounting profit/);
assert.match(owner,/Review reminders are workflow controls, not valuation expiry statements/);

assert.match(analytics,/property_valuation_review_due/);
assert.match(analytics,/property_valuation_review_due_soon/);
assert.match(analytics,/property_valuation_report_evidence_gap/);
assert.match(analytics,/valuationReportEvidenceGapCount/);
assert.match(analytics,/property_operating_snapshots/);
assert.match(context,/property_valuation_evidence_links/);
assert.match(context,/property_operating_snapshots/);
assert.match(agentic,/063_v179_property_valuer_credential_binding\.sql/);
assert.match(agentic,/property_valuation_evidence_links/);
assert.match(agentic,/property_operating_snapshots/);

assert.match(runner,/number:60/);
assert.match(runner,/060_v175_property_evidence_profitability\.sql/);
assert.match(runner,/blob:'bb96c52478b4e3a22868bdeb584e0d9dff8bf092'/);
assert.match(runner,/time_travel\/bookmark/);
assert.match(runner,/foreign_key_check/);
assert.match(runner,/property_valuation_evidence_not_ready/);
assert.match(runner,/property_operating_snapshot_immutable/);
assert.match(workflow,/\[migrate-060\]/);
assert.match(workflow,/thebe\/production-d1-060/);
assert.match(workflow,/migration authority must be a two-parent merged PR commit/);

console.log("v175 property evidence, archive, renewal and profitability-history adversarial checks passed");
