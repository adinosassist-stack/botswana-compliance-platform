import assert from "node:assert/strict";
import fs from "node:fs";
import {derivePortfolioMetrics,PROPERTY_PORTFOLIO_VERSION} from "../cloudflare/src/property-portfolio.js";

assert.equal(PROPERTY_PORTFOLIO_VERSION,"2026-09-27.v174");
const metrics=derivePortfolioMetrics([
  {status:"active",acquisition_cost_minor:200000000,annual_rent_minor:18000000,annual_operating_cost_minor:3000000,debt_balance_minor:90000000,market_value_minor:260000000,valuation_date:"2024-06-01"},
  {status:"active",acquisition_cost_minor:80000000,annual_rent_minor:6000000,annual_operating_cost_minor:1000000,debt_balance_minor:0,market_value_minor:0,valuation_date:null},
  {status:"archived",acquisition_cost_minor:999999999,annual_rent_minor:999999999,annual_operating_cost_minor:0,debt_balance_minor:0,market_value_minor:0}
],{businessDate:"2026-09-27"});
assert.equal(metrics.assetCount,2);
assert.equal(metrics.valuedAssetCount,1);
assert.equal(metrics.unvaluedAssetCount,1);
assert.equal(metrics.staleProfessionalValuationCount,1);
assert.equal(metrics.acquisitionCostMinor,280000000);
assert.equal(metrics.annualRentMinor,24000000);
assert.equal(metrics.annualOperatingCostMinor,4000000);
assert.equal(metrics.netOperatingIncomeProxyMinor,20000000);
assert.equal(metrics.debtBalanceMinor,90000000);
assert.equal(metrics.recordedProfessionalValueMinor,260000000);
assert.equal(metrics.valuationCoveragePct,50);
assert.ok(metrics.debtToRecordedProfessionalValueRatio>0.34&&metrics.debtToRecordedProfessionalValueRatio<0.35);

const migration=fs.readFileSync("cloudflare/migrations/059_v174_property_portfolio_valuation.sql","utf8");
const property=fs.readFileSync("cloudflare/src/property-portfolio.js","utf8");
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const context=fs.readFileSync("cloudflare/src/business-context.js","utf8");
const analytics=fs.readFileSync("cloudflare/src/business-analytics.js","utf8");
const owner=fs.readFileSync("public/js/owner-command-centre.js","utf8");
const workflow=fs.readFileSync(".github/workflows/migrate-production-v174-property-portfolio.yml","utf8");
const runner=fs.readFileSync("scripts/migrate-production-v174-property-portfolio.mjs","utf8");

for(const table of ["property_assets","property_professional_valuations"])assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
assert.match(migration,/source_kind='external_professional_report'/);
assert.match(migration,/UNIQUE\(tenant_id,property_id,report_reference\)/);
assert.match(migration,/property_professional_valuations_immutable_update/);
assert.match(migration,/property_professional_valuations_immutable_delete/);
assert.match(migration,/BEFORE DELETE ON property_professional_valuations\s+WHEN EXISTS\(SELECT 1 FROM tenants t WHERE t\.id=OLD\.tenant_id\)/s);
assert.match(property,/professionalValuesOnlyFromRecordedExternalReports:true/);
assert.match(property,/thebeMarketValuation:false/);
assert.match(property,/thebeCertification:false/);
assert.match(property,/WHERE a\.tenant_id=\? AND a\.status='active'/);
assert.match(property,/valuation_date_in_future/);
assert.match(property,/professional_valuation_conflict/);
assert.doesNotMatch(property,/thebeCertification:true/);
assert.match(worker,/handlePropertyPortfolioRequest/);
assert.match(worker,/propertyPortfolioResponse/);
assert.match(context,/propertyPortfolioSummary/);
assert.match(context,/property:management\?property/);
assert.match(context,/property_assets/);
assert.match(analytics,/portfolioAnalyticsAvailable:propertyAvailable/);
assert.match(analytics,/professionalValuationWorkflowAvailable:propertyAvailable/);
assert.match(analytics,/recordedProfessionalValueMinor/);
assert.match(analytics,/property_valuation_coverage/);
assert.match(owner,/Property & valuation/);
assert.match(owner,/recorded professional valuation/);
assert.match(owner,/action:p\.portfolioAnalyticsAvailable\?\(\)=>route\("propertyintelligence"\):null/);
assert.match(workflow,/\[migrate-059\]/);
assert.match(workflow,/thebe\/production-d1-059/);
assert.match(workflow,/migration authority must be a two-parent merged PR commit/);
assert.match(runner,/blob:'ea31e1d7e90458cc9f0c6a7717db2da19b46c753'/);
assert.match(runner,/time_travel\/bookmark/);
assert.match(runner,/foreign_key_check/);

console.log("v174 Property Portfolio + professional valuation authority boundary passed");
