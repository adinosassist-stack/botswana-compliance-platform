import assert from "node:assert/strict";
import fs from "node:fs";
import {PROPERTY_VALUATION_SERVICES_VERSION,__propertyValuationServicesTest} from "../cloudflare/src/property-valuation-services.js";

assert.equal(PROPERTY_VALUATION_SERVICES_VERSION,"2026-09-27.v176");
assert.equal(__propertyValuationServicesTest.PURPOSES.has("finance"),true);
assert.equal(__propertyValuationServicesTest.PURPOSES.has("sale"),true);
assert.equal(__propertyValuationServicesTest.CUSTOMER_CANCELABLE.has("awaiting_payment"),true);
assert.equal(__propertyValuationServicesTest.OPS_TRANSITIONS.professional_review.has("report_issued"),true);
assert.equal(__propertyValuationServicesTest.OPS_TRANSITIONS.report_issued.size,0);

const migration=fs.readFileSync("cloudflare/migrations/061_v176_property_valuation_services.sql","utf8");
const service=fs.readFileSync("cloudflare/src/property-valuation-services.js","utf8");
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const owner=fs.readFileSync("public/js/owner-command-centre.js","utf8");
const agentic=fs.readFileSync("cloudflare/src/agentic-entry.js","utf8");
const profile=JSON.parse(fs.readFileSync("RELEASE_PROFILE.json","utf8"));
const runner=fs.readFileSync("scripts/migrate-production-v176-property-valuation-services.mjs","utf8");
const workflow=fs.readFileSync(".github/workflows/migrate-production-v176-property-valuation-services.yml","utf8");

for(const table of ["property_valuation_service_requests","property_valuation_service_events"]){
  assert.match(migration,new RegExp("CREATE TABLE IF NOT EXISTS "+table));
}
for(const trigger of ["property_valuation_service_property_guard","property_valuation_service_professional_guard","property_valuation_service_issued_guard"]){
  assert.match(migration,new RegExp(trigger));
}
assert.match(migration,/verification_status='verified'/);
assert.match(migration,/property_valuer/);
assert.match(migration,/property_valuation_service_issuance_incomplete/);
assert.match(migration,/property_valuation_service_report_not_linked/);
assert.match(migration,/quoted_fee_bwp INTEGER CHECK\(quoted_fee_bwp IS NULL OR quoted_fee_bwp>0\)/);
assert.match(migration,/service_order_id TEXT/);
assert.match(migration,/issued_valuation_id TEXT/);
assert.match(migration,/issued_report_evidence_id TEXT/);

assert.match(service,/quote_then_verified_payment/);
assert.match(service,/owner_required/);
assert.match(service,/verified_property_valuer_required/);
assert.match(service,/governed_signed_report_required/);
assert.match(service,/PROPERTY_VALUATION/);
assert.match(service,/service-checkout/);
assert.match(service,/thebeCreatesValuation:false/);
assert.match(service,/thebeSignsValuation:false/);
assert.match(service,/humanProfessionalSignoffRequired:true/);
assert.match(service,/privilegedSecretGate/);
assert.match(service,/x-operations-secret/);

assert.match(worker,/handlePropertyValuationServicesRequest/);
assert.match(worker,/propertyValuationServicesResponse/);
assert.match(owner,/Request a professional property valuation/);
assert.match(owner,/Request valuation quote/);
assert.match(owner,/Fee quote pending/);
assert.match(owner,/Pay quoted fee/);
assert.match(owner,/Human professional sign-off required/);
assert.match(owner,/\/api\/property\/valuation-services/);
assert.match(owner,/\/api\/payments\/service-checkout/);

assert.equal(profile.latest_cloudflare_migration,"061_v176_property_valuation_services.sql");
assert.match(agentic,/061_v176_property_valuation_services\.sql/);
assert.match(runner,/number:61/);
assert.match(runner,/061_v176_property_valuation_services\.sql/);
assert.match(runner,/blob:'914fce9da4bf1794fd9b61d0f7e3ee59baadcceb'/);
assert.match(runner,/time_travel\/bookmark/);
assert.match(runner,/foreign_key_check/);
assert.match(workflow,/\[migrate-061\]/);
assert.match(workflow,/thebe\/production-d1-061/);
assert.match(workflow,/migration authority must be a two-parent merged PR commit/);

console.log("v176 quote-based professional property valuation service workflow adversarial checks passed");
