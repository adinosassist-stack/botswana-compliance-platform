import assert from "node:assert/strict";
import fs from "node:fs";

const entry=fs.readFileSync("cloudflare/src/report-evidence-governance-entry-v332.js","utf8");
const migration=fs.readFileSync("cloudflare/migrations/069_v332_daily_report_evidence.sql","utf8");
const client=fs.readFileSync("public/js/reporter-evidence-v332.js","utf8");
const reporter=fs.readFileSync("public/js/employee-reporting-portal.js","utf8");
const redirect=fs.readFileSync("public/js/reporter-link-redirect.js","utf8");
const wrangler=fs.readFileSync("cloudflare/wrangler.toml","utf8");

assert.ok(wrangler.includes('main = "src/report-evidence-governance-entry-v332.js"'),"v332 governance wrapper must own the production entry");
assert.ok(wrangler.includes('EVIDENCE_UPLOADS_ENABLED = "false"'),"evidence uploads must remain fail-closed by default");
assert.ok(entry.includes('import base from "./release-governance-entry.js"'),"v332 must preserve release governance");
assert.ok(entry.includes('logicalPath(request)==="/public/daily-reporting/evidence"'),"public evidence endpoint missing");
assert.ok(entry.indexOf("!uploadsEnabled(env)")<entry.indexOf("reporterAccess(env,token)"),"upload feature gate must fail closed before bearer access/data work");
assert.ok(entry.includes("!scannerConfigured(env)"),"scanner configuration gate missing");
assert.ok(entry.includes("EVIDENCE_SCAN_SECRET")&&entry.includes("EVIDENCE_SCAN_API_URL"),"scanner URL and secret must both be required");
assert.ok(entry.includes("const hash=await sha256Hex(raw)"),"report bearer token must be hashed before DB lookup");
assert.ok(entry.includes("a.token_hash=?")&&entry.includes("a.status='active'")&&entry.includes("a.expires_at>CURRENT_TIMESTAMP"),"report link freshness checks missing");
assert.ok(entry.includes("employee_id=? AND location_id=? AND report_date=?"),"evidence must bind to the exact reporter, branch and report date");
assert.ok(entry.includes("report_required_before_evidence"),"evidence must not precede its daily report");
assert.ok(entry.includes("image/jpeg")&&entry.includes("image/png")&&entry.includes("image/webp")&&entry.includes("application/pdf"),"safe MIME allowlist missing");
assert.ok(entry.includes("signatureMatches(type,bytes)"),"file signature verification missing");
assert.ok(entry.includes("/quarantine/")&&entry.includes("'uploaded','queued','retained'")&&entry.includes("'quarantined'"),"evidence must enter private quarantine and scan queue");
assert.ok(!entry.includes("clean_object_key")&&!entry.includes("review_status='approved'"),"public reporter must not self-promote evidence to clean/approved");
assert.ok(entry.includes("PUBLIC_RATE_LIMITER")&&entry.includes("report-evidence:${tokenKey}"),"bearer-scoped upload throttling missing");
assert.ok(entry.includes("originAllowed(request,env)"),"same-origin mutation boundary missing");
for(const secretName of ["FNB_USERNAME","FNB_PASSWORD","FNB_PIN","FNB_OTP","BANK_USERNAME","BANK_PASSWORD","BANK_PIN","BANK_OTP"])assert.ok(!entry.includes(secretName),`report evidence path must not introduce ${secretName}`);

assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS daily_report_evidence"),"daily-report evidence relation missing");
assert.ok(migration.includes("FOREIGN KEY(report_id) REFERENCES daily_employee_reports(id) ON DELETE CASCADE"),"report FK missing");
assert.ok(migration.includes("FOREIGN KEY(evidence_id) REFERENCES evidence(id) ON DELETE CASCADE"),"evidence FK missing");
for(const state of ["reported","partially_matched","bank_matched","verified","needs_review"])assert.ok(migration.includes(`'${state}'`),`reconciliation state ${state} missing`);
assert.ok(migration.includes("evidence_id TEXT NOT NULL UNIQUE"),"one evidence object must not be linked to multiple reports");

assert.ok(client.includes("BW?.api?.createClient")||client.includes("BW?.api?.createClient?."),"report evidence client must use centralized API transport");
assert.ok(!client.includes("fetch("),"report evidence client must not bypass centralized API transport");
assert.ok(client.includes("x-report-token")&&client.includes("x-report-date")&&client.includes("x-evidence-category"),"evidence request binding headers missing");
assert.ok(client.includes("does not automatically verify revenue"),"employee UI must distinguish reported proof from verified revenue");
assert.ok(client.includes("private evidence")&&!client.includes("objectKey"),"client must not expose storage object keys");
assert.ok(reporter.includes('new CustomEvent("thebe:daily-report-submitted"'),"report success must signal evidence UI");
assert.ok(redirect.includes('if(path==="/report")return'),"legacy public reporter route contract must remain intact");
assert.ok(redirect.includes("reporter-evidence-v332.js"),"report surface must load v332 evidence UI");

console.log("v332 report evidence reconciliation: PASS");
