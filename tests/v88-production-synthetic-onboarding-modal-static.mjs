import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("scripts/production-synthetic-browser-wrapper.mjs","utf8");
const helperStart=source.indexOf("async function dismissOnboardingIfOpen");
const helperEnd=source.indexOf("async function loginInBrowser",helperStart);
const helper=source.slice(helperStart,helperEnd);

assert.ok(helperStart>=0&&helperEnd>helperStart,"synthetic onboarding helper must exist");
assert.match(source,/ONBOARDING_APPEAR_TIMEOUT_MS=2500/,"onboarding appearance check must be bounded");
assert.match(source,/ONBOARDING_DISMISS_TIMEOUT_MS=5000/,"onboarding dismissal must be bounded");
assert.match(helper,/page\.locator\('#onboardModal'\)/,"synthetic proof must target the canonical onboarding modal");
assert.match(helper,/getByRole\('button',\{name:'Finish later',exact:true\}\)/,"synthetic proof must use the real Finish later action");
assert.match(helper,/first protection check/i,"synthetic proof must verify the expected Quick start modal before dismissing it");
assert.match(helper,/finishLater\.click\(\{timeout:ONBOARDING_DISMISS_TIMEOUT_MS\}\)/,"onboarding must be dismissed through a real browser click");
assert.match(helper,/modal\.waitFor\(\{state:'hidden',timeout:ONBOARDING_DISMISS_TIMEOUT_MS\}\)/,"synthetic proof must confirm the modal actually closes");
assert.doesNotMatch(helper,/page\.evaluate|dismissOnboarding\(\)/,"synthetic proof must not bypass onboarding through direct page code");
assert.match(source,/await dismissOnboardingIfOpen\(page,'desktop'\);[\s\S]*desktop authenticated reload/,"desktop first-run onboarding must be handled before reload");
assert.match(source,/await dismissOnboardingIfOpen\(page,'desktop reload'\);[\s\S]*const desktopNav=/,"desktop navigation must not run behind a modal");
assert.match(source,/await dismissOnboardingIfOpen\(mobilePage,'mobile'\);[\s\S]*mobile authenticated reload/,"mobile first-run onboarding must be handled before reload");
assert.match(source,/await dismissOnboardingIfOpen\(mobilePage,'mobile reload'\);[\s\S]*const menu=/,"mobile menu interaction must not run behind a modal");

console.log("v88 synthetic onboarding modal lifecycle checks passed");
