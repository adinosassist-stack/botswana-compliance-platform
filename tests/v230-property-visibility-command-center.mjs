import fs from "node:fs";
import assert from "node:assert/strict";

const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const visibility=fs.readFileSync("public/js/property-visibility-v230.js","utf8");
const visibilityCss=fs.readFileSync("public/assets/property-visibility-v230.css","utf8");
const operationsCss=fs.readFileSync("public/assets/property-operations-v262.css","utf8");
const optimiseCss=fs.readFileSync("public/assets/property-optimise-v263.css","utf8");
const compareCss=fs.readFileSync("public/assets/property-compare-v264.css","utf8");
const commandCss=fs.readFileSync("public/assets/workspace-command-center-v230.css","utf8");

assert.ok(production.includes('const PROPERTY_VISIBILITY_CSS_ASSET="/assets/property-visibility-v230.css";'));
assert.match(production,/WORKSPACE_COMMAND_CENTER_CSS_ASSET="\/assets\/workspace-command-center-v230\.css"/);
assert.match(production,/PROPERTY_VISIBILITY_JS_ASSET="\/js\/property-visibility-v230\.js"/);
assert.match(production,/x-thebe-property-ui","v230-resident-visible-command-center"/);

assert.match(visibility,/const RELEASE="20261010-property-stable-v273"/);
assert.match(visibility,/thebe:workspace-view-change/);
assert.match(visibility,/propertyintelligence/);
assert.match(visibility,/function activatePropertyWorkspace\(\)/);
assert.match(visibility,/mountCompactPropertyChrome\(\)/);
assert.match(visibility,/ensureCompactObserver\(\)/);
assert.match(visibility,/updatePropertyWorkspace\(\)/);
assert.match(visibility,/property-calculator-v224/);
assert.match(visibility,/propertyPurchasePrice/);
assert.match(visibility,/propertyMonthlyRent/);
assert.doesNotMatch(visibility,/function repairNode\(/,
  "Property presentation must not repair visibility through imperative DOM style mutation");
assert.doesNotMatch(visibility,/function ensurePropertyVisible\(/,
  "Property presentation must not carry a second visibility-repair state machine");
assert.doesNotMatch(visibility,/setProperty\("display"[^\n]*"important"/,
  "Property presentation must not force inline display!important");
assert.doesNotMatch(visibility,/setTimeout\?\.\(\(\)=>\{[^\n]*(?:180|600)\)/,
  "Property activation must not depend on delayed repair passes");
assert.doesNotMatch(visibility,/requestAnimationFrame\?\.\(\(\)=>global\.requestAnimationFrame/,
  "Property activation must not depend on double-animation-frame visibility repair");
assert.doesNotMatch(visibility,/propertyVisibility=ok\?"ready":"repairing"/,
  "Property state must not expose a repairing visibility phase");
assert.doesNotMatch(visibility,/fetch\(|XMLHttpRequest|apiJson|method:"POST"/,
  "Property presentation code must not fetch or mutate application state directly");
assert.doesNotMatch(visibility,/\.innerHTML\s*=/,
  "Property presentation code must not bypass DOM-safety with native innerHTML assignments");

assert.match(visibilityCss,/V273 Property presentation contract/);
assert.match(visibilityCss,/#propertyintelligence\.view\{min-width:0\}/);
assert.match(visibilityCss,/#propertyintelligence\.view\.active\{visibility:visible;opacity:1\}/);
assert.match(visibilityCss,/#propertyintelligence\.view\.active :is\(\.property-layout-v224,\.property-calculator-v224\)\{min-width:0;max-width:100%\}/);
assert.doesNotMatch(visibilityCss,/#propertyintelligence\.view\.active\{[^}]*display:block!important/,
  "active Property visibility must come from the canonical view contract, not a force-show override");
assert.doesNotMatch(visibilityCss,/#propertyintelligence\.view\.active \.property-(?:layout|calculator)-v224\{[^}]*display:block!important/,
  "Property layout/calculator must not carry force-show CSS");
assert.ok(visibilityCss.includes("#propertyValuationServicePanel{")&&visibilityCss.includes("background:#f7fbff!important"));

assert.match(commandCss,/V230 command-center workspace rhythm/);
assert.match(commandCss,/#ownerCommandCentre \.owner-command-head p,[\s\S]*display:none!important/,
  "long explanatory copy should yield to compact command-center structure");
assert.match(commandCss,/\.owner-signal-list\{[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,
  "owner signals should read as a compact visual card grid");
assert.match(commandCss,/#dashboard \.home-status-strip\{[\s\S]*gap:8px/,
  "Home management status should remain a compact scan row");

// V264: compact Property modes cover operations, optimisation and user-entered asset comparison.
assert.match(visibility,/const COMPACT_RELEASE="20261003-property-workspace-v272"/);
assert.match(visibility,/const OPERATIONS_RELEASE="20261003-property-operations-v262"/);
assert.match(visibility,/const OPTIMISE_RELEASE="20261003-property-optimise-v263"/);
assert.match(visibility,/const COMPARE_RELEASE="20261003-property-compare-v264"/);
for(const [label,pane] of [["Today","today"],["Properties","properties"],["Analyse","analyse"],["Operations","operations"]]){
  assert.ok(visibility.includes(`compactButton("${label}","${pane}")`),`compact Property navigation missing ${label}`);
}
assert.match(visibility,/PROPERTY_PANES=new Set\(\["today","properties","analyse","operations","optimise","compare"\]\)/);
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

assert.match(visibility,/href=propertyAssetUrl\("\/assets\/property-operations-v262\.css"\)/);
assert.match(visibility,/property-operations-v262/);
assert.match(visibility,/Run the asset after acquisition/);
assert.match(visibility,/Tenant, payment, maintenance and expense records are not treated as live until those data sources are connected/);
assert.match(visibility,/Lease & tenant/);
assert.match(visibility,/Rent collection/);
assert.match(visibility,/Maintenance/);
assert.match(visibility,/Expenses/);
assert.match(visibility,/Connect data/);
assert.match(visibility,/openPropertyAiWithPrompt/);
assert.match(visibility,/operationsRelease:OPERATIONS_RELEASE/);
assert.match(visibility,/updateOperations:updatePropertyOperations/);
assert.match(visibility,/operationsMounted/);

assert.match(visibility,/href=propertyAssetUrl\("\/assets\/property-optimise-v263\.css"\)/);
assert.match(visibility,/property-optimise-v263/);
assert.match(visibility,/Improve the asset without inventing the data/);
assert.match(visibility,/Scenario support uses only current deal inputs/);
assert.match(visibility,/Rent review scenario/);
assert.match(visibility,/Adjust the assumption; this does not represent a market recommendation or live rent estimate/);
assert.match(visibility,/propertyOptimiseRentUplift/);
assert.match(visibility,/const targetRent=snapshot\.rent>0\?snapshot\.rent\*\(1\+uplift\/100\):0/);
assert.match(visibility,/const annualDelta=snapshot\.rent>0\?\(targetRent-snapshot\.rent\)\*12:NaN/);
assert.match(visibility,/const scenarioYield=snapshot\.price>0&&targetRent>0\?\(targetRent\*12\/snapshot\.price\)\*100:0/);
assert.match(visibility,/Refinance/);
assert.match(visibility,/Connect debt data/);
assert.match(visibility,/Capex/);
assert.match(visibility,/Add capex budget/);
assert.match(visibility,/Hold \/ sell/);
assert.match(visibility,/Add valuation \+ costs/);
assert.match(visibility,/without choosing an outcome for me/);
assert.match(visibility,/optimiseRelease:OPTIMISE_RELEASE/);
assert.match(visibility,/updateOptimise:updatePropertyOptimise/);
assert.match(visibility,/optimiseMounted/);

assert.match(visibility,/href=propertyAssetUrl\("\/assets\/property-compare-v264\.css"\)/);
assert.match(visibility,/property-compare-v264/);
assert.match(visibility,/Compare assets without fabricated comparables/);
assert.match(visibility,/this is not a live market feed or investment recommendation/);
assert.match(visibility,/propertyCompareBPrice/);
assert.match(visibility,/propertyCompareBRent/);
assert.match(visibility,/propertyCompareCPrice/);
assert.match(visibility,/propertyCompareCRent/);
assert.match(visibility,/const grossYield=price>0&&rent>0\?\(rent\*12\/price\)\*100:0/);
assert.match(visibility,/Lowest entered price/);
assert.match(visibility,/Highest entered rent/);
assert.match(visibility,/Highest entered gross yield/);
assert.match(visibility,/do not choose an investment outcome for me/);
assert.match(visibility,/compareRelease:COMPARE_RELEASE/);
assert.match(visibility,/updateCompare:updatePropertyCompare/);
assert.match(visibility,/compareMounted/);

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

assert.match(operationsCss,/V262 Property Operations/);
assert.match(operationsCss,/\.property-operations-v262/);
assert.match(operationsCss,/\.property-ops-metrics-v262\{[\s\S]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
assert.match(operationsCss,/\.property-ops-grid-v262\{[\s\S]*grid-template-columns:220px minmax\(0,1fr\)/);
assert.match(operationsCss,/\.property-ops-ring-v262/);
assert.match(operationsCss,/conic-gradient/);
assert.match(operationsCss,/data-property-active-pane="operations"/);
assert.match(operationsCss,/@media\(max-width:760px\)/);
assert.match(operationsCss,/@media\(max-width:420px\)/);

assert.match(optimiseCss,/V263 Property Optimise/);
assert.match(optimiseCss,/data-property-active-pane="optimise"/);
assert.match(optimiseCss,/\.property-optimise-v263/);
assert.match(optimiseCss,/\.property-opt-metrics-v263\{[\s\S]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
assert.match(optimiseCss,/\.property-opt-grid-v263\{[\s\S]*grid-template-columns:230px minmax\(0,1fr\)\)/);
assert.match(optimiseCss,/\.property-opt-levers-v263\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(optimiseCss,/@media\(max-width:760px\)/);
assert.match(optimiseCss,/@media\(max-width:480px\)/);

assert.match(compareCss,/V264 Property Compare/);
assert.match(compareCss,/data-property-active-pane="compare"/);
assert.match(compareCss,/\.property-compare-v264/);
assert.match(compareCss,/\.property-compare-candidates-v264\{[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
assert.match(compareCss,/\.property-compare-row-v264\{[\s\S]*grid-template-columns:minmax\(110px,1\.15fr\) repeat\(3,minmax\(0,1fr\)\)/);
assert.match(compareCss,/\.property-compare-signals-v264\{[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
assert.match(compareCss,/@media\(max-width:760px\)/);
assert.match(compareCss,/@media\(max-width:480px\)/);
assert.match(compareCss,/overflow-wrap:anywhere/);

console.log("PASS: Property uses deterministic activation with no presentation repair loop, while preserving compact modes, truthful Operations and Optimise, input-driven Compare, and grounded full-screen Property AI.");
