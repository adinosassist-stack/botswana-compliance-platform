import assert from "node:assert/strict";
import fs from "node:fs";
import {PROPERTY_VALUATION_SERVICES_VERSION,__propertyValuationServicesTest} from "../cloudflare/src/property-valuation-services.js";

assert.equal(PROPERTY_VALUATION_SERVICES_VERSION,"2026-09-28.v179");
const ready=__propertyValuationServicesTest.professionalCredentialReady;
const now=Date.parse("2026-09-28T08:00:00Z");
assert.equal(ready({
  professional_type:"registered_valuer",verification_status:"verified",registration_ref:"VR-123",
  registration_authority:"Recorded authority",registration_jurisdiction:"BW",
  registration_valid_until:"2027-09-28",credential_verified_at:"2026-09-28T07:00:00Z"
},now),true);
assert.equal(ready({
  professional_type:"registered_valuer",verification_status:"pending",registration_ref:"VR-123",
  registration_authority:"Recorded authority",registration_jurisdiction:"BW",
  registration_valid_until:"2027-09-28",credential_verified_at:"2026-09-28T07:00:00Z"
},now),false);
assert.equal(ready({
  professional_type:"registered_valuer",verification_status:"verified",registration_ref:"",
  registration_authority:"Recorded authority",registration_jurisdiction:"BW",
  registration_valid_until:"2027-09-28",credential_verified_at:"2026-09-28T07:00:00Z"
},now),false);
assert.equal(ready({
  professional_type:"registered_valuer",verification_status:"verified",registration_ref:"VR-123",
  registration_authority:"Recorded authority",registration_jurisdiction:"BW",
  registration_valid_until:"2026-09-27",credential_verified_at:"2026-09-28T07:00:00Z"
},now),false);

const migration=fs.readFileSync("cloudflare/migrations/063_v179_property_valuer_credential_binding.sql","utf8");
const service=fs.readFileSync("cloudflare/src/property-valuation-services.js","utf8");
const agentic=fs.readFileSync("cloudflare/src/agentic-entry.js","utf8");
const profile=JSON.parse(fs.readFileSync("RELEASE_PROFILE.json","utf8"));
const runner=fs.readFileSync("scripts/migrate-production-v179-property-valuer-credential-binding.mjs","utf8");
const workflow=fs.readFileSync(".github/workflows/migrate-production-v179-property-valuer-credential-binding.yml","utf8");
const deploy=fs.readFileSync("cloudflare/deploy-free.sh","utf8");
const launch=fs.readFileSync("docs/LAUNCH.md","utf8");

for(const column of [
  "registration_ref","registration_authority","registration_jurisdiction","registration_valid_until",
  "credential_verified_at","credential_verified_by_user_id","credential_verification_note"
])assert.match(migration,new RegExp("ALTER TABLE professional_profiles ADD COLUMN "+column));
assert.match(migration,/CREATE TABLE IF NOT EXISTS professional_credential_events/);
assert.match(migration,/CREATE UNIQUE INDEX IF NOT EXISTS professional_verified_registration_uq/);
assert.match(migration,/professional_valuer_verified_credential_guard_insert/);
assert.match(migration,/professional_valuer_verified_credential_guard_update/);
assert.match(migration,/professional_valuer_credential_required/);
assert.match(migration,/professional_valuer_credential_expired/);
assert.match(migration,/professional_valuer_credential_verification_required/);
assert.match(migration,/property_valuation_service_professional_credential_mismatch/);
assert.match(migration,/lower\(trim\(p\.registration_ref\)\)=lower\(trim\(coalesce\(NEW\.assigned_professional_registration_ref,''\)\)\)/);
assert.match(migration,/lower\(trim\(v\.valuer_registration_ref\)\)=lower\(trim\(p\.registration_ref\)\)/);

assert.match(service,/professionalCredentialReady/);
assert.match(service,/professionalCredentialRoute/);
assert.match(service,/professional_registration_already_bound/);
assert.match(service,/verified_property_valuer_credential_required/);
assert.match(service,/professional_registration_mismatch/);
assert.match(service,/registrationRef=text\(professional\.registration_ref,120\)/);
assert.match(service,/credentialBindingSource:"verified_professional_profile"/);
assert.match(service,/thebeCertifiesProfessionalCredentials:false/);
assert.match(service,/PROPERTY_VALUER_CREDENTIAL_RECORDED/);
assert.doesNotMatch(service,/const professionalUserId=text\(body\.professionalUserId,64\),registrationRef=text\(body\.registrationRef,120\)/);

assert.equal(profile.latest_cloudflare_migration,"063_v179_property_valuer_credential_binding.sql");
assert.equal(profile.property_valuation_valuer_credential_binding_v179,true);
assert.equal(profile.property_valuation_assignment_uses_verified_profile_registration,true);
assert.equal(profile.property_valuation_professional_credential_expiry_enforced,true);
assert.equal(profile.property_valuation_professional_credential_events,true);

assert.match(agentic,/063_v179_property_valuer_credential_binding\.sql/);
assert.match(agentic,/professional_credential_events/);
assert.match(runner,/number:63/);
assert.match(runner,/063_v179_property_valuer_credential_binding\.sql/);
assert.match(runner,/blob:'d1ac900198ff90e400949df07e3e4a7097c8f28b'/);
assert.match(runner,/professional_verified_registration_uq/);
assert.match(runner,/professional_valuer_verified_credential_guard_insert/);
assert.match(runner,/time_travel\/bookmark/);
assert.match(runner,/foreign_key_check/);
assert.match(workflow,/\[migrate-063\]/);
assert.match(workflow,/thebe\/production-d1-063/);
assert.match(workflow,/migration authority must be a two-parent merged PR commit/);
assert.match(deploy,/Current reviewed schema delta: 063_v179_property_valuer_credential_binding\.sql/);
assert.match(deploy,/063_v179_property_valuer_credential_binding\.sql/);
assert.match(launch,/through `063_v179_property_valuer_credential_binding\.sql`/);

console.log("v179 property valuer professional-profile credential binding checks passed");
