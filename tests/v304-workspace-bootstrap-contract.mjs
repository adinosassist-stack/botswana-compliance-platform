import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync("public/index.html","utf8");
const runtime=fs.readFileSync("public/js/workspace-runtime-20261001b.js","utf8");

const bootstrapTargets=[
  "companyHero",
  "complianceScore",
  "protectionScore",
  "complianceBar",
  "protectionBar",
  "openActions",
  "navAlerts",
  "evidenceCoverage",
  "priorityList",
  "areaScores"
];

const missing=bootstrapTargets.filter(id=>!html.includes(`id="${id}"`)&&!html.includes(`id='${id}'`));
console.log("V304 bootstrap DOM contract",JSON.stringify({missing,present:bootstrapTargets.filter(id=>!missing.includes(id))}));
assert.deepEqual(missing,[],`workspace bootstrap runtime targets missing from authored shell: ${missing.join(", ")}`);

for(const id of bootstrapTargets){
  assert.ok(runtime.includes(`getElementById("${id}")`)||runtime.includes(`getElementById('${id}')`),`runtime bootstrap target is no longer referenced: ${id}`);
}

console.log("PASS: V304 authenticated workspace startup DOM contract is complete.");
