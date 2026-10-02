import fs from "node:fs";
import assert from "node:assert/strict";

const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const visibility=fs.readFileSync("public/js/property-visibility-v230.js","utf8");
const visibilityCss=fs.readFileSync("public/assets/property-visibility-v230.css","utf8");
const commandCss=fs.readFileSync("public/assets/workspace-command-center-v230.css","utf8");

assert.match(production,/PROPERTY_VISIBILITY_CSS_ASSET="\\/assets\\/property-visibility-v230\\.css"/);
assert.match(production,/propertyVisibilityCssHref=`\\$\\{PROPERTY_VISIBILITY_CSS_ASSET\\}\\?v=20261002-v250`/);
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
assert.match(visibilityCss,/#propertyValuationServicePanel\{[\\s\\S]*background:#f7fbff!important/);

assert.match(commandCss,/V230 command-center workspace rhythm/);
assert.match(commandCss,/#ownerCommandCentre \.owner-command-head p,[\s\S]*display:none!important/,
  "long explanatory copy should yield to compact command-center structure");
assert.match(commandCss,/\.owner-signal-list\{[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/,
  "owner signals should read as a compact visual card grid");
assert.match(commandCss,/#dashboard \.home-status-strip\{[\s\S]*gap:8px/,
  "Home management status should remain a compact scan row");

console.log("PASS: V230 keeps resident Property visibly usable and moves Home/Owner surfaces toward a compact command-center layout.");
