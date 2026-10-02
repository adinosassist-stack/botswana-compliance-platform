import fs from "node:fs";
import assert from "node:assert/strict";

const workflow=fs.readFileSync(".github/workflows/client-runtime-identity-ci.yml","utf8");
const browserTest=fs.readFileSync("tests/v255-pricing-selector-browser.mjs","utf8");
const packageJson=JSON.parse(fs.readFileSync("package.json","utf8"));

assert.match(workflow,/node tests\/v246-spatial-dock-browser\.mjs[\s\S]*node tests\/v255-pricing-selector-browser\.mjs/,
  "PR Chromium CI must run the pricing browser gate after dock geometry");
assert.match(browserTest,/\{width:1200,height:1000\},\{width:390,height:844\}/,
  "pricing browser coverage must include desktop and 390px mobile");
assert.match(browserTest,/url:'http:\/\/localhost\/'[\s\S]*homeRadio[\s\S]*homePanel/,
  "homepage pricing selector must be browser-tested");
assert.match(browserTest,/url:'http:\/\/localhost\/pricing\/'[\s\S]*pricingRadio[\s\S]*pricingPanel/,
  "pricing page selector must be browser-tested");
assert.match(browserTest,/must default to Protect/,
  "browser gate must preserve the default Protect plan");
assert.match(browserTest,/mobile pricing tabs must be horizontally scrollable/,
  "browser gate must protect mobile horizontal plan selection");
assert(packageJson.scripts["test:release-regressions"].includes("tests/v255-pricing-browser-pr-gate.mjs"),
  "V255 pricing browser gate governance must remain in release regressions");

console.log("PASS: V255 keeps homepage and pricing selectors browser-tested before merge on desktop and mobile.");
