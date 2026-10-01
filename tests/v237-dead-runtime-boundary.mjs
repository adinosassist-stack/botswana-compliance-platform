import fs from "node:fs";
import assert from "node:assert/strict";
const prod=fs.readFileSync(new URL("../cloudflare/src/production-entry.js",import.meta.url),"utf8");
const postdeploy=fs.readFileSync(new URL("../.github/workflows/client-runtime-postdeploy.yml",import.meta.url),"utf8");
assert.match(postdeploy,/node scripts\/production-property-live-proof\.mjs/,
 "post-deploy qualification must use the current Property transport proof");
for(const retired of ["property-view-v224.json","property-calculator-reference-v224.css","workspace-runtime-20261001a.js"]){
 assert.ok(!postdeploy.includes(retired),"post-deploy qualification must not fetch retired asset "+retired);
}
assert.ok(prod.includes('WORKSPACE_RUNTIME_ASSET="/js/workspace-runtime-20261001b.js"'));
for(const stale of ["20260922b","20260923a","20260923b","20260923c","20260923d","20260923e","20260923f","20260923g","20260923h","20260923i","20260923j","20260923l","20260923m","20260926b","20260929c","20261001a"]){
 assert.ok(!prod.includes("workspace-runtime-"+stale),"production must not reference stale runtime "+stale);
}
for(const css of ["thebe-ai-dock-v184-hotfix.css","workspace-command-center-v230.css","workspace-command-center-v231.css","workspace-home-density-v234.css","workspace-reference-shell-v237.css","workspace-home-command-v238.css"]){
 assert.ok(prod.includes(css),"dynamic production CSS dependency must remain: "+css);
}
console.log("V237_DEAD_RUNTIME_BOUNDARY_PASS");
