import fs from "node:fs";
import assert from "node:assert/strict";
const production=fs.readFileSync(new URL("../cloudflare/src/production-entry.js",import.meta.url),"utf8");
const active=["workspace-inline-styles-20260929b.css","workspace-command-center-v230.css","workspace-command-center-v231.css","workspace-home-density-v234.css","workspace-reference-shell-v237.css","workspace-home-command-v238.css"];
for(const asset of active)assert.ok(production.includes(asset),asset+" must remain production-referenced");
const dead=["workspace-inline-styles-20260921a.css","workspace-inline-styles-20260923a.css","workspace-inline-styles-20260924a.css","workspace-inline-styles-20260924b.css","workspace-inline-styles-20260926b.css","workspace-inline-styles-20260929a.css","workspace-ui-ux-10.css","workspace-visuals-20260930a.css"];
for(const asset of dead){
 assert.ok(!production.includes(asset),asset+" must not re-enter production routing");
 assert.ok(!fs.existsSync(new URL("../public/assets/"+asset,import.meta.url)),asset+" must stay deleted");
}
console.log("V237_DEAD_WORKSPACE_ASSETS_PASS");
