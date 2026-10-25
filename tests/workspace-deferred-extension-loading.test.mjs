import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const readiness=readFileSync(new URL("../public/js/workspace-readiness-v305.js",import.meta.url),"utf8");
const modules=[
  {key:"daily-report-money-v331.js",views:["dailyreports"],unrelated:["dashboard","peopleops","accounthub"]},
  {key:"locations-branches-v335.js",views:["peopleops","accounthub"],unrelated:["dashboard","dailyreports","propertyintelligence"]}
];
function block(key){
  const at=readiness.indexOf('import(`/js/'+key);
  assert.ok(at>0,"missing dynamically imported extension "+key);
  const start=readiness.lastIndexOf("(()=>{",at);
  const end=readiness.indexOf("\n})();",at)+6;
  assert.ok(start>=0&&end>at,"missing loader IIFE boundary "+key);
  const code=readiness.slice(start,end);
  assert.match(code,/thebe:workspace-view-change/);
  assert.match(code,/function loadWhenVisible\(\)/);
  return code.replace(/\bimport\((`[^`]+`)\)/g,"window.__loadExtension($1)");
}
function harness(key,{active=null,rejectFirst=false}={}){
  const code=block(key);
  const callbacks=[],listeners=new Map(),calls=[],errors=[];
  let current=active;
  let first=rejectFirst;
  const window={
    whenThebeWorkspaceReady:fn=>callbacks.push(fn),
    addEventListener:(type,fn)=>listeners.set(type,fn),
    __loadExtension:path=>{
      calls.push(path);
      if(first){first=false;return Promise.reject(new Error("simulated transient extension failure"));}
      return Promise.resolve();
    }
  };
  const document={getElementById:id=>id===current?{classList:{contains:s=>s==="active"}}:null,
    readyState:"complete",addEventListener:()=>{throw Error("workspace-ready callback should be used")}};
  vm.runInNewContext(code,{window,document,console:{error:(...v)=>errors.push(v)}});
  return {callbacks,calls,errors,activate:id=>{current=id;listeners.get("thebe:workspace-view-change")({detail:{id}})},
    ready:()=>callbacks.forEach(fn=>fn()),flush:async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve()}};
}

for(const module of modules){
  test(module.key+" performs no unrelated post-login fetch and loads once on first target navigation",async()=>{
    const h=harness(module.key);
    h.ready();
    for(const view of module.unrelated)h.activate(view);
    assert.equal(h.calls.length,0,"unrelated navigation must not eagerly download "+module.key);
    h.activate(module.views[0]);
    assert.equal(h.calls.length,1,"first relevant navigation must request extension");
    h.activate(module.views[0]);h.activate(module.views.at(-1));
    await h.flush();
    assert.equal(h.calls.length,1,"repeated/relevant navigation must share completed extension");
    assert.ok(h.calls[0].includes(module.key));
  });
  test(module.key+" loads initial active relevant view after workspace readiness",async()=>{
    for(const target of module.views){
      const h=harness(module.key,{active:target});
      assert.equal(h.calls.length,0);
      h.ready();await h.flush();
      assert.equal(h.calls.length,1,target+" is first landing and must hydrate");
    }
  });
  test(module.key+" retains failed-download retry on a later relevant navigation",async()=>{
    const h=harness(module.key,{rejectFirst:true});
    h.ready();h.activate(module.views[0]);
    assert.equal(h.calls.length,1);
    await h.flush();
    assert.equal(h.errors.length,1);
    h.activate(module.views[0]);
    assert.equal(h.calls.length,2,"transient failure must not lock out retry");
  });
}
test("other dock, owner and contextual extension loader policies remain unaffected",()=>{
  assert.match(readiness,/window\.whenThebeWorkspaceReady\(loadOwnerAsk\)/);
  assert.match(readiness,/window\.whenThebeWorkspaceReady\(loadContextStarters\)/);
  assert.match(readiness,/window\.whenThebeWorkspaceReady\(scheduleWorkspaceFragmentWarmup\)/);
});
