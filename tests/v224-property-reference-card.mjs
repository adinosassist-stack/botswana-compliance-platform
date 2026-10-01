import fs from "node:fs";
import assert from "node:assert/strict";

const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const runtime=fs.readFileSync("public/js/workspace-runtime-20261001b.js","utf8");
const owner=fs.readFileSync("public/js/owner-command-centre.js","utf8");
const css=fs.readFileSync("public/assets/property-calculator-reference-v224.css","utf8");
const payload=JSON.parse(fs.readFileSync("public/assets/workspace-view-fragments-20261001a-4.json","utf8"));
const property=String(payload.views?.propertyintelligence||"");

assert.ok(production.includes('const WORKSPACE_RUNTIME_ASSET="/js/workspace-runtime-20261001b.js";'),"V224 compact design successor must use the V225 workspace runtime asset");
assert.ok(production.includes('const WORKSPACE_RUNTIME_RELEASE="20261001-property-visibility-v226";'),"V224 compact design successor must carry the V225 visibility release identity");
assert.ok(production.includes('const PROPERTY_REFERENCE_CSS_ASSET="/assets/property-calculator-reference-v224.css";'),"V224 compact reference stylesheet missing");
assert.ok(production.includes('if(!source.includes(PROPERTY_REFERENCE_CSS_ASSET))source=injectBeforeFinalClosingTag(source,"head"'),"workspace shell must inject V224 reference stylesheet");
assert.ok(production.includes('headers.set("cache-control","no-store")')&&production.includes('headers.set("x-thebe-property-ui","v224-reference-card")'),"workspace document must expose the V224 freshness boundary");

for(const source of [production,runtime]){
  assert.ok(source.includes('const PROPERTY_VIEW_FRAGMENT_ASSET="/assets/workspace-view-fragments-20261001a-4.json?v=20261001-property-visibility-v226";'),"Property must use the proven shared fragment transport in the V226 successor");
  assert.ok(source.includes('const cacheKey=propertyView?"property-v226":String(shard);'),"Property fragment cache must be isolated and rotated for V225");
  assert.ok(source.includes('propertyView?PROPERTY_VIEW_FRAGMENT_ASSET:WORKSPACE_VIEW_FRAGMENT_PREFIX+shard+".json"'),"Property must retain explicit fragment routing");
}

assert.equal(payload.schema,2);
assert.equal(payload.shard,4);
assert.match(property,/property-calculator-v224/,"Property must expose the V224 compact card");
assert.match(property,/Compact Property Calculator/,"the compact calculator must be visibly identifiable");
assert.match(property,/property-quick-rows/,"core assumptions must use compact row controls");
assert.match(property,/property-input-pair/,"secondary core inputs must use the reference-style paired row");
assert.match(property,/property-analyse-button/,"Analyze must be the single primary calculator action");
assert.match(property,/id="propertyDealResults" class="property-results property-results-v224"/,"results must render inside the compact calculator");
assert.ok(property.indexOf("property-analyse-button")<property.indexOf('id="propertyDealResults"'),"results must follow Analyze inside the same calculator flow");
for(const id of ["propertyDealName","propertyPurchasePrice","propertyMonthlyRent","propertyDeposit","propertyInterestRate","propertyVacancy","propertyOperatingCosts","propertyAcquisitionCosts","propertyLoanYears","propertyAppreciation"])assert.match(property,new RegExp('id="'+id+'"'),"V224 Property input missing "+id);
assert.match(property,/not a professional property valuation/,"professional valuation boundary must remain explicit");

assert.match(css,/\.property-layout-v224\{display:block;max-width:680px;margin:0 auto\}/,"V224 calculator must use one bounded compact card");
assert.match(css,/\.property-input-row\{[^}]*display:flex;align-items:center;justify-content:space-between/,"input rows must use label-left/value-right layout");
assert.match(css,/\.property-analyse-button\{width:100%;min-height:44px/,"Analyze action must be full width");
assert.match(css,/\.property-result-grid-v224 \.property-metric\{min-height:64px/,"headline results must remain compact");

const calcStart=runtime.indexOf("function calculatePropertyDeal()");
const calcEnd=runtime.indexOf("function resetPropertyDeal()",calcStart);
assert.ok(calcStart>0&&calcEnd>calcStart,"V224 calculator runtime bounds missing");
const calc=runtime.slice(calcStart,calcEnd);
for(const label of ["Gross rental yield","Annual cash flow","DSCR","Cash-on-cash return"])assert.ok(calc.includes(label),"headline result missing "+label);
const detailsAt=calc.indexOf('<details class="property-analysis-details">');
const portfolioAt=calc.indexOf('propertyPortfolioImpactHtml(x)');
assert.ok(detailsAt>=0&&portfolioAt>detailsAt,"portfolio impact must move behind Full analysis");
assert.match(runtime,/Purchase price is <b>not<\/b> added to recorded professional portfolio value/,"scenario purchase price must never become professional value");
assert.match(runtime,/Treat this as scenario analysis, not a valuation or investment recommendation/,"Thebe handoff boundary must remain intact");

assert.ok(owner.includes("view.insertBefore(shell,scenario.nextSibling);"),"canonical portfolio must render after the compact calculator");
assert.ok(!owner.includes("view.insertBefore(shell,scenario);"),"portfolio must no longer push the calculator below the first screen");

console.log("V224_PROPERTY_REFERENCE_CARD_PASS");
