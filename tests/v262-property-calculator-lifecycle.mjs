import fs from "node:fs";
import assert from "node:assert/strict";

const visibility=fs.readFileSync("public/js/property-visibility-v230.js","utf8");
const css=fs.readFileSync("public/assets/property-calculator-reference-v224.css","utf8");
const runtime=fs.readFileSync("public/js/workspace-runtime-20261001b.js","utf8");

assert.match(visibility,/20261003-property-compact-lifecycle-v262/,"Property visibility repair must expose the V262 lifecycle identity");
assert.doesNotMatch(visibility,/style\.setProperty\("(?:width|max-width|min-width|margin-inline)"/,"visibility recovery must not pin responsive geometry with inline styles");
assert.match(css,/\.property-layout-v224\{display:block;width:min\(100%,680px\);max-width:100%;min-width:0/,"calculator shell must be shrink-safe on desktop");
assert.match(css,/@media\(max-width:620px\)[\s\S]*\.property-layout-v224\{width:100%;max-width:100%;margin:0\}/,"calculator must use the full available mobile width");
assert.match(css,/@media\(max-width:390px\)[\s\S]*\.property-result-grid-v224\{grid-template-columns:1fr!important\}/,"narrow mobile results must collapse to one column");
for(const fn of ["calculatePropertyDeal","savePropertyScenario","resetPropertyDeal"])assert.ok(runtime.includes(`function ${fn}(`),`calculator action ${fn} must remain wired`);
assert.match(runtime,/monthlyDebt=loan<=0\?0:\(monthlyRate===0\?loan\/totalPayments:loan\*monthlyRate\/\(1-Math\.pow\(1\+monthlyRate,-totalPayments\)\)\)/,"amortising debt-service formula must remain intact");
assert.match(runtime,/dscr=annualDebt>0\?noi\/annualDebt:NaN/,"DSCR must remain NOI divided by annual debt service");
assert.match(runtime,/breakEven=annualScheduledRent>0\?\(operating\+annualDebt\)\/annualScheduledRent\*100:NaN/,"break-even occupancy must remain cost plus debt service over scheduled rent");
console.log("V262_PROPERTY_CALCULATOR_LIFECYCLE_PASS");
