import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync("public/js/market-thebe-gemini-narrow-v274.js","utf8");
function exercise(expanded){
  const pending=[];
  function style(){
    const map=new Map();
    return {
      map,
      getPropertyValue:key=>map.get(key)?.value||"",
      getPropertyPriority:key=>map.get(key)?.priority||"",
      setProperty:(key,value,priority)=>map.set(key,{value,priority}),
      removeProperty:key=>map.delete(key)
    };
  }
  const dock={id:"thebeAiDock",hidden:false,dataset:{surface:"public",expanded:String(expanded)},style:style(),getAttribute:()=>null};
  const gate={style:style()};
  const body={classList:{contains:key=>key==="thebe-ai-expanded"&&expanded}};
  const document={body,documentElement:body,readyState:"complete",getElementById:id=>id==="thebeAiDock"?dock:id==="marketingGate"?gate:null};
  const window={innerWidth:1440,addEventListener:()=>{}};
  const ctx={window,document,getComputedStyle:()=>({display:"flex",visibility:"visible",contentVisibility:"visible"}),requestAnimationFrame:cb=>{pending.push(cb);return pending.length}};
  vm.runInNewContext(source,ctx,{filename:"market-thebe-gemini-narrow-v274.js"});
  assert.equal(pending.length,1);
  pending.shift()();
  const get=(node,name)=>node.style.getPropertyValue(name);
  return {dock,gate,get};
}
const full=exercise(true);
for(const prop of ["left","right","top","bottom"])assert.equal(full.get(full.dock,prop),"0px",prop);
assert.equal(full.get(full.dock,"width"),"100vw");
assert.equal(full.get(full.dock,"height"),"100dvh");
assert.equal(full.get(full.dock,"max-width"),"none");
assert.equal(full.get(full.dock,"border-radius"),"0px");
assert.equal(full.get(full.gate,"padding-right"),"0px");
const compact=exercise(false);
assert.equal(compact.get(compact.dock,"width"),"403px");
assert.equal(compact.get(compact.dock,"right"),"16px");
assert.equal(compact.get(compact.gate,"padding-right"),"435px");
console.log("public fullscreen and compact Dock geometry passed");
