import fs from "node:fs";
import assert from "node:assert/strict";
const prod=fs.readFileSync(new URL("../cloudflare/src/production-entry.js",import.meta.url),"utf8");
assert.ok(prod.includes('WORKSPACE_RUNTIME_ASSET="/js/workspace-runtime-20261001b.js"'));
for(const stale of ["20260922b","20260923a","20260923b","20260923c","20260923d","20260923e","20260923f","20260923g","20260923h","20260923i","20260923j","20260923l","20260923m","20260926b","20260929c","20261001a"]){
 assert.ok(!prod.includes("workspace-runtime-"+stale),"production must not reference stale runtime "+stale);
}
for(const css of ["thebe-ai-dock-v184-hotfix.css","workspace-command-center-v230.css","workspace-command-center-v231.css","workspace-home-density-v234.css","workspace-reference-shell-v237.css","workspace-home-command-v238.css"]){
 assert.ok(prod.includes(css),"dynamic production CSS dependency must remain: "+css);
}
console.log("V237_DEAD_RUNTIME_BOUNDARY_PASS");
