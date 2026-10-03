import fs from "node:fs";
import assert from "node:assert/strict";

const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const visibility=fs.readFileSync("public/js/property-visibility-v230.js","utf8");
const visibilityCss=fs.readFileSync("public/assets/property-visibility-v230.css","utf8");
const commandCss=fs.readFileSync("public/assets/workspace-command-center-v230.css","utf8");

assert.ok(production.includes('const PROPERTY_VISIBILITY_CSS_ASSET="/assets/property-visibility-v230.css";'));
assert.ok(production.includes('const PROPERTY_VISIBILITY_CSS_ASSET="/assets/property-visibility-v230.css";'));
assert.match(production,/WORKSPACE_COMMAND_CENTER_CSS_ASSET="\/assets\/workspace-command-center-v230\.css"/);
assert.match(production,/PROPERTY_VISIBILITY_JS_ASSET="\/js\/property-visibility-v230\.js"/);
assert.match(production,/x-thebe-property-ui","v230-resident-visible-command-center"/);

assert.match(visibility,/const RELEASE="20261001-property-visible-v230"/);
assert.match(visibility,/thebe:workspace-view-change/);
assert.match(visibility,/propertyintelligence/);
assert.match(visibility,/view\.classList\.contains\("active"\)/);
assert.match(visibility,/property-calculator-v224/);
assert.match(visibility,/propertyPurchasePrice/);
assert.match(visibility,/propertyMonthlyRent/);
assert.match(visibility,/property-analyse-button/);
assert.match(visibility,/view\.dataset\.propertyVisibility=ok\?"ready":"repairing"/);
assert.doesNotMatch(visibility,/fetch\(|XMLHttpRequest|apiJson|method:"POST"/,
  "Property visibility repair must be presentation-only and never mutate or fetch application state");

assert.match(visibilityCss,/#propertyintelligence\.view\.active\{/);
assert.match(visibilityCss,/\.property-layout-v224\{[\s\S]*display:block!important/);
assert.match(visibilityCss,/\.property-calculator-v224\{[\s\S]*display:block!important/);
assert.match(visibilityCss,/\.property-analyse-button\{display:block!important\}/);
assert.ok(visibilityCss.includes("#propertyValuationServicePanel{")&&visibilityCss.includes("background:#f7fbff!important"));

assert.match(commandCss,/V230 command-center workspace rhythm/);
assert.match(commandCss,/#ownerCommandCentre \.owner-command-head p,[\s\S]*display:none!important/,
  "long explanatory copy should yield to compact command-center structure");
assert.match(commandCss,/\.owner-signal-list\{[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,
  "owner signals should read as a compact visual card grid");
assert.match(commandCss,/#dashboard \.home-status-strip\{[\s\S]*gap:8px/,
  "Home management status should remain a compact scan row");

// V261: Property behaves as a focused product workspace, while Property AI remains grounded and full-screen.
assert.match(visibility,/const COMPACT_RELEASE="20261003-property-workspace-v261"/);
for(const [label,pane] of [["Today","today"],["Properties","properties"],["Analyse","analyse"],["Operations","operations"]]){
  assert.ok(visibility.includes(`compactButton("${label}","${pane}")`),`compact Property navigation missing ${label}`);
}
assert.match(visibility,/PROPERTY_PANES=new Set\(\["today","properties","analyse","operations"\]\)/);
assert.match(visibility,/view\.dataset\.propertyActivePane=pane/);
assert.match(visibility,/property-overview-v261/);
assert.match(visibility,/Gross annual yield/);
assert.match(visibility,/snapshot\.grossYield/);
assert.match(visibility,/propertyPortfolioWorkspace/);
assert.match(visibility,/propertyValuationServicePanel/);
assert.match(visibility,/property-ai-fullscreen-v260/);
assert.match(visibility,/property-ai-toolbar-v260/);
assert.match(visibility,/aiAdvisorQuestion/);
assert.match(visibility,/aiAdvisorOutput/);
assert.match(visibility,/New Property AI chat/);
assert.match(visibility,/Open voice/);
assert.match(visibility,/setPane:setPropertyPane/);
assert.match(visibility,/updateOverview:updatePropertyOverview/);

assert.match(visibilityCss,/#propertyintelligence\.property-compact-v260/);
assert.match(visibilityCss,/\.property-primary-v260/);
assert.match(visibilityCss,/data-property-active-pane="today"/);
assert.match(visibilityCss,/\.property-overview-v261/);
assert.match(visibilityCss,/\.property-yield-ring-v261/);
assert.match(visibilityCss,/conic-gradient/);
assert.match(visibilityCss,/overflow-wrap:anywhere/);
assert.match(visibilityCss,/body\.property-ai-fullscreen-v260 #aiservices\.view\.active/);
assert.match(visibilityCss,/100dvh/);
assert.match(visibilityCss,/#aiAdvisorQuestion/);
assert.match(visibilityCss,/\.copilot-compose/);
assert.match(visibilityCss,/env\(safe-area-inset-bottom\)/);

console.log("PASS: V261 keeps Property compact and visible, adds focused workspace modes with a live yield overview, hardens overflow, and preserves full-screen grounded Property AI.");
