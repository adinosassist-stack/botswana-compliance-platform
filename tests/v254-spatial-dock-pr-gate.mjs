import fs from "node:fs";
import assert from "node:assert/strict";

const workflow=fs.readFileSync(".github/workflows/client-runtime-identity-ci.yml","utf8");
const browserTest=fs.readFileSync("tests/v246-spatial-dock-browser.mjs","utf8");
const packageJson=JSON.parse(fs.readFileSync("package.json","utf8"));

assert.match(workflow,/Verify unified goal flow and spatial dock geometry in Chromium/,
  "PR Chromium CI must explicitly own the spatial dock geometry gate");
assert.match(workflow,/node tests\/unified-goal-flow-browser\.mjs[\s\S]*node tests\/v246-spatial-dock-browser\.mjs/,
  "PR Chromium CI must run the dock browser test after the unified goal flow");
assert.match(browserTest,/new Map\(\[\[1440,272\],\[1200,272\],\[1199,256\],\[1180,256\],\[1024,256\]\]\)/,
  "normal dock browser coverage must straddle the V253 1199/1200 breakpoint");
assert.match(browserTest,/new Map\(\[\[1440,344\],\[1200,344\],\[1199,324\],\[1024,324\]\]\)/,
  "expanded dock browser coverage must straddle the V253 1199/1200 breakpoint");
assert.match(browserTest,/unexpected dock width at \$\{width\}/,
  "browser gate must assert actual normal dock width, not only non-overlap");
assert.match(browserTest,/unexpected expanded dock width at \$\{width\}/,
  "browser gate must assert actual expanded dock width, not only non-overlap");
assert(packageJson.scripts["test:release-regressions"].includes("tests/v254-spatial-dock-pr-gate.mjs"),
  "V254 PR browser gate governance must remain inside release regressions");

console.log("PASS: V254 moves spatial dock geometry into PR Chromium CI and protects the 1199/1200 breakpoint.");
