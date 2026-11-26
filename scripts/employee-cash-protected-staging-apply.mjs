import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  PREFLIGHT_SCOPE,
  runCashStagingPreflight,
} from "./employee-cash-protected-staging-preflight.mjs";
import { ACCOUNT } from "./employee-self-service-protected-bootstrap-guard.mjs";

const database = "adfa3871-5ecf-4672-8d2f-be9b142d5fc1";
const approvedChecksum = "59066acb4135e5face4d2b3fbbf2cff6cd2eab0434b6c032b16e4bb67d4ce2ab";
const migration = new URL("../cloudflare/migrations/20261118_employee_cash_reports.sql", import.meta.url);
const queryUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${database}/query`;

async function query(sql, token) {
  const response = await fetch(queryUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql }),
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  assert.ok(response.ok, `Employee staging D1 HTTP ${response.status}`);
  const payload = await response.json();
  assert.equal(payload.success, true, "Employee staging D1 request failed");
  assert.ok(Array.isArray(payload.result) && payload.result.length > 0 &&
    payload.result.every(result => result.success === true), "Employee staging D1 batch failed");
  return payload.result;
}

async function apply(env) {
  assert.equal(env.MIGRATION_AUTHORIZATION, "APPLY_EMPLOYEE_CASH_ISOLATED_STAGING");
  assert.equal(env.RECOVERY_ACCEPTANCE, "ACCEPT_STAGING_TIME_TRAVEL_RECOVERY");
  assert.equal(env.EXPECTED_DATABASE_ID, database);
  const sql = readFileSync(migration, "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  assert.equal(checksum, approvedChecksum, "Employee Cash migration checksum changed");
  assert.equal(env.EXPECTED_MIGRATION_SHA256, approvedChecksum);
  if (!env.STAFF_STAGING_D1_WRITE_TOKEN) throw Error("Dedicated staging D1 write credential required");

  const recoveryTimestamp = new Date().toISOString();
  await runCashStagingPreflight({
    ...env,
    DEPLOY_MODE: "preflight",
    AUTHORIZATION: "PREFLIGHT_ONLY",
    CASH_PREFLIGHT_SCOPE: PREFLIGHT_SCOPE,
  });

  console.log(JSON.stringify({ phase: "before_write", recoveryTimestamp, database, checksum }));
  await query(sql, env.STAFF_STAGING_D1_WRITE_TOKEN);
  const [objects, counts, violations] = await query([
    "SELECT type, name FROM sqlite_master WHERE name GLOB 'employee_cash_*' ORDER BY name",
    "SELECT (SELECT COUNT(*) FROM employee_cash_entries) AS entries, (SELECT COUNT(*) FROM employee_cash_counts) AS counts, (SELECT COUNT(*) FROM employee_cash_events) AS events",
    "PRAGMA foreign_key_check",
  ].join(";"), env.STAFF_STAGING_CLOUDFLARE_TOKEN);

  assert.deepEqual(objects.results.map(({ type, name }) => [type, name]), [
    ["table", "employee_cash_counts"],
    ["index", "employee_cash_counts_review_idx"],
    ["trigger", "employee_cash_counts_tenant_guard"],
    ["table", "employee_cash_entries"],
    ["index", "employee_cash_entries_employee_idx"],
    ["index", "employee_cash_entries_review_idx"],
    ["trigger", "employee_cash_entries_tenant_guard"],
    ["table", "employee_cash_events"],
    ["trigger", "employee_cash_events_tenant_guard"],
    ["index", "employee_cash_events_tenant_idx"],
  ]);
  assert.deepEqual(counts.results, [{ entries: 0, counts: 0, events: 0 }]);
  assert.equal(violations.results.length, 0);
  console.log(JSON.stringify({ phase: "verified", database, checksum, sourceSha: env.EXPECTED_MAIN_SHA }));
}

try {
  await apply(process.env);
} catch (error) {
  // Provider bodies and exception details can contain SQL or data.
  const status = /^Employee staging D1 HTTP \d{3}$/.test(error?.message) ? error.message : undefined;
  console.error("Employee Cash staging migration stopped. Inspect the job phase and reconcile staging schema before any retry.", status || "");
  process.exitCode = 1;
}
