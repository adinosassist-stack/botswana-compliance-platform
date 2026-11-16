import test from "node:test";
import assert from "node:assert/strict";
import {mountQuotationDraftManager} from "../public/js/quotation-draft-manager.mjs";

class Element{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.parent=null;this.listeners={};
  this.attributes={};this.value="";this.textContent="";this.disabled=false;this.hidden=false;}
 setAttribute(key,value){this.attributes[key]=String(value)}
 append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node)}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes)}
 addEventListener(type,callback){(this.listeners[type]??=[]).push(callback)}
 async fire(type){for(const callback of this.listeners[type]??[])await callback({type})}
}
const find=(node,fn)=>fn(node)?node:node.children.map(child=>find(child,fn)).find(Boolean);
const button=(root,name)=>find(root,x=>x.tagName==="BUTTON"&&x.textContent===name);
const input=root=>find(root,x=>x.tagName==="INPUT");
const status=root=>find(root,x=>x.attributes.role==="status");
const cap={enabled:true,authenticated:true,canEditQuotations:true};
const draft=()=>({quoteNumber:"QT001",issueDate:"2026-11-15",customerName:"Synthetic",customerContact:"Gaborone",
 items:[{description:"Stone",quantity:1,unitPriceCents:10000}],discountCents:0});
function fixture({client}={}){
 const before=globalThis.document;
 globalThis.document={createElement:tag=>new Element(tag),querySelector:()=>null};
 const root=new Element("div");
 let current=draft(),applied=0;
 const calls=[];
 const adapter=client??{
  save:async args=>{calls.push({type:"save",args});return {draftId:args.draftId,revision:args.revision+1,draft:args.draft}},
  load:async id=>{calls.push({type:"load",id});return {draftId:id,revision:5,draft:{...draft(),customerName:"Saved"}}}
 };
 const manager=mountQuotationDraftManager(root,{capability:cap,client:adapter,
  getDraft:()=>current,applyDraft:next=>{current=next;applied++}});
 return {root,calls,manager,edit:next=>{current=next},current:()=>current,applied:()=>applied,
  restore(){manager.destroy();globalThis.document=before}};
}
test("manager is opt-in and does not access network or storage at mount",()=>{
 assert.throws(()=>mountQuotationDraftManager(new Element("div"),{}),/quotation_manager_disabled/);
 const {root,calls,restore}=fixture();
 try{assert.equal(calls.length,0);assert.equal(button(root,"Save Draft").disabled,true)}
 finally{restore()}
});
test("Save Draft calls private client with editor data and tracks revisions",async()=>{
 const f=fixture();
 try{
  input(f.root).value="draft_01";await input(f.root).fire("input");
  await button(f.root,"Save Draft").fire("click");
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].args.revision,0);
  assert.equal(f.calls[0].args.draftId,"draft_01");
  assert.equal(f.manager.getRevision().revision,1);
  await button(f.root,"Save Draft").fire("click");
  assert.equal(f.calls[1].args.revision,1);
  assert.match(status(f.root).textContent,/Not issued/);
 }finally{f.restore()}
});
test("Open Draft always requires confirmation before overwriting editor",async()=>{
 const f=fixture();
 try{
  input(f.root).value="draft_01";await input(f.root).fire("input");
  await button(f.root,"Open Draft").fire("click");
  assert.equal(f.applied(),0);
  assert.equal(button(f.root,"Confirm Open").hidden,false);
  await button(f.root,"Confirm Open").fire("click");
  assert.equal(f.applied(),1);
  assert.equal(f.current().customerName,"Saved");
  assert.equal(f.manager.getRevision().revision,5);
 }finally{f.restore()}
});
test("edits made during async load prevent replacement of current draft",async()=>{
 let finish;
 const promise=new Promise(resolve=>finish=resolve);
 const f=fixture({client:{save:async()=>{throw Error("should_not_save")},
  load:async()=>promise}});
 try{
  input(f.root).value="draft_01";await input(f.root).fire("input");
  const loading=button(f.root,"Open Draft").fire("click");
  f.edit({...draft(),customerName:"Local unsaved"});
  finish({draftId:"draft_01",revision:2,draft:{...draft(),customerName:"Remote"}});
  await loading;
  assert.equal(f.applied(),0);
  assert.equal(button(f.root,"Confirm Open").hidden,true);
 }finally{f.restore()}
});
test("invalid references never call storage",async()=>{
 const f=fixture();
 try{
  input(f.root).value="a/b";await input(f.root).fire("input");
  assert.equal(button(f.root,"Save Draft").disabled,true);
  await button(f.root,"Save Draft").fire("click");
  await button(f.root,"Open Draft").fire("click");
  assert.equal(f.calls.length,0);
 }finally{f.restore()}
});
