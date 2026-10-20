import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync("public/js/locations-branches-v335.js","utf8");
const targets=[],handlers=new Map(),observations=[];
let created=0;
const makeSection=(id)=>({
  id,querySelector:()=>null,
  classList:{contains:()=>false},hidden:false,
  getAttribute:()=>null
});
let people=makeSection("peopleops");
let settings=makeSection("accounthub");
const body={id:"body"};
const document={
  body,documentElement:{dataset:{}},
  getElementById:(id)=>id==="peopleops"?people:id==="accounthub"?settings:null,
  addEventListener:(type,fn)=>handlers.set("document:"+type,fn),
  createElement:()=>({dataset:{},append(){},addEventListener(){},setAttribute(){}})
};
class MutationObserver {
  constructor(fn){this.fn=fn;created++}
  observe(target,options){observations.push({target,options,observer:this});targets.push(target)}
  disconnect(){this.disconnected=true}
}
const window={whenThebeWorkspaceReady:fn=>fn(),addEventListener:(type,fn)=>handlers.set(type,fn)};
vm.runInNewContext(source,{window,document,MutationObserver,queueMicrotask,setTimeout,console});
assert.equal(created,2,"People and Settings are the only workspace observer roots");
assert.equal(observations.length,2);
assert.deepEqual(targets.map(x=>x.id),["peopleops","accounthub"],"must never observe entire document body");
assert(observations.every(x=>x.options.childList===true&&x.options.subtree===true));
assert.equal(typeof window.openLocationsBranches,"function","Add Location entry action preserved");
assert.equal(typeof handlers.get("thebe:workspace-view-change"),"function","navigation rebind is registered");

const nav=handlers.get("thebe:workspace-view-change");
nav({detail:{id:"dashboard"}});
assert.equal(observations.length,2,"unrelated navigation must not rebind views");
nav({detail:{id:"peopleops"}});
assert.equal(observations.length,2,"same People root must not attach duplicate observer");
const oldPeople=people;
people=makeSection("peopleops");
nav({detail:{id:"peopleops"}});
assert.equal(observations.length,3,"replaced People root must gain new observer");
assert(observations[0].observer.disconnected,"stale People observer must disconnect");
nav({detail:{id:"accounthub"}});
assert.equal(observations.length,3,"Settings navigation must re-use current observer");
const oldSettings=settings;
settings=makeSection("accounthub");
nav({detail:{id:"accounthub"}});
assert.equal(observations.length,4,"replaced Settings root must gain new observer");
assert(observations[1].observer.disconnected,"stale Settings observer must disconnect");
assert.equal(oldPeople.id,"peopleops");
assert.equal(oldSettings.id,"accounthub");
console.log("PASS Locations & Branches watches People and Settings only, rebinds replaced roots, and preserves action.");
