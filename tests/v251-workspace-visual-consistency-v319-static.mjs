import assert from "node:assert/strict";
import fs from "node:fs";

const readiness=fs.readFileSync("public/js/workspace-readiness-v305.js","utf8");
const css=fs.readFileSync("public/assets/workspace-visual-consistency-v319.css","utf8");

assert.match(readiness,/thebe-workspace-visual-consistency-v319/,"workspace readiness must install the v319 visual-consistency stylesheet once");
assert.match(readiness,/workspace-visual-consistency-v319\.css\?v=20261015a/,"workspace readiness must load the versioned v319 stylesheet");
assert.match(readiness,/data(?:set)?\.workspaceOnly|dataset\.workspaceOnly/,"workspace visual layer must remain explicitly workspace-scoped");

for(const selector of [
  ".ops-visual-brief",
  ".risk-severity-visual",
  ".control-health-visual",
  ".evidence-integrity-flow",
  ".notification-radar",
  ".ai-scope-visual",
  ".property-valuation-pipeline",
  ".employee-directory-shell"
]){
  assert.ok(css.includes(selector),`v319 visual consistency must cover ${selector}`);
}

assert.match(css,/body\.thebe-ai-dock-open/,"visual rhythm must account for dock-open workspace width");
assert.match(css,/@media \(max-width:900px\)/,"visual consistency must include bounded narrow-layout treatment");
assert.doesNotMatch(css,/linear-gradient|radial-gradient/,"workspace visual consistency must preserve the no-gradient design rule");

console.log("v251 workspace visual consistency v319 static checks passed");
