import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const runtime=readFileSync(new URL("../public/js/workspace-runtime-20261001b.js",import.meta.url),"utf8");
const start=runtime.indexOf("function renderAll(){");
const end=runtime.indexOf("\nfunction addDays(",start);
assert.ok(start>=0&&end>start,"renderAll must be present");
const render=runtime.slice(start,end);

test("dashboard metrics are gated before expensive scoring",()=>{
 const guard=render.indexOf('if(dashboardMetricsNeeded){');
 const applicable=render.indexOf('const a=applicable(),s=scoreData(a);');
 assert.ok(guard>=0&&applicable>guard,"scoring must run only in dashboard metrics guard");
 assert.match(render,/dashboardMetricsNeeded=document\.getElementById\("dashboard"\)\?\.classList\.contains\("active"\)/);
});

test("shared role permissions and active view rendering remain outside dashboard metrics guard",()=>{
 const scoring=render.indexOf('const a=applicable(),s=scoreData(a);');
 const role=render.indexOf("applyRoleUi();");
 const active=render.indexOf('run("security",renderSecurity)');
 assert.ok(scoring>=0&&role>scoring&&active>role);
 const between=render.slice(scoring,role);
 assert.ok(between.includes("if(dashboardMetricsNeeded){"));
 assert.match(between,/\n \}\n\s*applyRoleUi\(\);$/);
});

test("dashboard lists remain dashboard-only",()=>{
 const priority=render.indexOf('document.getElementById("priorityList").safeHTML');
 assert.ok(priority>render.indexOf('if(dashboardMetricsNeeded){'));
});

test.todo("measure authenticated cold and warm navigation responsiveness under representative data");
