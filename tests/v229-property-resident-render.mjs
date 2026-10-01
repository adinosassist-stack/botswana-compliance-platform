import fs from "node:fs";
import assert from "node:assert/strict";

const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const shard=JSON.parse(fs.readFileSync("public/assets/workspace-view-fragments-20261001a-4.json","utf8"));
const property=String(shard.views?.propertyintelligence||"");

assert.match(property,/Compact Property Calculator/,"canonical Property fragment must still contain the compact calculator");
assert.match(production,/const propertyResident=id==="propertyintelligence";/,"production externalization must special-case Property as resident");
assert.match(production,/const placeholder=propertyResident\s*\?source\.slice\(match\.index,bounds\.end\)/s,"resident Property must preserve the full canonical section instead of replacing it with an empty lazy placeholder");
assert.match(production,/x-thebe-property-ui","v230-resident-visible-command-center"/,"workspace response must expose the resident Property release boundary");
assert.match(production,/for\(const id of WORKSPACE_LAZY_VIEW_IDS\)/,"other lazy workspace views must keep the existing externalization path");
assert.match(production,/data-lazy-view="1"/,"non-Property lazy views must retain lazy placeholders");

console.log("V229_PROPERTY_RESIDENT_RENDER_PASS");
