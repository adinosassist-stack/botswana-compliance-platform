import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import vm from "node:vm";

const runtime=readFileSync(new URL("../public/js/workspace-runtime-20261001b.js",import.meta.url),"utf8");
const canonical=readFileSync(new URL("../public/index.html",import.meta.url),"utf8");
const start=runtime.indexOf("function renderAll(){");
const end=runtime.indexOf("\nfunction addDays(",start);
assert.ok(start>=0&&end>start,"renderAll must be present");
const render=runtime.slice(start,end);
const canonicalStart=canonical.indexOf("function renderAll(){");
const canonicalEnd=canonical.indexOf("\nfunction addDays(",canonicalStart);
assert.ok(canonicalStart>=0&&canonicalEnd>canonicalStart,"canonical renderAll must be present");

test("canonical inline and external workspace renderers remain identical",()=>{
 assert.equal(canonical.slice(canonicalStart,canonicalEnd),render);
});

test("dashboard metrics are gated before expensive scoring",()=>{
 const guard=render.indexOf("if(dashboardMetricsNeeded){");
 const scoring=render.indexOf("const a=applicable(),s=scoreData(a);");
 assert.ok(guard>=0&&scoring>guard,"scoring must run only in dashboard metrics guard");
 assert.match(render,/dashboardMetricsNeeded=document\.getElementById\("dashboard"\)\?\.classList\.contains\("active"\)/);
});

test("shared role permissions and active view rendering remain outside dashboard metrics guard",()=>{
 const guard=render.indexOf("if(dashboardMetricsNeeded){");
 const scoring=render.indexOf("const a=applicable(),s=scoreData(a);");
 const role=render.indexOf("applyRoleUi();");
 const active=render.indexOf('run("security",renderSecurity)');
 assert.ok(guard>=0&&scoring>guard&&role>scoring&&active>role);
 const between=render.slice(guard,role);
 assert.match(between,/\n \}\s*$/,"dashboard-only metrics and lists must close before role updates");
 assert.match(render.slice(role),/^applyRoleUi\(\);/,"role UI must execute after guarded dashboard work");
});

test("dashboard lists remain dashboard-only",()=>{
 const guard=render.indexOf("if(dashboardMetricsNeeded){");
 const priority=render.indexOf('document.getElementById("priorityList").safeHTML');
 assert.ok(guard>=0&&priority>guard);
});

