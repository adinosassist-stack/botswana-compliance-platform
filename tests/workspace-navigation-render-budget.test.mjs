import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Guard the production render path against repeated expensive hidden-view work.
// This is a structural regression, not a substitute for authenticated browser tracing.
const runtime = readFileSync(new URL("../public/js/workspace-runtime-20261001b.js", import.meta.url), "utf8");
const start = runtime.indexOf("function renderAll(){");
const end = runtime.indexOf("\nfunction addDays(", start);
assert.ok(start >= 0 && end > start, "workspace renderAll must be present");
const body = runtime.slice(start, end);

test("workspace navigation does not unconditionally render company lists", () => {
  assert.doesNotMatch(body, /;renderCompanies\(\);/, "company lists must be restricted to their active view");
});

test("workspace navigation avoids dashboard scoring when dashboard is hidden", () => {
  const first = body.indexOf("const a=applicable(),s=scoreData(a)");
  const dashboard = body.indexOf('document.getElementById("dashboard")?.classList.contains("active")');
  assert.ok(first < 0 || (dashboard >= 0 && dashboard < first), "dashboard scoring currently executes before the dashboard visibility guard");
});
