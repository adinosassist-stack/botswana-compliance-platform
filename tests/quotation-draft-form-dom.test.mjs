import test from "node:test";
import assert from "node:assert/strict";
import {mountQuotationDraftForm} from "../public/js/quotation-draft-form.mjs";

/** Small deterministic DOM event emulator for opt-in form mounting tests.
 * No browser network, storage or real customer data are used.
 */
class Element {
 constructor(tag){
  this.tagName=tag.toUpperCase();this.children=[];this.attributes={};
  this.listeners={};this.parent=null;this.textContent="";this.value="";
  this.disabled=false;this.hidden=false;
 }
 setAttribute(key,value){this.attributes[key]=String(value)}
 append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node)}}
 replaceChildren(...nodes){for(const child of this.children)child.parent=null;this.children=[];this.append(...nodes)}
 remove(){if(!this.parent)return;const parent=this.parent;
  parent.children.splice(parent.children.indexOf(this),1);this.parent=null}
 addEventListener(type,callback){(this.listeners[type]??=[]).push(callback)}
 async fire(type){
  const event={type,preventDefault(){}};
  for(let element=this;element;element=element.parent){
   for(const callback of element.listeners[type]||[])await callback(event);
  }
 }
 click(){this.clicked=true}
}
const getAll=(root,match)=>{
 const result=[];function visit(n){if(match(n))result.push(n);for(const c of n.children)visit(c)}
 visit(root);return result;
};
const getButton=(root,text)=>getAll(root,n=>n.tagName==="BUTTON"&&n.textContent===text)[0];
const getInput=(root,label)=>{
 const item=getAll(root,n=>n.tagName==="LABEL"&&n.textContent===label)[0];
 return item?.children.find(n=>n.tagName==="INPUT");
};
const cap={enabled:true,authenticated:true,canEditQuotations:true};
const start={
 quoteNumber:"QT-001",issueDate:"2026-11-15",customerName:"Synthetic Person",
 customerContact:"Gaborone",items:[{description:"Headstone",quantity:1,unitPriceCents:120000}],
 discountCents:2000
};
function mount(options={}){
 const before=globalThis.document;
 globalThis.document={createElement:tag=>new Element(tag),querySelector:()=>null};
 const root=new Element("div");
 const api=mountQuotationDraftForm(root,{
  capability:cap,csrfToken:"verified-session-token",
  fetchImpl:async()=>new Response(new Uint8Array(Buffer.from("%PDF-1.7\nTEST")),{
   status:200,headers:{"content-type":"application/pdf"}}),
  initialDraft:start,...options
 });
 const restore=()=>{api.destroy();globalThis.document=before};
 return {root,api,restore};
}
test("refuses form mounting unless authenticated edit capability is explicitly present",()=>{
 assert.throws(()=>mountQuotationDraftForm(new Element("div"),{
  capability:{enabled:true,authenticated:false,canEditQuotations:true}
 }),/quotation_draft_form_disabled/);
});
test("mount renders valid quote with live BWP totals without any network call",()=>{
 let calls=0;
 const {root,api,restore}=mount({fetchImpl:async()=>{calls++;throw Error("unexpected")}})
 try{
  assert.equal(calls,0);
  assert.equal(getButton(root,"Download PDF preview").disabled,false);
  const draft=api.getDraft();
  assert.equal(draft.items.length,1);
  assert.equal(draft.items[0].unitPriceCents,120000);
  assert.equal(draft.discountCents,2000);
  assert.ok(getAll(root,n=>n.textContent==="P1,180.00").length>0);
  assert.ok(getAll(root,n=>n.textContent.includes("Nothing is saved or issued.")).length>0);
 }finally{restore()}
});
test("add/remove rows cannot exceed eight and invalid rows disable preview",async()=>{
 const {root,api,restore}=mount();
 try{
  const add=getButton(root,"Add item"),preview=getButton(root,"Download PDF preview");
  await add.fire("click");
  assert.equal(preview.disabled,true);
  assert.throws(()=>api.getDraft(),/invalid_quotation_item|invalid_bwp_amount/);
  const remove=getAll(root,n=>n.tagName==="BUTTON"&&n.textContent==="Remove").at(-1);
  await remove.fire("click");
  assert.equal(preview.disabled,false);
  for(let i=1;i<8;i++)await add.fire("click");
  assert.equal(add.disabled,true);
  assert.equal(getAll(root,n=>n.attributes.class==="qdf-row").length,8);
 }finally{restore()}
});
test("form submission makes one CSRF-protected nonissuing POST and provides a PDF",async()=>{
 const seen=[];
 const {root,api,restore}=mount({fetchImpl:async(path,init)=>{
  seen.push({path,init});
  return new Response(new Uint8Array(Buffer.from("%PDF-1.7\nSYNTHETIC")),{
   status:200,headers:{"content-type":"application/pdf"}});
 }});
 try{
  const form=getAll(root,n=>n.tagName==="FORM")[0];
  await form.fire("submit");
  assert.equal(seen.length,1);
  assert.equal(seen[0].path,"/api/quotation/draft/pdf-preview");
  assert.equal(seen[0].init.method,"POST");
  assert.equal(seen[0].init.credentials,"same-origin");
  assert.equal(seen[0].init.headers["x-csrf-token"],"verified-session-token");
  assert.ok(getAll(root,n=>String(n.textContent).startsWith("PDF downloaded.")).length>0);
 }finally{restore()}
});
test("invalid entered Pula amount prevents submission and makes no requests",async()=>{
 let requests=0;
 const {root,api,restore}=mount({fetchImpl:async()=>{
  requests++;throw Error("network_should_not_be_called")
 }});
 try{
  const amount=getInput(root,"Discount (P)");
  amount.value="1.234";
  await amount.fire("input");
  assert.equal(getButton(root,"Download PDF preview").disabled,true);
  assert.equal(requests,0);
 }finally{restore()}
});
