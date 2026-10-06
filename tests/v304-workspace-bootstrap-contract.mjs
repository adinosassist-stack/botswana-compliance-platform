import "./v305-workspace-readiness-order.mjs";
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

// Preserve the original browser failure even when its follow-up probe is blocked.
const vm=await import("node:vm");
const wrapper=fs.readFileSync("scripts/production-synthetic-browser-wrapper.mjs","utf8");
const start=wrapper.indexOf("async function assertWorkspace(");
const end=wrapper.indexOf("\nasync function dismissFirstRunOnboardingIfPresent",start);
assert(start>=0&&end>start,"browser readiness assertion must be available");
const context=vm.createContext({
  waitForWorkspaceAuthoredState:async()=>{throw new Error("workspace readiness timeout")},
  probeWorkspaceBootstrap:()=>Promise.resolve({}),
  withDeadline:async()=>{throw new Error("diagnostic deadline exceeded")},
  DIAGNOSTIC_EXTERNAL_DEADLINE_MS:1,
  safe:value=>String(value??"").slice(0,300),
  cookieState:value=>value===true?"present":value===false?"absent":"unknown"
});
const summaryStart=wrapper.indexOf("function summarizeProbe(");
const summaryEnd=wrapper.indexOf("\nasync function observeWorkspaceBootstrap",summaryStart);
assert(summaryStart>=0&&summaryEnd>summaryStart,"browser diagnostic summary must be available");
vm.runInContext(wrapper.slice(summaryStart,summaryEnd),context);
vm.runInContext(wrapper.slice(start,end),context);
await assert.rejects(
  context.assertWorkspace({},"desktop",["ReferenceError: startupTarget is not defined"]),
  error=>error.message.includes("ReferenceError: startupTarget is not defined")&&error.message.includes("diagnostic deadline exceeded")&&error.message.includes("workspace readiness timeout")
);
await assert.rejects(
  context.assertWorkspace({},"mobile",[]),
  error=>error.message.includes("diagnostic deadline exceeded")&&!error.message.includes("undefined")
);
console.log("PASS: browser readiness timeout retains captured JavaScript errors and the diagnostic deadline separately.");
