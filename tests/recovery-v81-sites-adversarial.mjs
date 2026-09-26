import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const worker=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const server=fs.readFileSync(new URL("../server/server.js",import.meta.url),"utf8");
const sectionMatch=html.match(/<section id="sites"[\s\S]*?<\/section>/);
assert.ok(sectionMatch,"Authoritative Sites section missing");
const siteSection=sectionMatch[0];
const match=html.match(/<script id="thebe-sites-authoritative-js">([\s\S]*?)<\/script>/);
assert.ok(match,"Authoritative Sites module missing");
const js=match[1];

// Pass 1 — production UI is backed by durable tenant APIs, not browser demo state.
assert.match(html,/data-source="authoritative-operating-locations"/);
assert.match(html,/data-recovery-lineage="v159-sites-authoritative"/);
assert.match(html,/Sites &amp; field work/);
assert.match(html,/Server-backed tenant data/);
assert.match(js,/apiJson\("\/api\/daily-reporting\/locations"\)/);
assert.match(js,/reportingAnalyticsJson\("\/api\/daily-reporting\/dashboard\?date="/);
assert.match(js,/Create site \/ job/);
assert.doesNotMatch(js,/sessionStorage|localStorage|DEMO_SITES|DEMO_TASKS|SITE_PREFIX|TASK_PREFIX/);
assert.doesNotMatch(siteSection,/Phase 0 demo|Session-only demo|Reset demo|Phase 0 session/);
assert.doesNotMatch(js,/Phase 0 demo|Session-only demo|Reset demo|Phase 0 session/);

// Pass 2 — authorization, tenant isolation and exact server-side location mutation routes.
assert.match(js,/ALLOWED_ROLES=new Set\(\["owner","manager"\]\)/);
assert.match(js,/productionApiClient\.request\("\/api\/auth\/me"\)/);
assert.match(js,/tenantId/);
assert.match(js,/\/api\/daily-reporting\/locations\/"\+encodeURIComponent\(site\.id\)/);
assert.match(js,/\/deactivate/);
assert.match(js,/\/reactivate/);
assert.match(worker,/WHERE tenant_id=\?/);
assert.match(worker,/OPERATING_LOCATION_CREATED/);
assert.match(worker,/OPERATING_LOCATION_UPDATED/);
assert.match(worker,/OPERATING_LOCATION_REMOVED/);
assert.match(server,/tenantId:req\.auth\.tenant_id/);

// Pass 3 — no authority creep: site UI coordinates locations/reporting only.
assert.doesNotMatch(js,/\/api\/(finance|payroll|hr|employees)/i);
assert.doesNotMatch(js,/agent_execution_grants|agent_task_requests|payment_orders/i);
assert.match(html,/Historical reports stay intact/);
assert.match(js,/reportingPopulation/);
assert.match(js,/totals\.attention/);
assert.match(js,/expectedSubmitted/);
assert.match(js,/showView\("dailyreports"\)/);

console.log("Recovery Sites adversarial checks passed (authoritative 3-pass boundary)");
