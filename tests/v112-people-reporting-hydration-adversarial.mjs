import assert from "node:assert/strict";
import fs from "node:fs";
import {spawnSync} from "node:child_process";

const runtime=fs.readFileSync("public/js/workspace-runtime-20260923i.js","utf8");
const html=fs.readFileSync("public/index.html","utf8");
const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");

const syntax=spawnSync(process.execPath,["--check","public/js/workspace-runtime-20260923i.js"],{encoding:"utf8"});
assert.equal(syntax.status,0,syntax.stderr||syntax.stdout);

// Pass 1: People owns the reporting setup DOM and must hydrate it on view open.
assert.match(html,/<section[^>]*id="peopleops"[^>]*class="[^"]*view[^"]*"/i);
assert.match(html,/id="opsReporterEmployee"/);
assert.match(html,/id="opsReporterLocation"/);
assert.match(html,/data-bw-onclick="addOpsLocation\(\)"/);
assert.match(runtime,/async function renderPeopleReportingSetup\(\)/);
assert.match(runtime,/document\.getElementById\("peopleops"\)\?\.classList\.contains\("active"\)/);
assert.match(runtime,/run\("peopleops",renderPeopleReportingSetup\)/);

// Pass 2: People hydration fetches only the bounded setup sources needed for these controls.
const helper=(runtime.match(/async function renderPeopleReportingSetup\(\)\{([\s\S]*?)\n\}\nasync function renderDailyOperations/)||[])[1]||"";
assert.ok(helper,"People reporting hydration helper must remain parseable");
assert.match(helper,/apiJson\("\/api\/daily-reporting\/locations"\)/);
assert.match(helper,/apiJson\("\/api\/employees"\)/);
assert.match(helper,/apiJson\("\/api\/daily-reporting\/access"\)/);
assert.match(helper,/fillSelectPreserve\(document\.getElementById\("opsReporterLocation"\)/);
assert.match(helper,/fillSelectPreserve\(document\.getElementById\("opsReporterEmployee"\)/);
assert.doesNotMatch(helper,/\/api\/daily-reporting\/dashboard/);
assert.doesNotMatch(helper,/\/api\/daily-reporting\/performance/);

// Pass 3: failures are visible and access remains fail-closed.
assert.match(helper,/Locations could not load/);
assert.match(helper,/Employee reporting access could not load/);
assert.match(helper,/accessButton\.disabled=accessBlocked\|\|!locs\.length\|\|!emps\.length/);
assert.match(helper,/Add an active employee first, then issue a reporting link/);
assert.match(helper,/Add a location first, then issue a reporting link/);
assert.match(production,/WORKSPACE_RUNTIME_ASSET="\/js\/workspace-runtime-20260923i\.js"/);
assert.match(runtime,/async function removeOpsLocation\(id\)/);
assert.match(runtime,/removeOpsLocation/);
assert.match(runtime,/Remove location\?/);
assert.match(runtime,/Historical reports were retained and reporting links for it were revoked/);
assert.match(runtime,/async function loadOpsPerformanceLearning\(\)/);
assert.match(runtime,/const reportingFailures=\[dashboardR\]/,"optional reporting intelligence must not block the core dashboard");
assert.match(html,/data-bw-onclick="loadOpsPerformanceLearning\(\)"/);
assert.match(runtime,/async function openEmployeeReportingAccess\(id\)/);
assert.match(runtime,/el\.safeHTML=active\.length\?active\.map/);

console.log("v112 People reporting hydration: 3-pass UI boundary PASS");
