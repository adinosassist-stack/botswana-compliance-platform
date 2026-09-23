import assert from "node:assert/strict";
import fs from "node:fs";
import {spawnSync} from "node:child_process";

const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const html=fs.readFileSync("public/index.html","utf8");
const migration=fs.readFileSync("cloudflare/migrations/015_v73_daily_operations_reporting.sql","utf8");

for(const path of ["cloudflare/src/worker.js"]){
  const r=spawnSync(process.execPath,["--check",path],{encoding:"utf8"});
  assert.equal(r.status,0,r.stderr||r.stdout);
}

// Pass 1: authoritative employee lifecycle.
assert.match(worker,/\/api\/employees\\\/\[\^\/\]\+\$\/\)&&req\.method==="DELETE"/);
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

// Pass 2: default location must not consume the customer's first real slot.
assert.match(worker,/untouchedDefault=activeLocations\.find/);
assert.match(worker,/String\(row\.name\|\|""\)\.trim\(\)==="Head Office"/);
assert.match(worker,/String\(row\.code\|\|""\)\.trim\(\)\.toUpperCase\(\)==="HQ"/);
assert.match(worker,/UPDATE operating_locations SET name=\?,code=\?,town=\?,updated_at=CURRENT_TIMESTAMP/);
assert.match(worker,/OPERATING_LOCATION_DEFAULT_CUSTOMIZED/);
assert.match(worker,/reusedDefault:true/);
assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS operating_locations"));
assert.match(html,/Location saved\. The initial Head Office placeholder was replaced\./);

// Pass 3: reporting access stays tenant/active scoped and removals fail closed.
assert.match(worker,/active_employee_required/);
assert.match(worker,/active_location_required/);
assert.match(worker,/employee_reporting_access a JOIN employees e ON e\.id=a\.employee_id/);
assert.match(worker,/lower\(trim\(coalesce\(e\.status,''\)\)\)='active'/);
assert.match(worker,/l\.active=1/);
assert.match(html,/Employee saved\. It is now available for reporting access\./);
assert.match(html,/Add an active employee first, then issue a reporting link\./);
assert.match(html,/Add a location first, then issue a reporting link\./);

console.log("v111 employee/location management: 3-pass adversarial boundary PASS");
