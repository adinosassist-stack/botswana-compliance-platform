import fs from "node:fs";
import assert from "node:assert/strict";

const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const runtime=fs.readFileSync("public/js/workspace-runtime-20261001b.js","utf8");
const shard=JSON.parse(fs.readFileSync("public/assets/workspace-view-fragments-20261001a-4.json","utf8"));
const property=String(shard.views?.propertyintelligence||"");

assert.ok(production.includes('const WORKSPACE_RUNTIME_ASSET="/js/workspace-runtime-20261001b.js";'),"V226 must rotate the workspace runtime asset");
assert.ok(production.includes('const WORKSPACE_RUNTIME_RELEASE="20261001-property-command-center-v231";'),"V226 runtime release identity missing");
for(const source of [production,runtime]){
  assert.ok(source.includes('const PROPERTY_VIEW_FRAGMENT_ASSET="/assets/workspace-view-fragments-20261001a-4.json?v=20261001-property-visibility-v226";'),"Property must use the proven shared fragment transport with a fresh cache identity");
  assert.ok(source.includes('const cacheKey=propertyView?"property-v226":String(shard);'),"Property fragment cache must rotate for V226");
  assert.ok(!source.includes('const PROPERTY_VIEW_FRAGMENT_ASSET="/assets/property-view-v224.json";'),"V226 must not depend on the dedicated V224 Property fragment");
}
assert.equal(shard.schema,2);
assert.equal(shard.shard,4);
assert.match(property,/Compact Property Calculator/,"shared shard must contain the visible compact calculator");
assert.match(property,/property-calculator-v224/,"shared shard must retain the V224 compact design");
assert.match(property,/id="propertyPurchasePrice"/,"purchase-price input must be present");
assert.match(property,/id="propertyMonthlyRent"/,"monthly-rent input must be present");
assert.match(property,/property-analyse-button/,"primary Analyze action must be present");
assert.match(property,/id="propertyDealResults"/,"calculator results surface must be present");
assert.match(property,/not a professional property valuation/,"valuation boundary must remain explicit");

console.log("V226_PROPERTY_CALCULATOR_VISIBILITY_PASS");