const callbackNames=[...new Set([...render.matchAll(/run\("[^"]+",([A-Za-z_$][\w$]*)\)/g)].map(match=>match[1]))];
const allViewNames=[...new Set([...render.matchAll(/run\("([^"]+)"/g)].map(match=>match[1]).concat(["dashboard","employershield","protectionengine","sources","rules","publishing","regulatorygovernance"]))];
function exercise(activeView,ready=true,allowedViews=allViewNames){
 const calls=new Map();
 const hit=name=>calls.set(name,(calls.get(name)||0)+1);
 const elements=new Map();
 const getElement=id=>{
  if(!elements.has(id))elements.set(id,{
   classList:{contains:name=>name==="active"&&id===activeView},
   style:{},textContent:"",className:"",safeHTML:""
  });
  return elements.get(id);
 };
 const context={
  document:{getElementById:getElement},
  window:{__THEBE_WORKSPACE_READY__:ready},
  currentUser:{role:"owner"},
  roleLandingView:()=>"dashboard",
  currentWorkspaceRole:()=>"owner",
  roleCanView:()=>{throw new Error("renderAll must not rescan role permissions per view");},
  allowedViewsForRole:()=>{hit("allowedViewsForRole");return new Set(allowedViews);},
  state:{profile:{name:"Test tenant"},evidence:[]},
  STANDALONE_PREVIEW:false,
  sourceConflicts:[],
  applicable:()=>{hit("applicable");return [];},
  scoreData:()=>{hit("scoreData");return {comp:90,prot:85,open:2};},
  applyRoleUi:()=>hit("applyRoleUi"),
  renderCompanies:()=>hit("renderCompanies"),
  animateNumber:()=>hit("animateNumber"),
  animateViewItems:()=>hit("animateViewItems"),
  setTimeout:()=>{},
  renderGlobalConflict:()=>hit("renderGlobalConflict"),
  setupProgress:()=>hit("setupProgress"),
  renderDeadlines:()=>hit("renderDeadlines"),
  renderOnboardingBanner:()=>hit("renderOnboardingBanner"),
  renderDailyOperatingBrief:()=>hit("renderDailyOperatingBrief"),
  renderExecutiveExceptions:()=>hit("renderExecutiveExceptions"),
  reportClientError:error=>{throw error;}
 };
 for(const name of callbackNames)context[name]=()=>hit(name);
 const fn=vm.runInNewContext(render+"\nrenderAll",context);
 fn();
 return {calls,elements,hit};
}

test("navigating to Security and Employees skips dashboard scoring yet renders each active view",()=>{
 for(const [view,callback] of [["security","renderSecurity"],["employees","renderEmployeeRegister"]]){
  const {calls,elements}=exercise(view);
  assert.equal(calls.get("applicable")||0,0,view+" must not score hidden dashboard");
  assert.equal(calls.get("scoreData")||0,0,view+" must not calculate hidden metrics");
  assert.equal(calls.get(callback),1,view+" must render its active page");
  assert.equal(calls.get("applyRoleUi"),1,view+" must still apply role access");
  assert.equal(calls.get("renderCompanies"),1,view+" must retain company selector");
  assert.equal(elements.get("priorityList"),undefined,view+" must not touch hidden priority list");
 }
});

test("dashboard still computes the score and updates key metrics once",()=>{
 const {calls,elements}=exercise("dashboard");
 assert.equal(calls.get("applicable"),1);
 assert.equal(calls.get("scoreData"),1);
 assert.equal(calls.get("applyRoleUi"),1);
 assert.equal(elements.get("complianceScore").textContent,90);
 assert.equal(elements.get("protectionScore").textContent,85);
 assert.ok(elements.get("priorityList").safeHTML.includes("No urgent actions"));
});

test("cold dashboard landing retains metrics even before ready flag",()=>{
 const {calls}=exercise("auth-placeholder",false);
 assert.equal(calls.get("applicable"),1);
 assert.equal(calls.get("scoreData"),1);
 assert.equal(calls.get("applyRoleUi"),1);
});

test("workspace role permissions are snapshotted once per render",()=>{
 for(const view of ["dashboard","security","employees"]){
  const {calls}=exercise(view);
  assert.equal(calls.get("allowedViewsForRole"),1,view+" should resolve role permissions once");
  assert.equal(calls.get("applyRoleUi"),1,view+" should still apply the role to the UI");
 }
 assert.equal((render.match(/allowedViewsForRole\(/g)||[]).length,1);
 assert.doesNotMatch(render,/roleCanView\(/,"renderAll must not perform per-view DOM permission rescans");
});

test("a denied active route never reaches its renderer",()=>{
 const {calls}=exercise("employees",true,["dashboard","security"]);
 assert.equal(calls.get("renderEmployeeRegister")||0,0);
 assert.equal(calls.get("allowedViewsForRole"),1);
 assert.equal(calls.get("applyRoleUi"),1);
});

test("role permission snapshot is refreshed on each render",()=>{
 const {calls:allowed}=exercise("employees",true,["employees","dashboard"]);
 const {calls:denied}=exercise("employees",true,["dashboard"]);
 assert.equal(allowed.get("renderEmployeeRegister"),1);
 assert.equal(denied.get("renderEmployeeRegister")||0,0);
 assert.equal(allowed.get("allowedViewsForRole"),1);
 assert.equal(denied.get("allowedViewsForRole"),1);
});
