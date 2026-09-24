import assert from "node:assert/strict";
import fs from "node:fs";

const html=fs.readFileSync("public/index.html","utf8");
const runtime=fs.readFileSync("public/js/workspace-runtime-20260923m.js","utf8");
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const delegation=fs.readFileSync("public/js/event-delegation.js","utf8");
const apiClient=fs.readFileSync("public/js/api-client.js","utf8");
const home=fs.readFileSync("public/home.html","utf8");
const synthetic=fs.readFileSync("scripts/production-synthetic-full-user-wrapper.mjs","utf8");

// Pass 1: every delegated workspace control resolves to an allowed runtime function.
const allowedBlock=(delegation.match(/const ALLOWED_ACTIONS=new Set\(\[([\s\S]*?)\]\);/)||[])[1]||"";
const allowed=new Set([...allowedBlock.matchAll(/'([^']+)'/g)].map(m=>m[1]));
const declared=new Set([...runtime.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g),...html.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]));
const expressions=[...html.matchAll(/data-bw-on(?:click|change|input|keydown|keyup|focus|submit)="([^"]+)"/g),...runtime.matchAll(/data-bw-on(?:click|change|input|keydown|keyup|focus|submit)="([^"]+)"/g)].map(m=>m[1]);
const actionNames=new Set();
for(const expression of expressions){
  for(const statement of expression.split(";")){
    const normalized=statement.trim().replace(/^if\(event\.target===this\)\s*/,"");
    const match=normalized.match(/^([A-Za-z_$][\w$]*)\s*\(/);
    if(match&&!["if","setTimeout","window","navigator"].includes(match[1]))actionNames.add(match[1]);
    const timer=normalized.match(/^setTimeout\(([A-Za-z_$][\w$]*)\s*,/);
    if(timer)actionNames.add(timer[1]);
  }
}
assert.ok(expressions.length>=550,`unexpected delegated control count: ${expressions.length}`);
for(const name of actionNames){
  assert.ok(allowed.has(name),`delegated action is not allowlisted: ${name}`);
  assert.ok(declared.has(name),`delegated action has no shipped workspace handler: ${name}`);
}
assert.doesNotMatch(html,/\son(?:click|change|input|submit)=/i,"legacy inline event attributes must remain absent");

// Pass 2: employee removal is visible-state removal everywhere and employee click owns reporting access.
assert.match(runtime,/const response=await apiJson\("\/api\/employees"\),arr=response\.items\|\|\[\],active=arr\.filter\(e=>String\(e\.status\|\|""\)\.trim\(\)\.toLowerCase\(\)==="active"&&!recentlyRemovedEmployeeIds\.has\(String\(e\.id\)\)\)/);
assert.match(runtime,/data-bw-onclick="openEmployeeReportingAccess\('/);
assert.match(runtime,/aria-label="Open reporting access for \$\{escapeHtml\(e\.full_name\)\}"/,"employee name/row must be directly clickable for reporting access");
assert.match(runtime,/click employee to view reporting link/,"employee row must clearly advertise reporting-link access");
assert.match(runtime,/No active employee records yet/);
assert.match(runtime,/const items=\(r\.items\|\|\[\]\)\.filter\(x=>String\(x\.status\|\|""\)\.trim\(\)\.toLowerCase\(\)==="active"&&!recentlyRemovedEmployeeIds\.has\(String\(x\.id\)\)\)/);
assert.match(runtime,/activeRiskEmployees=\(emps\.items\|\|\[\]\)\.filter\(e=>String\(e\.status\|\|""\)\.trim\(\)\.toLowerCase\(\)==="active"&&!recentlyRemovedEmployeeIds\.has\(String\(e\.id\)\)\)/);
assert.match(runtime,/async function openEmployeeReportingAccess\(id\)/);
assert.ok(runtime.includes(">Reporting link</button>"),"employee row must expose the reporting-link action");
assert.match(runtime,/Rotate and show fresh link|Create and show reporting link/);
assert.match(runtime,/__employeeReporterLinks/);
assert.match(runtime,/recentlyRemovedEmployeeIds\.add\(String\(id\)\)/);
assert.match(runtime,/activeAccess\.length===1/);
assert.match(runtime,/await createEmployeeReportingLinkFromCard\(id\)/);

// Pass 3: reporting reads get a bounded slow-path, location refresh is view-scoped, and hero never crops the original.
assert.match(apiClient,/candidateTimeoutMs=IDEMPOTENT_TRANSPORT_CANDIDATE_MAX_MS/);
assert.match(apiClient,/Number\(candidateTimeoutMs\)\|\|IDEMPOTENT_TRANSPORT_CANDIDATE_MAX_MS/);
assert.match(runtime,/reportingAnalyticsApiClient=BW\.api\.createClient\([\s\S]*timeoutMs:90000,retries:2,candidateTimeoutMs:30000/);
assert.match(runtime,/const reportingAnalyticsMemory=new Map\(\)/);
assert.match(runtime,/Date\.now\(\)-cached\.at<15\*60\*1000/);
assert.match(runtime,/reportingAnalyticsJson\(\`\/api\/daily-reporting\/dashboard/);
assert.match(runtime,/if\(document\.getElementById\("peopleops"\)\?\.classList\.contains\("active"\)\)await renderPeopleReportingSetup\(\)/);
assert.match(runtime,/if\(document\.getElementById\("dailyreports"\)\?\.classList\.contains\("active"\)\)await renderDailyOperations\(\)/);
assert.match(runtime,/Retry analytics/);
assert.match(runtime,/if\(reportingSetupDetails&&!reportingSetupDetails\.open\)reportingSetupDetails\.open=true;/,"People reporting controls must not collapse during async refresh/navigation");
assert.match(worker,/const \[locRes,accessRes,reportRes,prevRes,exceptionRes\]=await env\.DB\.batch\(\[/,"dashboard analytics must use one D1 batch round-trip");
assert.match(home,/gaborone-entrepreneurs-v67\.webp/);
assert.match(html,/gaborone-entrepreneurs-v67\.webp/);
assert.match(html,/aspect-ratio:3\/2!important;display:block!important;object-fit:contain!important/,"live marketing hero must preserve the original 1536x1024 ratio without cropping");
assert.match(home,/\.visual img\{width:100%;height:auto;[^}]*aspect-ratio:auto;object-fit:contain\}/);
assert.doesNotMatch(home,/\.visual img\{[^}]*object-fit:cover/);
assert.match(synthetic,/marketing hero uncropped geometry/,"production browser lifecycle must prove hero geometry at desktop and phone widths");
assert.match(synthetic,/Math\.abs\(renderedRatio-naturalRatio\)<0\.015/,"production browser lifecycle must reject hero crop or distortion by rendered aspect ratio");
assert.match(synthetic,/frameOverflowX==='visible'&&state\.frameOverflowY==='visible'/,"production browser lifecycle must reject a clipping hero frame");
assert.match(synthetic,/setViewportSize\(\{width:390,height:844\}\)/,"production browser lifecycle must prove the marketing hero on a phone viewport");

console.log("v113 workspace buttons, people visibility, reporting timeout and hero framing: 3-pass PASS");
