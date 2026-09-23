import assert from "node:assert/strict";
import fs from "node:fs";

const production=fs.readFileSync("cloudflare/src/production-entry.js","utf8");
const inbound=fs.readFileSync("cloudflare/src/whatsapp-inbound-core.js","utf8");
const apiClient=fs.readFileSync("public/js/api-client.js","utf8");
const governance=fs.readFileSync("cloudflare/src/release-governance-entry.js","utf8");
const html=fs.readFileSync("public/index.html","utf8");
const delegation=fs.readFileSync("public/js/event-delegation.js","utf8");

const obsoleteRuntimes=[
  "20260921a","20260921b","20260921c","20260921d","20260921e","20260921f","20260922a","20260923k"
].map(v=>`public/js/workspace-runtime-${v}.js`);
for(const path of obsoleteRuntimes)assert.equal(fs.existsSync(path),false,`obsolete runtime must stay deleted: ${path}`);

for(const version of ["20260921b","20260921c"]){
  for(let i=0;i<12;i++){
    const path=`public/assets/workspace-view-fragments-${version}-${i}.json`;
    assert.equal(fs.existsSync(path),false,`obsolete fragment shard must stay deleted: ${path}`);
  }
}

assert.ok(fs.existsSync("public/js/workspace-runtime-20260923l.js"));
for(let i=0;i<12;i++)assert.ok(fs.existsSync(`public/assets/workspace-view-fragments-20260923f-${i}.json`));
assert.match(production,/WORKSPACE_RUNTIME_ASSET="\/js\/workspace-runtime-20260923l\.js"/);
assert.match(production,/WORKSPACE_VIEW_FRAGMENT_PREFIX="\/assets\/workspace-view-fragments-20260923f-"/);

assert.doesNotMatch(inbound,/intent\.kind==="unavailable"&&intent\.reason==="receivables"/);
assert.doesNotMatch(inbound,/production Finance Core does not have an authoritative invoices\/receivables ledger/);

assert.ok(fs.existsSync("public/js/owner-whatsapp-prepare.js"),"indirectly loaded owner WhatsApp UI is live code");
assert.match(apiClient,/\/js\/owner-whatsapp-prepare\.js/);
assert.ok(fs.existsSync("public/js/surface-boundaries.js"),"release-governed surface boundary runtime is live code");
assert.match(governance,/\/js\/surface-boundaries\.js/);

// Literal workspace buttons must resolve to delegated handlers, and literal data-view targets must exist.
const actionNames=[...html.matchAll(/data-bw-onclick="([^"]+)"/g)]
  .map(m=>(String(m[1]).match(/^\s*([A-Za-z_$][\w$]*)\s*\(/)||[])[1])
  .filter(Boolean)
  .filter(name=>name!=="if");
for(const name of new Set(actionNames))assert.ok(delegation.includes("'"+name+"'"),"workspace action is not delegated: "+name);
const literalViews=[...new Set([...html.matchAll(/data-view="([A-Za-z0-9_-]+)"/g)].map(m=>m[1]))];
for(const view of literalViews)assert.ok(html.includes('id="'+view+'"')||html.includes("id='"+view+"'"),"workspace navigation target missing: "+view);

console.log("v110 dead-code boundary: obsolete assets absent, indirect live modules preserved PASS");
