import fs from "node:fs";
import assert from "node:assert/strict";

const runtime=fs.readFileSync("public/js/workspace-runtime-20260929c.js","utf8");
const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const html=fs.readFileSync("public/index.html","utf8");
const shard=JSON.parse(fs.readFileSync("public/assets/workspace-view-fragments-20261001a-4.json","utf8"));
const budget=fs.readFileSync("scripts/bundle-budget.mjs","utf8");

const fresh='const WORKSPACE_VIEW_FRAGMENT_PREFIX="/assets/workspace-view-fragments-20261001a-";';
assert.ok(runtime.includes(fresh),"runtime must request the fresh immutable fragment generation");
assert.ok(production.includes(fresh),"production shell must advertise the same fragment generation");
assert.ok(production.includes('const WORKSPACE_RUNTIME_RELEASE="20261001-property-reference-card-v224";'),"runtime query identity must rotate with the latest Property delivery boundary");
assert.ok(production.includes('const WORKSPACE_RUNTIME_ASSET="/js/workspace-runtime-20261001a.js";'),"production must rotate the physical workspace runtime asset for V224");
assert.ok(html.includes(fresh),"canonical inline runtime must match the fresh fragment generation");
assert.ok(budget.includes("workspace-view-fragments-20261001a-"),"bundle budget must verify the deployed fragment generation");

const property=String(shard.views?.propertyintelligence||"");
assert.match(property,/property-calculator-compact/,"fresh Property shard must contain the compact calculator");
assert.match(property,/property-core-grid/,"fresh Property shard must keep the core deal inputs compact");
assert.match(property,/<details class="property-advanced-details">/,"secondary assumptions must remain collapsed");
assert.match(property,/Price \+ rent first\./,"fresh Property shard must contain the compact empty state");

assert.ok(!runtime.includes("/assets/workspace-view-fragments-20260929g-"),"runtime must not request the stale immutable fragment generation");
assert.ok(!production.includes("/assets/workspace-view-fragments-20260929g-"),"production shell must not inject the stale immutable fragment generation");

console.log("V222_PROPERTY_FRAGMENT_CACHE_BOUNDARY_PASS");
