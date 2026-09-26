import assert from "node:assert/strict";
import fs from "node:fs";

const tip="055_v151_finance_watch_scheduler_isolation.sql";
const profile=JSON.parse(fs.readFileSync("RELEASE_PROFILE.json","utf8"));
const entry=fs.readFileSync("cloudflare/src/agentic-entry.js","utf8");
const deploy=fs.readFileSync("cloudflare/deploy-free.sh","utf8");
const readme=fs.readFileSync("cloudflare/README.md","utf8");
const launch=fs.readFileSync("docs/LAUNCH.md","utf8");

assert.equal(profile.latest_cloudflare_migration,tip);
assert.match(entry,new RegExp(tip.replaceAll(".","\\.")));
assert.match(deploy,new RegExp("Current reviewed schema delta: "+tip.replaceAll(".","\\.")));
assert.match(readme,new RegExp("through \`"+tip.replaceAll(".","\\.")+"\`"));
assert.match(launch,new RegExp("through \`"+tip.replaceAll(".","\\.")+"\`"));

for(const stale of [
  "apply only pending numbered migrations in order through 050",
  "apply only the pending release migrations in order through \`050_v115_manual_bank_subscriptions.sql\` before deploying the current Worker",
  "then apply migrations 047, 048, 049 and 050 in order"
]){
  assert.equal(readme.includes(stale)||launch.includes(stale),false,`stale launch migration guidance remains: ${stale}`);
}

console.log("v153 Cloudflare migration-tip coherence passed");
