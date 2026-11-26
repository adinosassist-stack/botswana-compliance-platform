import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { ACCOUNT, verifyRemote } from "./employee-self-service-protected-bootstrap-guard.mjs";
import { STAGING_D1 } from "./employee-self-service-staging-preflight.mjs";

const checksum = "d61a6e09d2c7f9e05e0ee5c57d10ee2ae0446ce3d6661473e7906936612f8ad5";
const migration = new URL("../cloudflare/staging/employee-cash-authentication.sql", import.meta.url);
const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${STAGING_D1}`;
const tables = ["auth_rate_limits", "memberships", "sessions"];
const columns = ["display_name", "onboarding_complete", "password_hash", "session_generation"];
const inspect = [
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('auth_rate_limits','memberships','sessions') ORDER BY name",
  "SELECT name FROM pragma_table_info('users') WHERE name IN ('display_name','onboarding_complete','password_hash','session_generation') ORDER BY name",
  "PRAGMA foreign_key_check",
].join(";");

async function request(path, token, sql) {
  const response = await fetch(base + path, {
    method: sql ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: sql ? JSON.stringify({ sql }) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  assert.ok(response.ok, `Isolated staging D1 HTTP ${response.status}`);
  const data = await response.json();
  assert.equal(data.success, true);
  if (sql) assert.ok(Array.isArray(data.result) && data.result.length && data.result.every(item => item.success === true));
  return data.result;
}

async function apply(env) {
  assert.equal(env.MIGRATION_AUTHORIZATION, "APPLY_EMPLOYEE_CASH_STAGING_AUTH");
  assert.equal(env.RECOVERY_ACCEPTANCE, "ACCEPT_STAGING_TIME_TRAVEL_RECOVERY");
  assert.equal(env.EXPECTED_DATABASE_ID, STAGING_D1);
  assert.equal(env.EXPECTED_MIGRATION_SHA256, checksum);
  const sql = readFileSync(migration, "utf8");
  assert.equal(createHash("sha256").update(sql).digest("hex"), checksum);
  const read = env.STAFF_STAGING_CLOUDFLARE_TOKEN;
  const write = env.STAFF_STAGING_D1_WRITE_TOKEN;
  assert.ok(read && write);
  await verifyRemote({ ...env, DEPLOY_MODE: "preflight", AUTHORIZATION: "PREFLIGHT_ONLY" });
  const before = await request("/query", read, inspect);
  assert.deepEqual(before.map(item => item.results), [[], [], []]);
  const cash = await request("/query", read, "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('employee_cash_counts','employee_cash_entries','employee_cash_events') ORDER BY name");
  assert.deepEqual(cash[0].results.map(row => row.name), ["employee_cash_counts", "employee_cash_entries", "employee_cash_events"]);
  const recoveryTimestamp = new Date().toISOString();
  const recovery = await request("/time_travel/bookmark", read);
  assert.ok(typeof recovery.bookmark === "string" && recovery.bookmark.length);
  console.log(JSON.stringify({ phase: "before_write", recoveryTimestamp, database: STAGING_D1, checksum }));
  await request("/query", write, sql);
  const after = await request("/query", read, inspect);
  assert.deepEqual(after.map(item => item.results.map(row => row.name)), [tables, columns, []]);
  console.log(JSON.stringify({ phase: "verified", database: STAGING_D1, checksum, sourceSha: env.EXPECTED_MAIN_SHA }));
}

try {
  await apply(process.env);
} catch (error) {
  const status = /^Isolated staging D1 HTTP \d{3}$/.test(error?.message) ? error.message : "";
  console.error("Employee Cash staging authentication migration stopped. Inspect the last verified phase before retrying.", status);
  process.exitCode = 1;
}
