import fs from "node:fs";
import assert from "node:assert/strict";

const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const css=fs.readFileSync("public/assets/workspace-command-center-v231.css","utf8");
const runtime=fs.readFileSync("public/js/workspace-runtime-20261001b.js","utf8");
const html=fs.readFileSync("public/index.html","utf8");

assert.match(production,/WORKSPACE_COMMAND_CENTER_V231_CSS_ASSET="\/assets\/workspace-command-center-v231\.css"/);
assert.match(production,/workspaceCommandCenterV231CssHref=WORKSPACE_COMMAND_CENTER_V231_CSS_ASSET/);
assert.match(production,/if\(!source\.includes\(WORKSPACE_COMMAND_CENTER_V231_CSS_ASSET\)\)source=injectBeforeFinalClosingTag\(source,"head"/,
  "V231 command-center layer must be injected into the authenticated workspace");

for(const marker of [
  'id="workspaceSidebar"',
  'class="top"',
  'class="owner-today-grid"',
  'class="home-thebe-agent executive-only"',
  'class="outcome-status-strip"',
  'class="people-status-strip"',
  'class="proof-summary-grid"',
  'id="propertyintelligence"'
]) assert.ok(html.includes(marker),"workspace reference marker missing: "+marker);

assert.match(production,/const WORKSPACE_RUNTIME_RELEASE="20261001-property-command-center-v231";/,
  "V231 must rotate the canonical workspace runtime after the Property activation fix");
assert.match(runtime,/function enforceResidentPropertyVisibility\(target\)/,
  "Property visibility must be owned by the canonical workspace runtime");
assert.match(runtime,/target\.removeAttribute\("data-lazy-view"\)/,
  "resident Property activation must clear stale lazy-view state before rendering");
assert.match(runtime,/if\(id==="propertyintelligence"\)scheduleResidentPropertyVisibility\(target\)/,
  "showView must synchronously enforce resident Property visibility after activation");
assert.match(runtime,/renderAll\(\);if\(id==="propertyintelligence"\)scheduleResidentPropertyVisibility\(target\)/,
  "Property visibility must be reasserted after renderAll so late owner/portfolio rendering cannot hide the calculator");

assert.match(css,/V231 Workspace command-center system/);
assert.match(css,/#workspaceSidebar\{[\s\S]*background:#fff!important/,
  "desktop workspace navigation must use the light command-center shell");
assert.match(css,/#workspaceSidebar \.nav-primary\.active\{[\s\S]*var\(--v231-blue\)/,
  "active primary navigation must be visually obvious in the Thebe blue system");
assert.match(css,/#mainContent \.global-search\{[\s\S]*min-width:min\(42vw,520px\)/,
  "workspace search must remain a first-class top-bar control");

assert.match(css,/\.simplified-hub>\.hub-hero p\.muted\{display:none!important\}/,
  "primary hubs must suppress explanatory hero paragraphs in the default scan view");
assert.match(css,/\.simplified-hub :is\(\.outcome-status-strip,\.people-status-strip\)\{[\s\S]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/,
  "primary status metrics must render as compact KPI tiles");
assert.match(css,/\.simplified-hub :is\(\.outcome-grid,\.people-outcome-grid\)\{[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,
  "primary actions must render as a compact card grid");
assert.match(css,/-webkit-line-clamp:2/,
  "descriptive card copy must be bounded instead of producing long plain-text surfaces");

assert.match(css,/#dashboard \.owner-today-grid\{[\s\S]*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/,
  "Home must expose the business snapshot as a compact KPI row");
assert.match(css,/#dashboard \.home-thebe-agent\{[\s\S]*grid-template-columns:minmax\(180px,\.6fr\) minmax\(0,1\.4fr\)/,
  "Talk to Thebe must read as a central compact command band");
assert.match(css,/#dashboard \.home-thebe-agent>div:first-child p,[\s\S]*\.home-thebe-agent-note\{display:none!important\}/,
  "Talk to Thebe must avoid redundant explanatory text in the default workspace view");
assert.match(css,/#dashboard \.home-decision-grid\{[\s\S]*grid-template-columns:minmax\(0,1\.55fr\) minmax\(260px,\.85fr\)/,
  "priorities and change signals must form a compact bento row");

assert.match(css,/#evidencehub \.proof-summary-grid\{[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,
  "proof overview must stay visual and compact");
assert.match(css,/#propertyintelligence \.property-layout-v224\{[\s\S]*max-width:720px/,
  "Property calculator must remain bounded rather than expanding into a text-heavy page");

assert.doesNotMatch(css,/\.property-scenario-boundary[^}]*display\s*:\s*none/i,
  "Property professional-valuation boundary must remain visible");
assert.doesNotMatch(css,/\.notice[^}]*display\s*:\s*none/i,
  "workspace notices must not be blanket-hidden by the visual system");

console.log("PASS: V231 workspace uses the compact blue command-center hierarchy while preserving safety and drill-down boundaries.");
