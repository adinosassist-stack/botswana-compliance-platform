import fs from "node:fs";
import assert from "node:assert/strict";
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const worker=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const server=fs.readFileSync(new URL("../server/server.js",import.meta.url),"utf8");
const m=html.match(/<script id="thebe-sites-phase0-demo-js">([\s\S]*?)<\/script>/);
assert.ok(m,"V81 Sites recovery module missing");
const js=m[1];
// Pass 1 — product boundary and interactive Phase 0 behavior.
assert.match(html,/data-recovery-lineage="v81-sites-reconstructed"/);
assert.match(html,/Sites &amp; field work/);
assert.match(js,/siteTaskAddBtn/);
assert.match(js,/createSite\(\)/);
assert.match(js,/MAX_TASKS=200/);
assert.doesNotMatch(js,/\/api\/(finance|payroll|hr|employees)/i);
// Pass 2 — authorization, tenant isolation and canonical site binding.
assert.match(js,/ALLOWED_ROLES=new Set\(\["owner","manager"\]\)/);
assert.match(js,/productionApiClient\.request\("\/api\/auth\/me"\)/);
assert.match(js,/tenantId/);
assert.match(js,/SITE_PREFIX="thebe:v81:sites:"/);
assert.match(js,/TASK_PREFIX="thebe:v81:site-tasks:"/);
assert.match(js,/matches\.length===1/);
assert.match(js,/canonical site context required/);
assert.match(js,/sessionStorage\.getItem/);
assert.match(js,/sessionStorage\.setItem/);
assert.doesNotMatch(js,/localStorage/);
assert.doesNotMatch(js,/generic|workspace:fallback|fallback.*storage/i);
// Pass 3 — normalized session records, no authority creep, server session exposes opaque tenant identity.
assert.match(js,/slice\(0,MAX_TASKS\)/);
assert.match(js,/title,120/);
assert.match(js,/owner,80/);
assert.match(js,/validDate/);
assert.match(js,/TASK_STATUSES/);
assert.match(worker,/tenantId:a\.tenant_id/);
assert.match(server,/tenantId:req\.auth\.tenant_id/);
assert.match(html,/does not create payroll, disciplinary findings, accounting journals or authoritative project records/);
console.log("Recovery V81 Sites adversarial checks passed (3-pass boundary)");
