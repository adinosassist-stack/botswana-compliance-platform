import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const runtime=fs.readFileSync("public/js/workspace-runtime-20261001b.js","utf8");
const scheduler=runtime.slice(runtime.indexOf(" const allowedRenderViews=allowedViewsForRole(currentWorkspaceRole());"),runtime.indexOf("\n}\nfunction addDays",runtime.indexOf(" const allowedRenderViews=allowedViewsForRole(currentWorkspaceRole());")));
assert.ok(scheduler.length>0,"workspace hydration dispatcher must be available");
const credits=runtime.slice(runtime.indexOf("async function renderAiCredits(){"),runtime.indexOf("\nfunction setAiAdvisorPrompt",runtime.indexOf("async function renderAiCredits(){")));
assert.ok(credits.length>0,"wallet renderer must be available");

async function hydrate(active,permitted=true,reject=false){
  let reads=0;
  const nodes=new Map(["aiCreditWalletBox","aiCreditBalance","aiMonthlyAllowance","aiLifetimeUsed","aiLowBalance","aiCreditPacks","aiCreditHistory"].map(id=>[id,{textContent:"—",safeHTML:"Loading AI credit wallet…"}]));
  const scope={
    window:{__THEBE_WORKSPACE_READY__:true},currentUser:{role:"owner"},
    document:{getElementById(id){if(nodes.has(id))return nodes.get(id);return {classList:{contains:()=>id===active}}}},
    roleCanView:()=>permitted,allowedViewsForRole:()=>permitted?new Set(["aiservices","aicontrols"]):new Set(),roleLandingView:()=>"dashboard",currentWorkspaceRole:()=>"owner",
    escapeHtml:value=>String(value),reportClientError:error=>{throw error},setTimeout:()=>{},
    apiJson:async path=>{assert.equal(path,"/api/ai/credits");reads++;if(reject)throw new Error("Wallet service unavailable");return {wallet:{balance:17,monthly_allowance:40,lifetime_used:23,lifetime_purchased:0},plan:{plan:"protect"},packs:[],ledger:[]}}
  };
  for(const name of [...scheduler.matchAll(/run\("[^"]+",(\w+)\)/g)].map(x=>x[1]))scope[name]=()=>{};
  for(const name of ["renderCompanies","renderEmployeesForHr","renderHrCases","renderPlatformRegulatoryGovernance","animateViewItems","renderGlobalConflict","setupProgress","renderDeadlines","renderOnboardingBanner","renderDailyOperatingBrief","renderExecutiveExceptions"])scope[name]=()=>{};
  vm.createContext(scope);
  vm.runInContext(credits+"\n"+scheduler,scope);
  await new Promise(resolve=>setImmediate(resolve));
  return {reads,nodes};
}

const copilot=await hydrate("aiservices");
assert.equal(copilot.reads,1,"opening copilot must request the actual wallet");
assert.equal(copilot.nodes.get("aiCreditBalance").textContent,17,"copilot must show returned balance");
assert.match(copilot.nodes.get("aiCreditWalletBox").safeHTML,/17 credits available/);
assert.doesNotMatch(copilot.nodes.get("aiCreditWalletBox").safeHTML,/Loading/);
const controls=await hydrate("aicontrols");
assert.equal(controls.reads,1,"credits controls must retain wallet hydration");
assert.equal((await hydrate("dashboard")).reads,0,"Home must not start a hidden wallet request");
assert.equal((await hydrate("aiservices",false)).reads,0,"unauthorized view must not load wallet");
const failed=await hydrate("aiservices",true,true);
assert.match(failed.nodes.get("aiCreditWalletBox").safeHTML,/Wallet service unavailable/,"failed wallet reads must settle with an error");
assert.equal(failed.nodes.get("aiCreditBalance").textContent,"—","unavailable balance must not become zero");
console.log("Copilot credit-wallet hydration runtime: PASS");
