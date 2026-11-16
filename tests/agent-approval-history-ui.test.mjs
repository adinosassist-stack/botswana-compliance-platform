import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {renderAgentApprovalHistory as render} from "../public/js/agent-approval-history.js";
test("history UI fails closed without DOM",()=>assert.equal(render({replaceChildren(){}},{ok:true,readOnly:true,items:[]}),false));
test("history UI contains no network, HTML injection or approval actions",()=>{
 const src=readFileSync(new URL("../public/js/agent-approval-history.js",import.meta.url),"utf8");
 assert.doesNotMatch(src,/\bfetch\s*\(|\bXMLHttpRequest\b|\binnerHTML\b|\blocalStorage\b|\beval\s*\(/);
});
test("renders records as text nodes without buttons or links",()=>{
 const previous=globalThis.document;const tags=[];
 globalThis.document={createElement(tag){tags.push(tag);return {tag,textContent:"",children:[],append(x){this.children.push(x)},setAttribute(){}}}};
 let displayed;
 const container={replaceChildren(x){displayed=x}};
 try{
  const record={id:"one",workflow:"<script>alert(1)</script>",status:"requested",timestamp:"2026-11-10T00:00:00Z"};
  assert.equal(render(container,{ok:true,readOnly:true,items:[record]}),true);
  assert.equal(displayed.tag,"section");assert.deepEqual(tags,["section","h3","ul","li"]);
  assert.equal(displayed.children[1].children[0].textContent.includes("<script>"),true);
  assert.equal(tags.includes("button"),false);
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
test("rejects malformed and unscoped data",()=>{
 const previous=globalThis.document;globalThis.document={createElement(){return {append(){},setAttribute(){}}}};
 let cleared=false;const container={replaceChildren(){cleared=true}};
 try{
  assert.equal(render(container,{ok:true,items:[]}),false);
  assert.equal(cleared,true);
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
