import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {renderAgentApprovalPreview} from "../public/js/agent-approval-preview.js";
test("approval preview requires browser DOM",()=>assert.equal(renderAgentApprovalPreview({replaceChildren(){}},{ok:true}),false));
test("approval UI has no execution, persistence or network APIs",()=>{
 const src=readFileSync(new URL("../public/js/agent-approval-preview.js",import.meta.url),"utf8");
 assert.doesNotMatch(src,/\bfetch\s*\(|\bXMLHttpRequest\b|\binnerHTML\b|\blocalStorage\b|\beval\s*\(/);
});
test("approval UI rejects spoofed approved or executable state",()=>{
 const old=globalThis.document;let cleared=false;
 globalThis.document={createElement(tag){return {tag,textContent:"",append(){},setAttribute(){}};},createTextNode(text){return {text}}};
 const container={replaceChildren(){cleared=true}};
 try{
  const proposal={ok:true,executionAllowed:false,sideEffects:false,proposedActions:[],requiredPermissions:[]};
  for(const bad of [{ok:true,proposal,approvalState:"approved",executionAllowed:false,sideEffects:false,canSubmitApproval:false},{ok:true,proposal,approvalState:"not_requested",executionAllowed:true,sideEffects:false,canSubmitApproval:false}]){
   cleared=false;assert.equal(renderAgentApprovalPreview(container,bad),false);assert.equal(cleared,true);
  }
 }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});
