import assert from "node:assert/strict";
import fs from "node:fs";
import {PROPERTY_VALUATION_SERVICES_VERSION,__propertyValuationServicesTest} from "../cloudflare/src/property-valuation-services.js";

assert.equal(PROPERTY_VALUATION_SERVICES_VERSION,"2026-09-28.v179");
assert.equal(__propertyValuationServicesTest.quoteExpired({quote_expires_at:"2026-09-27T10:00:00Z"},Date.parse("2026-09-27T10:00:01Z")),true);
assert.equal(__propertyValuationServicesTest.quoteExpired({quote_expires_at:"2026-09-27T10:00:00Z"},Date.parse("2026-09-27T09:59:59Z")),false);
const summary=__propertyValuationServicesTest.serviceSummary([
  {status:"awaiting_payment",quotedFeeBwp:1500,quoteExpired:false},
  {status:"awaiting_payment",quotedFeeBwp:2200,quoteExpired:true},
  {status:"assigned",quotedFeeBwp:1800},
  {status:"report_issued",quotedFeeBwp:2500}
]);
assert.equal(summary.activeRequests,3);
assert.equal(summary.awaitingPayment,2);
assert.equal(summary.inProgress,1);
assert.equal(summary.completed,1);
assert.equal(summary.quotedPipelineBwp,3700);
assert.equal(summary.completedRevenueBwp,2500);
assert.equal(summary.expiredQuotes,1);

const migration=fs.readFileSync("cloudflare/migrations/063_v179_property_valuer_credential_binding.sql","utf8");
const service=fs.readFileSync("cloudflare/src/property-valuation-services.js","utf8");
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const owner=fs.readFileSync("public/js/owner-command-centre.js","utf8");
const agentic=fs.readFileSync("cloudflare/src/agentic-entry.js","utf8");
const profile=JSON.parse(fs.readFileSync("RELEASE_PROFILE.json","utf8"));
const runner=fs.readFileSync("scripts/migrate-production-v177-property-valuation-service-reliability.mjs","utf8");
const workflow=fs.readFileSync(".github/workflows/migrate-production-v177-property-valuation-service-reliability.yml","utf8");

for(const column of ["quote_issued_at","assigned_professional_registration_ref"])assert.match(migration,new RegExp("ADD COLUMN "+column));
for(const trigger of [
  "property_valuation_service_active_duplicate_guard",
  "property_valuation_service_quote_guard",
  "property_valuation_service_assignment_credential_guard",
  "property_valuation_service_issued_credential_guard"
])assert.match(migration,new RegExp(trigger));
assert.match(migration,/property_valuation_service_duplicate_active/);
assert.match(migration,/property_valuation_service_quote_invalid/);
assert.match(migration,/property_valuation_service_registration_required/);
assert.match(migration,/property_valuation_service_credential_mismatch/);
assert.match(migration,/valuer_registration_ref/);

assert.match(service,/valuation_service_active_request_exists/);
assert.match(service,/quote_issued_at=CURRENT_TIMESTAMP/);
assert.match(service,/professional_registration_required/);
assert.match(service,/assigned_valuer_credential_mismatch/);
assert.match(service,/Number\(changed\.meta\?\.changes\|\|0\)===1/);
assert.match(service,/summary:serviceSummary\(items\)/);
assert.match(service,/credentialBoundIssuance:true/);
assert.match(service,/valuation_quote_checkout_already_created/);
assert.match(service,/UPDATE payment_orders SET status=\'canceled\'/);
assert.match(service,/CUSTOMER_CANCELED/);

assert.match(worker,/valuation_quote_expired/);
assert.match(worker,/property_valuation_service_requests/);
assert.match(worker,/source_type==="property_valuation_service"/);
assert.match(worker,/payment_order_canceled/);

assert.match(owner,/awaiting-payment pipeline/);
assert.match(owner,/completed service value/);
assert.match(owner,/View timeline/);
assert.match(owner,/Quote expired · a fresh quote is required before payment/);
assert.match(owner,/registration /);

assert.equal(profile.latest_cloudflare_migration,"063_v179_property_valuer_credential_binding.sql");
assert.equal(profile.property_valuation_service_reliability_v177,true);
assert.equal(profile.property_valuation_quote_expiry_enforced,true);
assert.equal(profile.property_valuation_assigned_credential_bound,true);
assert.equal(profile.property_valuation_duplicate_active_request_blocked,true);
assert.match(agentic,/062_v177_property_valuation_service_reliability\.sql/);
assert.match(runner,/number:62/);
assert.match(runner,/062_v177_property_valuation_service_reliability\.sql/);
assert.match(runner,/blob:'de15b22de9d6547c5b138b4400b54b67827b79d3'/);
assert.match(runner,/time_travel\/bookmark/);
assert.match(runner,/foreign_key_check/);
assert.match(workflow,/\[migrate-062\]/);
assert.match(workflow,/thebe\/production-d1-062/);
assert.match(workflow,/migration authority must be a two-parent merged PR commit/);

console.log("v177 property valuation service reliability and credential-bound issuance checks passed");
