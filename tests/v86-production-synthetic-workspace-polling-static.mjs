import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("scripts/production-synthetic-browser-wrapper.mjs","utf8");
const fullUser=fs.readFileSync("scripts/production-synthetic-full-user-wrapper.mjs","utf8");
const workspaceProof=source.slice(source.indexOf("function workspaceAuthoredState"),source.indexOf("async function loginInBrowser"));

assert.ok(workspaceProof.length>0,"workspace proof section must be discoverable");
assert.match(source,/WORKSPACE_AUTHORED_VISIBILITY_WAIT_MS=22000/,"authored readiness remains bounded");
assert.match(source,/WORKSPACE_AUTHORED_EVALUATION_DEADLINE_MS=2500/,"each browser protocol evaluation must have an external deadline");
assert.match(source,/WORKSPACE_POLL_INTERVAL_MS=125/,"readiness polling must be explicitly bounded");
assert.match(source,/function workspaceAuthoredState\(\)/,"workspace readiness predicate must remain centralized");
assert.match(source,/globalThis\.__THEBE_WORKSPACE_READY__===true/,"workspace-ready authority must remain required");
assert.match(source,/shell\.hidden!==true&&!shell\.classList\.contains\('hidden'\)/,"hidden workspace shells must fail readiness");
assert.match(source,/shell\.style\.display!=='none'&&shell\.style\.visibility!=='hidden'/,"authored display and visibility must remain required");
assert.match(source,/marketing\?\.classList\.contains\('hidden'\)===true&&auth\?\.classList\.contains\('hidden'\)===true/,"public/auth gates must be hidden before readiness passes");
assert.match(source,/!!document\.getElementById\('workspaceSidebar'\)/,"workspace sidebar must remain required");
assert.match(source,/async function waitForWorkspaceAuthoredState/,"Node-side readiness polling must exist");
assert.match(source,/page\.evaluate\(workspaceAuthoredState\)/,"polling must inspect the live browser document");
assert.match(source,/withDeadline\([\s\S]*page\.evaluate\(workspaceAuthoredState\)[\s\S]*WORKSPACE_AUTHORED_EVALUATION_DEADLINE_MS/,"each readiness evaluation must be externally bounded");
assert.doesNotMatch(workspaceProof,/page\.waitForFunction\(/,"production workspace readiness must not depend on browser-scheduled waitForFunction");
assert.match(source,/getComputedStyle\(shell\)/,"computed rendered visibility confirmation must remain after authored readiness");
assert.match(source,/rendered\.display!=='none'&&rendered\.visibility!=='hidden'&&rendered\.opacity!=='0'&&rendered\.rects>0/,"rendered workspace must still fail closed when not visible");
assert.match(source,/WORKSPACE_AUTHORED_VISIBILITY_WAIT_MS\+Math\.max\(DIAGNOSTIC_EXTERNAL_DEADLINE_MS,WORKSPACE_COMPUTED_VISIBILITY_DEADLINE_MS\)\+2000<WORKSPACE_EXTERNAL_DEADLINE_MS/,"inner diagnostics must remain inside outer workspace deadline");
assert.ok(fullUser.includes("reporterPage.locator('#reporterPortal').waitFor({state:'visible',timeout:WORKSPACE_TIMEOUT_MS})"),"reporter portal visibility proof must wait for the real rendered portal using the standard bounded workspace timeout");
assert.ok(fullUser.includes("reporterPage.locator('#reporterEmployeeName',{hasText:syntheticEmployeeName}).waitFor({state:'visible',timeout:WORKSPACE_TIMEOUT_MS})"),"reporter portal proof must wait for the issued employee identity to bind");
assert.ok(fullUser.includes("reporterPage.locator('#reporterLocationName',{hasText:locationName}).waitFor({state:'visible',timeout:WORKSPACE_TIMEOUT_MS})"),"reporter portal proof must wait for the issued location identity to bind");
assert.doesNotMatch(fullUser,/reporterPortal[^\n]{0,220}timeout:15000/,"reporter portal proof must not retain the brittle 15-second wait");
assert.ok(fullUser.includes("page.locator('#employeeRegister .item',{hasText:syntheticEmployeeName}).first().waitFor({state:'visible',timeout:WORKSPACE_TIMEOUT_MS})"),"employee-register proof must wait for the created visible row using the standard bounded workspace timeout");
assert.match(fullUser,/Employee reporting access\/i\.test\(String\(document\.getElementById\(`employeeReportingAccess_\$\{id\}`\)\?\.innerText\|\|''\)\)/,"employee-row proof must wait for reporting-access content rather than only panel visibility");
assert.doesNotMatch(fullUser,/employeeRegister[^\n]{0,220}timeout:15000/,"employee-register proof must not retain the brittle 15-second wait");
assert.match(fullUser,/async function dismissFirstRunOnboardingIfNeeded\(page\)/,"full-user proof must centralize bounded first-run onboarding dismissal");
assert.match(fullUser,/data-bw-onclick="dismissOnboarding\(\)"/,"onboarding race recovery must use the real delegated dismissal control");
assert.match(fullUser,/Date\.now\(\)\+3500/,"delayed onboarding recovery must remain explicitly bounded");
assert.ok((fullUser.match(/await dismissFirstRunOnboardingIfNeeded\(page\);/g)||[]).length>=2,"workspace button audit must guard against onboarding both before and after dashboard activation");

console.log("v86 production synthetic workspace polling checks passed");
