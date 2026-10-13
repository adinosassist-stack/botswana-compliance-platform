import fs from "node:fs";
import assert from "node:assert/strict";

const workflow=fs.readFileSync(".github/workflows/client-runtime-identity-ci.yml","utf8");
const browserTest=fs.readFileSync("tests/v255-pricing-selector-browser.mjs","utf8");
const packageJson=JSON.parse(fs.readFileSync("package.json","utf8"));

assert.match(workflow,/node tests\/v246-spatial-dock-browser\.mjs[\s\S]*node tests\/v255-pricing-selector-browser\.mjs/,
  "PR Chromium CI must run the pricing browser gate after dock geometry");
assert.match(browserTest,/\{width:1200,height:1000\},\{width:390,height:844\}/,
  "pricing browser coverage must include desktop and 390px mobile");
assert.match(browserTest,/homepagePlans[\s\S]*Monitor[\s\S]*Protect[\s\S]*Control/,
  "homepage browser coverage must preserve the three direct-buy SME plans");
assert.match(browserTest,/verifyHomepage\(page,'http:\/\/localhost\/'\)/,
  "homepage acquisition pricing must be browser-tested");
assert.match(browserTest,/pricingPlans[\s\S]*Network[\s\S]*Partner/,
  "dedicated pricing browser coverage must preserve all five catalogue plans");
assert.match(browserTest,/verifyFullPricing\(page,'http:\/\/localhost\/pricing\/'\)/,
  "pricing page selector must be browser-tested");
assert.match(browserTest,/must default to Protect/,
  "browser gate must preserve the default Protect plan on full pricing");
assert.match(browserTest,/homepage must not restore the retired five-plan selector/,
  "browser gate must protect the simplified homepage acquisition contract");
assert.match(browserTest,/mobile pricing tabs must be horizontally scrollable/,
  "browser gate must protect mobile horizontal plan selection on full pricing");
assert(packageJson.scripts["test:release-regressions"].includes("tests/v255-pricing-browser-pr-gate.mjs"),
  "V255 pricing browser gate governance must remain in release regressions");

console.log("PASS: V255 keeps three-plan homepage acquisition and five-plan pricing selectors browser-tested before merge on desktop and mobile.");
