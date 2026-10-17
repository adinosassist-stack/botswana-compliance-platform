import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const helper=fs.readFileSync("public/js/workspace-readiness-v305.js","utf8");
const html=fs.readFileSync("public/index.html","utf8");
const end=helper.indexOf("\n})();");
assert(end>0,"readiness bootstrap is present");
const bootstrap=helper.slice(0,end+6);

// Reproduce the authenticated People disclosure being replaced by lazy-route hydration.
let detail;
let peopleObserver;
let saves=0;
const listeners=new Map();
const window={
  addEventListener:(event,callback)=>listeners.set(event,callback),
  renderPeopleReportingSetup:async()=>{saves++;}
};
function disclosure(){
  return {
    dataset:{},
    open:false,
    removeAttribute(name){if(name==="open")this.open=false;},
    addEventListener(type,callback){if(type==="toggle")this.onToggle=callback;}
  };
}
detail=disclosure();
const people={
  dataset:{},
  classList:{contains:name=>name==="active"},
  querySelector:selector=>selector==="#opsReportingSetupDetails"?detail:null
};
const document={getElementById:id=>id==="peopleops"?people:null};
class MutationObserver {
  constructor(callback){this.callback=callback;}
  observe(target){if(target===people)peopleObserver=this.callback;}
}
const ctx=vm.createContext({window,document,MutationObserver,queueMicrotask});
vm.runInContext(bootstrap,ctx);
window.__THEBE_WORKSPACE_READY__=true;
listeners.get("thebe:workspace-ready")();
assert.equal(typeof peopleObserver,"function","People mutation watcher is installed");
assert.equal(detail.open,false,"reporting setup stays closed until requested");
await window.renderPeopleReportingSetup();
assert.equal(saves,0,"closed People setup does not issue API reads");

detail.open=true;
detail.onToggle();
assert.equal(saves,1,"opening reporting setup loads the canonical data");
assert.equal(people.dataset.v337ReportingOpen,"1","open state recorded on stable People root");

const original=detail;
detail=disclosure();
peopleObserver();
assert.notEqual(detail,original);
assert.equal(detail.open,true,"lazy replacement preserves a user-opened Locations panel");
assert.equal(typeof detail.onToggle,"function","replacement disclosure gets a new listener");
detail.onToggle();
assert.equal(saves,2,"replacement disclosure can refresh locations");
peopleObserver();
detail.onToggle();
assert.equal(saves,3,"repeated mutations must not duplicate toggle callbacks");

detail.open=false;
detail.onToggle();
assert.equal(people.dataset.v337ReportingOpen,"0");
detail=disclosure();
peopleObserver();
assert.equal(detail.open,false,"user-closed disclosure stays closed after replacement");
await window.renderPeopleReportingSetup();
assert.equal(saves,3,"closed replacement must not make location API calls");

people.classList.contains=()=>false;
detail.open=true;
await window.renderPeopleReportingSetup();
assert.equal(saves,3,"inactive People must not refresh tenant reporting data");

// Cross-page contract inventory: buttons resolve to declared actions and static navigation has destinations.
const handlers=[...new Set([...html.matchAll(/data-bw-onclick="([A-Za-z_$][\w$]*)\s*\(/g)].map(x=>x[1]))];
assert(handlers.length>=150,"workspace has a substantive actionable-control inventory");
for(const handler of handlers){
  if(handler==="if")continue; // Inline guard expression, not a callable action.
  const escaped=handler.replace(/[$]/g,"\\$");
  const declaration=new RegExp("(?:async\\s+)?function\\s+"+escaped+"\\s*\\(|(?:const|let|var)\\s+"+escaped+"\\s*=|(?:window|globalThis)\\."+escaped+"\\s*=");
  assert(declaration.test(html),"No declared implementation for control: "+handler);
}
const targets=[...new Set([...html.matchAll(/data-view="([a-z][\w-]*)"/g)].map(x=>x[1]))];
assert(targets.length>=50,"workspace includes multi-page navigation inventory");
for(const target of targets)assert(html.includes('id="'+target+'"'),"Missing static navigation destination: "+target);
console.log("PASS: People Add Location survives lazy panel replacement; other pages retain static handler and navigation contracts");
