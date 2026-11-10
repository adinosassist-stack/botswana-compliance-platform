import test from "node:test";
import assert from "node:assert/strict";
import {renderAgentApprovalPreview} from "../public/js/agent-approval-preview.js";

test("renders inert, escaped text-only preview with no interactive controls",()=>{
 const original=globalThis.document;
 const created=[];
 const doc={
  createElement(tag){
   const node={tag,textContent:"",children:[],attributes:{},append(...items){this.children.push(...items);},setAttribute(k,v){this.attributes[k]=v;}};
   created.push(node);return node;
  },
  createTextNode(value){return {type:"text",value:String(value)};}
 };
 let resultNode=null;
 const container={replaceChildren(...nodes){resultNode=nodes[0]??null;}};
 const payload='<img src=x onerror=alert(1)>';
 const proposal={ok:true,workflow:payload,proposedActions:[payload],requiredPermissions:["finance:invoices:read"],estimatedCostUnits:2,executionAllowed:false,sideEffects:false};
 const result={ok:true,proposal,approvalState:"not_requested",approvalRequired:"owner",executionAllowed:false,sideEffects:false,canSubmitApproval:false};
 try{
  globalThis.document=doc;
  assert.equal(renderAgentApprovalPreview(container,result),true);
  assert.equal(resultNode.tag,"section");
  assert.equal(resultNode.attributes["aria-label"],"Agent approval preview");
  assert.equal(created.some(n=>["button","input","form","a"].includes(n.tag)),false);
  assert.equal(created.some(n=>Object.hasOwn(n,"innerHTML")),false);
  const texts=created.flatMap(n=>n.children).filter(x=>x.type==="text").map(x=>x.value);
  assert.ok(texts.includes(payload));
 }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});
