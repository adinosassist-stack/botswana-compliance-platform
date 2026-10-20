import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source=fs.readFileSync("public/js/workspace-lazy-hydration-recovery-v533.js","utf8");
const start=source.indexOf("  const FAILED_LAZY_SELECTOR=");
const end=source.indexOf("\n  if(document.readyState==='loading')",start);
assert(start>0&&end>start,"bounded recovery observer is discoverable");
const section=source.slice(start,end);
const recovered=[];
let observed=null,callback=null,documentScans=0;
const document={body:{},querySelectorAll(){documentScans++;return []}};
class MutationObserver{
  constructor(fn){callback=fn;}
  observe(target,options){observed={target,options};}
}
const context=vm.createContext({document,MutationObserver,recover:root=>recovered.push(root)});
vm.runInContext(section+"\nboot();",context);
assert.equal(documentScans,1,"initial boot scans existing failed views once");
assert.equal(observed.target,document.body);
assert(observed.options.attributeFilter.includes("data-lazy-error"),"direct error mutation still observed");
const unrelated={nodeType:1,matches:()=>false,querySelectorAll:()=>[]};
callback([{type:"childList",addedNodes:[unrelated]}]);
callback([{type:"childList",addedNodes:[]}]);
assert.equal(documentScans,1,"unrelated child changes cannot requery the whole document");
assert.equal(recovered.length,0);
const failing={nodeType:1,dataset:{lazyError:"1",lazyRecoveryExhausted:""},matches:()=>true,querySelectorAll:()=>[]};
callback([{type:"childList",addedNodes:[{nodeType:3},failing]}]);
assert.deepEqual(recovered,[failing],"inserted failed lazy root is recovered");
const nested={nodeType:1,matches:()=>false,querySelectorAll:()=>[failing]};
callback([{type:"childList",addedNodes:[nested]}]);
assert.equal(recovered.length,2,"newly inserted subtree with failed view is recovered");
callback([{type:"attributes",attributeName:"data-lazy-error",target:failing}]);
assert.equal(recovered.length,3,"existing lazy error attr still triggers recovery");
failing.dataset.lazyRecoveryExhausted="1";
callback([{type:"attributes",attributeName:"data-lazy-error",target:failing}]);
assert.equal(recovered.length,3,"exhausted retry state is never reactivated");
assert.equal(documentScans,1,"attribute updates cannot issue full document scan");
console.log("PASS: lazy recovery limits mutation scans to new subtrees while preserving failure and exhaustion handling");
