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
  captureWorkspaceStack:async()=>{},
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

const debugStart=wrapper.indexOf("const workspaceDebugSessions=new WeakMap();");
const debugEnd=wrapper.indexOf("\nasync function assertWorkspace(",debugStart);
const events=new Map(),calls=[],messages=[];
const session={
  send:async(method)=>{
    calls.push(method);
    if(method==="Debugger.pause")events.get("Debugger.paused")?.({callFrames:[{functionName:"stalled",url:"https://thebedesk.com/js/runtime.js?reset_token=PRIVATE",location:{lineNumber:12,columnNumber:4}}]});
  },
  once:(name,fn)=>events.set(name,fn),
  off:(name)=>events.delete(name)
};
const debugContext=vm.createContext({WeakMap,URL,ORIGIN:"https://thebedesk.com",safe:String,info:(label,detail)=>messages.push(detail),withDeadline:async(label,promise)=>promise});
vm.runInContext(wrapper.slice(debugStart,debugEnd),debugContext);
const debugPage={context:()=>({newCDPSession:async()=>session})};
await debugContext.prepareWorkspaceStackCapture(debugPage);
await debugContext.captureWorkspaceStack(debugPage,"desktop");
assert.deepEqual(calls,["Debugger.enable","Debugger.pause","Debugger.resume"]);
assert.equal(events.size,0,"pause listener must be removed");
assert(messages[0].includes('"line":13'));
assert(!messages[0].includes("PRIVATE"),"stack logs must strip query strings");
session.send=async(method)=>{calls.push(method);if(method==="Debugger.pause")throw new Error("protocol failure")};
await debugContext.captureWorkspaceStack(debugPage,"desktop");
assert.equal(calls.at(-1),"Debugger.resume","resume must be attempted after a failed capture");
assert.equal(events.size,0);
console.log("PASS: stalled browser stack capture resumes execution and excludes URL secrets.");

const {isSafeUiMutation}=await import("../scripts/production-synthetic-request-policy.mjs");
assert.equal(isSafeUiMutation("POST","/api/ai/operator/queue"),false);
assert.equal(isSafeUiMutation("PUT","/api/ai/operator/queue"),true);
assert.equal(isSafeUiMutation("POST","/api/ai/operator/queue/execute"),true);
assert.equal(isSafeUiMutation("POST","/api/ai/operator/route"),true);
assert.equal(isSafeUiMutation("POST","/api/employees"),true);
assert.equal(isSafeUiMutation("DELETE","/api/employees/1"),true);
assert.equal(isSafeUiMutation("GET","/api/state"),false);
const {senderDomainStatus}=await import("../scripts/production-email-sender-diagnostic.mjs");
assert.equal(senderDomainStatus("Support@thebedesk.com",{data:[{name:"thebedesk.com",status:"verified"}]}),"verified");
assert.equal(senderDomainStatus("Thebe <Support@thebedesk.com>",{data:[{name:"thebedesk.com",status:"pending"}]}),"pending");
assert.equal(senderDomainStatus("Support@thebedesk.com",{data:[],has_more:true}),"not_visible_in_page");
assert.equal(senderDomainStatus("Support@thebedesk.com",{data:[],has_more:false}),"not_listed");
assert.equal(senderDomainStatus("Support@thebedesk.com",{data:[{name:"thebedesk.com",status:"PRIVATE_PROVIDER_TEXT"}]}),"status_unknown");
console.log("PASS: synthetic audit excludes only the computed queue POST and reports bounded sender status.");

const recoverySmoke=fs.readFileSync('scripts/production-password-recovery-smoke.mjs','utf8');
const pageCheckStart=recoverySmoke.indexOf('async function verifyResetPage(');
const pageCheckEnd=recoverySmoke.indexOf('\ntry{',pageCheckStart);
assert(pageCheckStart>=0&&pageCheckEnd>pageCheckStart,'recovery smoke must verify the canonical reset page');
const form='<!doctype html><form id="resetCompleteForm"></form>';
async function runResetPageCheck(responses){
  const requests=[];
  const pageContext=vm.createContext({URL,AbortSignal,ORIGIN:'https://thebedesk.com',agent:'test',assert:(ok,message)=>assert(ok,message),fetch:async(url,options)=>{
    requests.push({url:String(url),options});
    assert(responses.length,'unexpected additional reset page request');
    return responses.shift();
  }});
  vm.runInContext(recoverySmoke.slice(pageCheckStart,pageCheckEnd),pageContext);
  await pageContext.verifyResetPage();
  return requests;
}
const direct=await runResetPageCheck([new Response(form)]);
assert.equal(direct.length,1);
const canonical=await runResetPageCheck([new Response(null,{status:307,headers:{location:'/reset-password'}}),new Response(form)]);
assert.equal(canonical[1].url,'https://thebedesk.com/reset-password');
assert(canonical.every(r=>r.options.redirect==='manual'&&r.options.signal instanceof AbortSignal));
for(const location of ['https://other.example/reset-password','/auth/','/reset-password?reset_token=secret','/reset-password#secret','https://user:password@thebedesk.com/reset-password']){
  await assert.rejects(runResetPageCheck([new Response(null,{status:307,headers:{location}})]),/canonical same-origin/);
}
await assert.rejects(runResetPageCheck([new Response(null,{status:307})]),/missing its destination/);
await assert.rejects(runResetPageCheck([new Response(null,{status:307,headers:{location:'/reset-password'}}),new Response(null,{status:307,headers:{location:'/reset-password'}})]),/not publicly reachable/);
await assert.rejects(runResetPageCheck([new Response('login page')]),/completion form/);
console.log('PASS: recovery page accepts one canonical redirect and rejects external, credentialed, token-bearing, repeated and wrong-page responses.');
