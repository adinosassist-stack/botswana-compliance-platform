import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync("public/index.html","utf8");
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
console.log("PASS: V304 authenticated workspace startup DOM contract is complete.");
