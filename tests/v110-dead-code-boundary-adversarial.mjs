import assert from "node:assert/strict";
import fs from "node:fs";

const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const inbound=fs.readFileSync("cloudflare/src/whatsapp-inbound-core.js","utf8");
const apiClient=fs.readFileSync("public/js/api-client.js","utf8");
const governance=fs.readFileSync("cloudflare/src/release-governance-entry.js","utf8");

const obsoleteRuntimes=[
  "20260921a","20260921b","20260921c","20260921d","20260921e","20260921f","20260922a"
].map(v=>`public/js/workspace-runtime-${v}.js`);
for(const path of obsoleteRuntimes)assert.equal(fs.existsSync(path),false,`obsolete runtime must stay deleted: ${path}`);

for(const version of ["20260921b","20260921c"]){
  for(let i=0;i<12;i++){
    const path=`public/assets/workspace-view-fragments-${version}-${i}.json`;
    assert.equal(fs.existsSync(path),false,`obsolete fragment shard must stay deleted: ${path}`);
  }
}

assert.ok(fs.existsSync("public/js/workspace-runtime-20260923a.js"));
for(let i=0;i<12;i++)assert.ok(fs.existsSync(`public/assets/workspace-view-fragments-20260921d-${i}.json`));
assert.match(production,/WORKSPACE_RUNTIME_ASSET="\/js\/workspace-runtime-20260923a\.js"/);
assert.match(production,/WORKSPACE_VIEW_FRAGMENT_PREFIX="\/assets\/workspace-view-fragments-20260921d-"/);

assert.doesNotMatch(inbound,/intent\.kind==="unavailable"&&intent\.reason==="receivables"/);
assert.doesNotMatch(inbound,/production Finance Core does not have an authoritative invoices\/receivables ledger/);

assert.ok(fs.existsSync("public/js/owner-whatsapp-prepare.js"),"indirectly loaded owner WhatsApp UI is live code");
assert.match(apiClient,/\/js\/owner-whatsapp-prepare\.js/);
assert.ok(fs.existsSync("public/js/surface-boundaries.js"),"release-governed surface boundary runtime is live code");
assert.match(governance,/\/js\/surface-boundaries\.js/);

console.log("v110 dead-code boundary: obsolete assets absent, indirect live modules preserved PASS");
