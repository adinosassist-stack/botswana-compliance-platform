import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {test} from "node:test";

const readiness=readFileSync(new URL("../public/js/workspace-readiness-v305.js",import.meta.url),"utf8");
const locations=readFileSync(new URL("../public/js/locations-branches-v335.js",import.meta.url),"utf8");

test("People mutation bursts coalesce; unchanged visibility avoids duplicate writes; replaced disclosure retains one reporting wrapper",async()=>{
  const firstEnd=readiness.indexOf("\n})();")+6;
  assert.ok(firstEnd>0);
  let observer,scans=0,hiddenWrites=0,originalCalls=0;
  const listeners=new Map();
  const rows=Array.from({length:5},(_,i)=>{
    let hidden=i>=4;
    return {get hidden(){return hidden},set hidden(v){hiddenWrites++;hidden=!!v}};
  });
  let details={dataset:{},open:false,removeAttribute(k){if(k==="open")this.open=false},addEventListener(k,fn){if(k==="toggle")this.toggle=fn}};
  const more={
    hidden:true, textContent:"",dataset:{},attrs:new Map(),
    getAttribute(k){return this.attrs.get(k)||null},
    setAttribute(k,v){this.attrs.set(k,v)},addEventListener(){}
  };
  const box={
    querySelectorAll(){scans++;return rows},
    querySelector(selector){return selector===".people-location-more"?more:null}
  };
  const people={
    dataset:{},classList:{contains:n=>n==="active"},
    querySelector(selector){return selector==="#opsReportingSetupDetails"?details:selector==="#peopleLocationBars"?box:null}
  };
  const window={
    addEventListener(k,fn){listeners.set(k,fn)},
    renderPeopleReportingSetup:async()=>{originalCalls++}
  };
  const document={
    getElementById:id=>id==="peopleops"?people:null,
    createElement:()=>{throw Error("already have more button")}
  };
  class MutationObserver {
    constructor(fn){observer=fn}
    observe(){}
  }
  const context=vm.createContext({window,document,queueMicrotask,MutationObserver});
  vm.runInContext(readiness.slice(0,firstEnd),context);
  window.__THEBE_WORKSPACE_READY__=true;
  listeners.get("thebe:workspace-ready")();
  assert.equal(scans,1);
  const wrapped=window.renderPeopleReportingSetup;
  observer();observer();observer();
  assert.equal(scans,1,"DOM mutation bursts must not immediately repeat heavy scans");
  await Promise.resolve();
  assert.equal(scans,2,"mutations must flush in one microtask");
  assert.equal(hiddenWrites,0,"unchanged hidden state must not rewrite DOM");
  assert.equal(more.hidden,false);
  details.open=true;details.toggle();await Promise.resolve();
  assert.equal(originalCalls,1);
  details={dataset:{},open:false,removeAttribute(k){if(k==="open")this.open=false},addEventListener(k,fn){if(k==="toggle")this.toggle=fn}};
  observer();observer();await Promise.resolve();
  assert.equal(scans,3);
  assert.equal(window.renderPeopleReportingSetup,wrapped,"disclosure replacement must not stack reporting wrappers");
  assert.equal(typeof details.toggle,"function");
  details.open=true;details.toggle();await Promise.resolve();
  assert.equal(originalCalls,2,"each disclosure toggle calls original renderer once");
});

test("Locations & Branches retry is fenced to most recent click and canceled on navigation",()=>{
  const start=locations.indexOf("  function openLocationsBranches(){");
  const end=locations.indexOf("\n  function decorateWorkspace(){",start);
  assert.ok(start>0&&end>start);
  assert.match(locations,/if\(id!=="peopleops"\)locationsOpenEpoch\+\+/);
  const tasks=[],seen=[];
  const ctx=vm.createContext({
    window:{showView:id=>{seen.push("view:"+id);return true}},
    document:{getElementById:()=>({classList:{contains:()=>true},dataset:{}})},
    scheduleOnboardingYield:()=>seen.push("yield"),
    revealLocations:()=>{seen.push("reveal");return false},
    setTimeout:(fn,ms)=>{tasks.push({fn,ms})}
  });
  vm.runInContext("let locationsOpenEpoch=0;\n"+locations.slice(start,end)+"\nthis.openLocationsBranches=openLocationsBranches;",ctx);
  ctx.openLocationsBranches();
  ctx.openLocationsBranches();
  assert.equal(tasks.length,2,"two rapid requests queue separate first ticks");
  tasks.shift().fn();
  assert.equal(seen.includes("reveal"),false,"older retry must stop without touching the form");
  tasks.shift().fn();
  assert.equal(seen.filter(x=>x==="reveal").length,1);
  assert.equal(tasks.length,1,"only newest request may schedule another retry");
  vm.runInContext("locationsOpenEpoch++",ctx);
  tasks.shift().fn();
  assert.equal(tasks.length,0,"route change must stop all outstanding retries");
  assert.equal(seen.filter(x=>x==="reveal").length,1);
});

test("denied People navigation does not schedule locations retry",()=>{
  const start=locations.indexOf("  function openLocationsBranches(){");
  const end=locations.indexOf("\n  function decorateWorkspace(){",start);
  let scheduled=0;
  const ctx=vm.createContext({
    window:{showView:()=>false},
    document:{getElementById:()=>null},
    scheduleOnboardingYield:()=>{},
    revealLocations:()=>false,
    setTimeout:()=>{scheduled++}
  });
  vm.runInContext("let locationsOpenEpoch=0;\n"+locations.slice(start,end)+"\nthis.openLocationsBranches=openLocationsBranches;",ctx);
  ctx.openLocationsBranches();
  assert.equal(scheduled,0);
});

test("warmup prefetch stops after actual navigation and skips hidden tabs",async()=>{
  const idx=readiness.indexOf('  const SHARD_COUNT=12;');
  const start=readiness.lastIndexOf("(()=>{",idx);
  assert.ok(idx>0&&start>0);
  const end=readiness.indexOf("\n})();",idx)+6;
  const code=readiness.slice(start,end);
  const listeners=new Map(),onReady=[],idle=[],shards=[];
  const document={visibilityState:"visible",querySelector:()=>null,addEventListener:()=>{}};
  const window={
    document,
    location:{origin:"https://thebedesk.com"},
    navigator:{connection:{saveData:false,effectiveType:"4g"}},
    BW:{api:{createClient:()=>({request:async()=>({})})}},
    whenThebeWorkspaceReady:fn=>onReady.push(fn),
    requestIdleCallback:cb=>idle.push(cb),
    addEventListener:(k,fn)=>listeners.set(k,fn),
    setTimeout:fn=>{fn()}
  };
  window.prefetchThebeWorkspaceShard=async shard=>{
    shards.push(shard);
    if(shards.length===1)listeners.get("thebe:workspace-view-change")({detail:{id:"peopleops"}});
  };
  vm.runInNewContext(code,{window,document,URL,Promise,Set});
  onReady.forEach(fn=>fn());
  assert.equal(idle.length,1);
  idle[0]();
  for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(shards.length,1,"navigation must interrupt remaining speculative downloads");
  assert.equal(shards[0],1);
  document.visibilityState="hidden";
  assert.match(code,/document\.visibilityState==="hidden"/,"hidden page work must be skipped");
});
