import fs from "node:fs";
import assert from "node:assert/strict";

const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const css=fs.readFileSync("public/assets/property-calculator-compact-v223.css","utf8");
const shard=JSON.parse(fs.readFileSync("public/assets/workspace-view-fragments-20261001a-4.json","utf8"));
const property=String(shard.views?.propertyintelligence||"");
const workspaceRuntimeAsset=production.match(/const WORKSPACE_RUNTIME_ASSET="([^"]+)";/)?.[1]||"";
assert.match(workspaceRuntimeAsset,/^\/js\/workspace-runtime-[a-z0-9.-]+\.js$/i,"workspace runtime identity must stay versioned and first-party");
const runtime=fs.readFileSync(`public${workspaceRuntimeAsset}`,"utf8");

assert.ok(production.includes('const PROPERTY_COMPACT_CSS_ASSET="/assets/property-calculator-compact-v223.css";'),"workspace must use an immutable V223 Property density asset");
assert.ok(production.includes('if(!source.includes(PROPERTY_COMPACT_CSS_ASSET))source=injectBeforeFinalClosingTag(source,"head"'),"workspace shell must inject the compact Property density asset");
assert.match(property,/property-calculator-compact/,"Property deal calculator must retain its compact root");
assert.match(property,/property-scenario-comparison/,"saved-scenario comparison must remain available");
assert.match(runtime,/property-scenario-compare-grid/,"saved scenarios must still render their comparison grid dynamically");
assert.match(css,/\.property-calculator-compact \.property-scenario-comparison:not\(:has\(\.property-scenario-compare-grid\)\)\{display:none\}/,"empty saved-scenario chrome must not consume default calculator height");
assert.match(css,/\.property-calculator-compact \.property-core-grid\{gap:8px\}/,"core deal inputs must use the tighter V223 spacing");
assert.match(css,/\.property-calculator-compact \.property-advanced-details\{margin-top:8px\}/,"collapsed assumptions must stay close to the core inputs");
assert.doesNotMatch(css,/display:none[^\n]*property-core-grid|property-core-grid[^\n]*display:none/,"core deal inputs must remain visible");

console.log("V223_PROPERTY_CALCULATOR_DENSITY_PASS");
