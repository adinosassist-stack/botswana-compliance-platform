import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";

for(const path of [
  "public/js/workspace-runtime-20260923m.js",
  "cloudflare/src/finance-core.js",
  "cloudflare/src/worker.js"
])execFileSync(process.execPath,["--check",path],{stdio:"pipe"});

const html=fs.readFileSync("public/index.html","utf8");
const runtime=fs.readFileSync("public/js/workspace-runtime-20260923m.js","utf8");
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const finance=fs.readFileSync("cloudflare/src/finance-core.js","utf8");
const events=fs.readFileSync("public/js/event-delegation.js","utf8");

// Pass 1 — retention surface: owners land on one factual daily command centre, not another parallel dashboard.
assert.match(html,/Owner Command Centre/);
assert.match(html,/id="ownerGreeting"/);
assert.match(html,/id="homeCashPosition"/);
assert.match(html,/id="homeMoneyOwed"/);
assert.match(html,/id="homeEmployeeCount"/);
assert.match(html,/id="homeNextDeadline"/);
assert.match(html,/id="homeActionCount"/);
assert.match(html,/class="home-thebe-agent executive-only"/);
assert.match(html,/id="homeThebeQuestion"/);
assert.match(html,/id="thebeAgentLauncher"[^>]*hidden[^>]*data-bw-onclick="openThebeFromHome\(\)"/);
assert.match(runtime,/function roleLandingView\(role=currentWorkspaceRole\(\)\)[\s\S]*return "dashboard"/);

// Pass 2 — business truth: the daily surface reads canonical sources and degrades independently.
const daily=(runtime.match(/async function renderDailyOperatingBrief\(\)\{([\s\S]*?)\n\}\n\n\nasync function renderPartnerPortal/)||[])[1]||"";
assert.ok(daily,"daily operating brief must remain parseable");
assert.match(daily,/Promise\.allSettled/);
assert.match(daily,/apiJson\("\/api\/daily-brief"\)/);
assert.match(daily,/apiJson\("\/api\/finance\/summary"\)/);
assert.match(daily,/apiJson\("\/api\/employees"\)/);
assert.match(daily,/homeMoneyMinor\(f\.cashPositionMinor\)/);
assert.match(daily,/homeMoneyMinor\(receivables\.outstandingMinor\)/);
assert.match(daily,/recentlyRemovedEmployeeIds/);
assert.match(daily,/Thebe Brief · partial/);
assert.match(daily,/Finance Core could not be confirmed/);
assert.match(daily,/this is not a compliance all-clear/i);
assert.match(finance,/export async function financeSummary\(env,tenantId\)/);

// Pass 3 — Super Agent: finance context is tenant-scoped, owner/manager-only, and opening the persistent launcher does not silently spend AI credits.
assert.match(worker,/import \{handleFinanceRequest,financeSummary\} from "\.\/finance-core\.js"/);
assert.match(worker,/import \{financeReceivablesSummary\} from "\.\/finance-receivables\.js"/);
assert.match(worker,/financePromise=includeFinance/);
assert.match(worker,/cashPositionMinor:Number\(financePayload\.summary\?\.cashPositionMinor\|\|0\)/);
assert.match(worker,/outstandingMinor:Number\(financePayload\.receivables\?\.outstandingMinor\|\|0\)/);
assert.match(worker,/topReceivables:/);
assert.match(worker,/ref:"FIN-1"/);
assert.match(worker,/Canonical Finance Core and receivables snapshot/);
assert.match(worker,/includeFinance:roleAllowed\(a,"owner","manager"\)/);
assert.doesNotMatch(worker,/includeFinance:roleAllowed\(a,"owner","manager","reviewer"\)/);
assert.match(runtime,/function openThebeFromHome\(question="",run=false\)/);
assert.match(runtime,/function askThebeFromHome\(question=""\)/);
assert.match(runtime,/return openThebeFromHome\(prompt,true\)/);
assert.match(html,/data-bw-onclick="openThebeFromHome\(\)" aria-label="Open Thebe Super Agent"/);
assert.doesNotMatch(html,/id="thebeAgentLauncher"[^>]*data-bw-onclick="askThebeFromHome\(/);

assert.ok(events.includes("\'askThebeFromHome\'"));
assert.ok(events.includes("\'openThebeFromHome\'"));

console.log("v116 owner retention loop: 3-pass command-centre boundary PASS");
