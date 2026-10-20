import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const canonical=fs.readFileSync("public/index.html","utf8");
const runtime=fs.readFileSync("public/js/workspace-runtime-20261001b.js","utf8");
for(const [name,source] of [["canonical",canonical],["runtime",runtime]]){
  assert.match(source,/function scoreData\(a=applicable\(\)\)/,name+" must support caller-supplied applicable rules");
  assert.match(source,/function renderAll\(\)\{\s*const a=applicable\(\),s=scoreData\(a\);/,name+" must not filter the rule set twice");
  assert.match(source,/const workspaceNumberAnimations=new WeakMap\(\)/,name+" must deduplicate per-element animations");
}
const start=runtime.indexOf("function applicable(){");
const end=runtime.indexOf("\nconst securityControls",start);
assert(start>0&&end>start,"score logic extraction bounds");
const state={profile:{data:false},employees:[],evidence:[]};
let applicabilityCalls=0;
const rules=[
  {risk:"High",area:"Employment",applies:()=>{applicabilityCalls++;return true;},status:()=>"Action required"},
  {risk:"Low",area:"Data protection",applies:()=>{applicabilityCalls++;return false;},status:()=>"Action required"}
];
const metrics=vm.createContext({state,rules,privacyControls:[]});
vm.runInContext(runtime.slice(start,end),metrics);
const once=metrics.applicable();
assert.equal(applicabilityCalls,2);
const supplied=metrics.scoreData(once);
assert.equal(applicabilityCalls,2,"supplied rule set must not be filtered again");
assert.equal(supplied.open,1);
assert.equal(supplied.comp,88);
const unsupplied=metrics.scoreData();
assert.equal(applicabilityCalls,4,"other callers retain default rule filtering");
assert.deepEqual({...unsupplied},{...supplied});

const animateStart=runtime.indexOf("const workspaceNumberAnimations=new WeakMap();");
const animateEnd=runtime.indexOf("\n\nfunction startOAuth(",animateStart);
assert(animateStart>=0&&animateEnd>animateStart,"counter animation extraction bounds");
const frames=new Map(),cancelled=[];
let n=0;
const element={textContent:"0"};
const context=vm.createContext({
  WeakMap,Number,performance:{now:()=>0},
  window:{matchMedia:()=>({matches:false})},
  requestAnimationFrame:fn=>{const id=++n;frames.set(id,fn);return id;},
  cancelAnimationFrame:id=>{cancelled.push(id);frames.delete(id);}
});
vm.runInContext(runtime.slice(animateStart,animateEnd),context);
context.animateNumber(element,5);
assert.equal(frames.size,1);
context.animateNumber(element,5);
assert.equal(frames.size,1,"same target must not schedule a second animation");
context.animateNumber(element,9);
assert.equal(frames.size,1,"new target must cancel the old frame");
assert.equal(cancelled.length,1);
for(const callback of [...frames.values()]){frames.clear();callback(420);}
assert.equal(element.textContent,"9","new target reaches exact final number");
assert.equal(frames.size,0);
context.animateNumber(element,9);
assert.equal(frames.size,0,"completed unchanged target does not restart");
element.textContent="2";
context.animateNumber(element,9);
assert.equal(frames.size,1,"externally changed value can be restored");
context.window.matchMedia=()=>({matches:true});
context.animateNumber(element,12);
assert.equal(element.textContent,"12","reduced-motion path updates immediately");
assert.equal(frames.size,0,"reduced motion cancels pending animation");
console.log("PASS: workspace scores reuse applicable controls and action counter avoids duplicate animation frames.");
