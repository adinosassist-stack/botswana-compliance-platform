import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("scripts/production-synthetic-browser-wrapper.mjs","utf8");

assert.match(source,/const ONBOARDING_MODAL_WAIT_MS=2500/,"synthetic onboarding detection must be bounded");
assert.match(source,/const ONBOARDING_MODAL_ACTION_MS=5000/,"synthetic onboarding action must be bounded");
assert.match(source,/async function dismissFirstRunOnboardingIfPresent\(page,label\)/,"synthetic lifecycle must handle the real first-run onboarding modal");
assert.match(source,/page\.locator\('#onboardModal\.open'\)/,"helper must detect the actual open onboarding modal");
assert.match(source,/button\[data-bw-onclick="dismissOnboarding\(\)"\]/,"helper must use the real Finish later control rather than mutating product state directly");
assert.match(source,/finishLater\.click\(\{timeout:ONBOARDING_MODAL_ACTION_MS\}\)/,"helper must dismiss onboarding through an actual browser click");
assert.match(source,/page\.locator\('#onboardModal'\)\.waitFor\(\{state:'hidden'/,"helper must prove the modal is closed before navigation");
assert.doesNotMatch(source,/sessionStorage\.setItem\(['\"]bw_onboarding_dismissed/,"synthetic proof must not bypass onboarding by writing dismissal storage directly");

const desktopInitial=source.indexOf("activeStage=\'desktop first-run onboarding\'");
const desktopReload=source.indexOf("activeStage=\'desktop authenticated reload\'");
const desktopGuard=source.indexOf("activeStage=\'desktop onboarding guard\'");
const desktopNav=source.indexOf("const desktopNav=page.locator(\'#workspaceSidebar [data-view]:visible\')");
assert.ok(desktopInitial>0&&desktopInitial<desktopReload,"desktop first-run onboarding must be handled before reload");
assert.ok(desktopGuard>desktopReload&&desktopGuard<desktopNav,"desktop onboarding guard must run before nav interaction");

const mobileInitial=source.indexOf("activeStage=\'mobile first-run onboarding\'");
const mobileReload=source.indexOf("activeStage=\'mobile authenticated reload\'");
const mobileGuard=source.indexOf("activeStage=\'mobile onboarding guard\'");
const mobileMenu=source.indexOf("const menu=mobilePage.locator(\'#mobileMenuButton\')");
assert.ok(mobileInitial>0&&mobileInitial<mobileReload,"mobile first-run onboarding must be handled before reload");
assert.ok(mobileGuard>mobileReload&&mobileGuard<mobileMenu,"mobile onboarding guard must run before menu interaction");

console.log("v88 synthetic onboarding modal lifecycle checks passed");
