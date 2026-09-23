import assert from "node:assert/strict";
import fs from "node:fs";
import {spawnSync} from "node:child_process";

const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const html=fs.readFileSync("public/index.html","utf8");
const migration=fs.readFileSync("cloudflare/migrations/015_v73_daily_operations_reporting.sql","utf8");
const synthetic=fs.readFileSync("scripts/production-synthetic-full-user-wrapper.mjs","utf8");
const delegatedEvents=fs.readFileSync("public/js/event-delegation.js","utf8");

for(const path of ["cloudflare/src/worker.js"]){
  const r=spawnSync(process.execPath,["--check",path],{encoding:"utf8"});
  assert.equal(r.status,0,r.stderr||r.stdout);
}

// Pass 1: authoritative employee lifecycle.
assert.ok(worker.includes('url.pathname.match(/^\\/api\\/employees\\/[^/]+$/)&&req.method==="DELETE"'));
assert.match(worker,/UPDATE employees SET status='inactive',end_date=COALESCE\(end_date,\?\)/);
assert.match(worker,/lower\(trim\(coalesce\(status,''\)\)\)='active' RETURNING id,full_name/);
assert.match(worker,/UPDATE employee_reporting_access SET status='revoked'/);
assert.match(worker,/decrementUsage\(env,a\.tenant_id,"employees_active"\)/);
assert.match(worker,/EMPLOYEE_REMOVED/);
assert.match(worker,/retainedHistory:true/);
assert.doesNotMatch(worker,/DELETE FROM employees WHERE id=\?/,"employee removal must retain history");
assert.match(html,/async function removeEmployeeRecord\(id\)/);
assert.match(html,/\/api\/employees\/\$\{encodeURIComponent\(id\)\}/);
assert.match(html,/method:"DELETE"/);
assert.match(html,/Historical records were retained and reporting access was revoked/);
assert.match(html,/data-bw-onclick="removeEmployeeRecord\('/);
assert.match(html,/el\.safeHTML=active\.length\?active\.map/,"employee register must render active employees only");
assert.match(html,/async function openEmployeeReportingAccess\(id\)/);
assert.match(html,/async function createEmployeeReportingLinkFromCard\(id\)/);
assert.match(html,/Existing private bearer links are stored only as hashes and cannot be revealed again/);
for(const action of ["openEmployeeReportingAccess","createEmployeeReportingLinkFromCard","copyEmployeeReportingLink"])assert.ok(delegatedEvents.includes(`'${action}'`),`delegated event allowlist missing ${action}`);

// Core directory must remain usable even when Employer Shield is not entitled.
assert.match(worker,/const employerEntitlement=await entitlement\(env,a\.tenant_id,"employer_shield"\)/);
assert.match(worker,/const basicDirectoryLimit=10,used=await usageValue\(env,a\.tenant_id,"employees_active"\)/);
assert.match(worker,/featureKey:"employee_directory"/);
assert.doesNotMatch(worker,/if\(url\.pathname==="\/api\/employees"&&req\.method==="POST"\)\{[\s\S]{0,220}enforceUsageLimit\(env,a\.tenant_id,"employer_shield","employees_active"\);if\(!gate\.ok\)return json\(gate,402\);/);

// Pass 2: default location must not consume the customer's first real slot.
assert.match(worker,/untouchedDefault=activeLocations\.find/);
assert.match(worker,/String\(row\.name\|\|""\)\.trim\(\)==="Head Office"/);
assert.match(worker,/String\(row\.code\|\|""\)\.trim\(\)\.toUpperCase\(\)==="HQ"/);
assert.match(worker,/UPDATE operating_locations SET name=\?,code=\?,town=\?,updated_at=CURRENT_TIMESTAMP/);
assert.match(worker,/OPERATING_LOCATION_DEFAULT_CUSTOMIZED/);
assert.match(worker,/reusedDefault:true/);
assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS operating_locations"));
assert.match(html,/Location saved\. The initial Head Office placeholder was replaced\./);
assert.match(worker,/OPERATING_LOCATION_UPDATED/);
assert.match(worker,/OPERATING_LOCATION_REMOVED/);
assert.match(worker,/OPERATING_LOCATION_REACTIVATED/);
assert.doesNotMatch(worker,/last_active_location_required/);
assert.match(worker,/reportingAccessRevoked:true/);
assert.match(worker,/const historical=await env\.DB\.prepare\("SELECT id,name,code,town,active FROM operating_locations WHERE tenant_id=\? ORDER BY created_at LIMIT 1"\)/);
assert.match(worker,/if\(historical\)return null/);
assert.match(html,/async function editOpsLocation\(id\)/);
assert.match(html,/async function removeOpsLocation\(id\)/);
assert.match(html,/async function deactivateOpsLocation\(id\)\{return removeOpsLocation\(id\)\}/);
assert.match(html,/async function reactivateOpsLocation\(id\)/);
for(const action of ["editOpsLocation","removeOpsLocation","reactivateOpsLocation"])assert.ok(delegatedEvents.includes(`'${action}'`),`delegated event allowlist missing ${action}`);
assert.match(html,/let opsReportingSetupEpoch=0/);
assert.equal((html.match(/const setupEpoch=\+\+opsReportingSetupEpoch/g)||[]).length,2,"People setup and Daily Reports must share the render epoch");
assert.equal((html.match(/if\(setupEpoch!==opsReportingSetupEpoch\)return;/g)||[]).length,2,"both async reporting renders must discard stale completions");
assert.match(html,/opsLocationsSignature/,"unchanged location rows must retain their DOM instead of detaching controls");
assert.match(html,/allLocs\.filter\(x=>Number\(x\.active\)===1\)/);
assert.match(html,/Remove location\?/);
assert.match(html,/Historical reports were retained and reporting links for it were revoked/);
assert.match(html,/Removed/);

// Basic reporting setup uses the operating-locations entitlement; analytics remain separately gated.
assert.ok(worker.includes('/^\\/api\\/daily-reporting\\/locations\\/[^/]+(?:\\/(?:deactivate|reactivate))?$/.test(url.pathname)'));
assert.match(worker,/const featureKey=reportingSetupPath\?"operating_locations":"daily_operations"/);
assert.equal((worker.match(/entitlement\(env,access\.tenant_id,"operating_locations"\)/g)||[]).length,2,"public reporting access and submit must follow the core operating_locations entitlement");

// Pass 3: reporting access stays tenant/active scoped and removals fail closed.
assert.match(worker,/active_employee_required/);
assert.match(worker,/active_location_required/);
assert.match(worker,/employee_reporting_access a JOIN employees e ON e\.id=a\.employee_id/);
assert.match(worker,/lower\(trim\(coalesce\(e\.status,''\)\)\)='active'/);
assert.match(worker,/l\.active=1/);
assert.match(html,/Employee saved\. It is now available for reporting access\./);
assert.match(html,/Add an active employee first, then issue a reporting link\./);
assert.match(html,/Add a location first, then issue a reporting link\./);
assert.match(synthetic,/visible Remove employee control missing for the synthetic employee/);
assert.match(synthetic,/operating location edit lifecycle/);
assert.match(synthetic,/employee row reporting access/);
assert.match(synthetic,/employee removal and reporting revocation/);
assert.match(synthetic,/location removal lifecycle/);
assert.match(synthetic,/reporting_link_invalid_or_expired/);
assert.match(synthetic,/\/public\/daily-reporting\/access/);

console.log("v111 employee/location management: 3-pass adversarial boundary PASS");
