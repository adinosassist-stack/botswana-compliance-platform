import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const runtime = readFileSync(new URL("../public/js/workspace-runtime-20261001b.js", import.meta.url), "utf8");
const renderStart = runtime.indexOf("function renderAll(){");
const renderEnd = runtime.indexOf("\nfunction addDays(", renderStart);
const companyStart = runtime.indexOf("function renderCompanies(){");
const companyEnd = runtime.indexOf("\nfunction ", companyStart + 20);
assert.ok(renderStart >= 0 && renderEnd > renderStart && companyStart >= 0 && companyEnd > companyStart);
const render = runtime.slice(renderStart, renderEnd);
const companies = runtime.slice(companyStart, companyEnd);

test("company selector skips unnecessary DOM rebuilding when unchanged", () => {
  assert.match(companies, /sel\.options\.length===companies\.length/);
  assert.match(companies, /option\.selected===\(c\.id===state\.id\)/);
  assert.ok(companies.indexOf("}))return;") < companies.indexOf("sel.replaceChildren()"));
});

test("dashboard-only list hydration stays behind active-dashboard guard", () => {
  const guard = render.indexOf('document.getElementById("dashboard")?.classList.contains("active")');
  const list = render.indexOf('document.getElementById("priorityList").safeHTML');
  assert.ok(guard >= 0 && list > guard);
});

test("non-dashboard navigation does not evaluate dashboard scoring", () => {
  const flag = 'const dashboardMetricsNeeded=document.getElementById("dashboard")?.classList.contains("active")';
  const flagIndex = render.indexOf(flag);
  const guardIndex = render.indexOf("if(dashboardMetricsNeeded){", flagIndex);
  const scoreIndex = render.indexOf("const a=applicable(),s=scoreData(a);", guardIndex);
  const guardEnd = render.indexOf("applyRoleUi();", guardIndex);
  assert.ok(flagIndex >= 0 && guardIndex > flagIndex, "dashboard scoring must be gated");
  assert.ok(scoreIndex > guardIndex && guardEnd > scoreIndex, "scoring must remain inside dashboard-only block");
  const beforeGuard = render.slice(0, guardIndex);
  const afterGuard = render.slice(guardEnd);
  assert.doesNotMatch(beforeGuard, /\b(?:scoreData|applicable)\s*\(/, "no unconditional scoring before the guard");
  assert.doesNotMatch(afterGuard, /\b(?:scoreData|applicable)\s*\(/, "no unconditional scoring after the guard");
});

test.todo("profile authenticated non-dashboard navigation to quantify applicable() and scoreData() blocking time");

test("navigation renderer invalidates superseded requests and defers work past paint", () => {
  const start = runtime.indexOf("function scheduleWorkspaceNavigationRender(");
  const end = runtime.indexOf("\nlet lastWorkspaceView=", start);
  assert.ok(start >= 0 && end > start);
  const schedule = runtime.slice(start, end);
  assert.match(schedule, /token!==workspacePendingRenderToken/);
  assert.match(schedule, /epoch!==workspaceViewNavigationEpoch/);
  assert.match(schedule, /requestAnimationFrame\(\(\)=>setTimeout\(render,0\)\)/);
});
