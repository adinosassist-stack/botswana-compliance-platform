import test from "node:test";
import assert from "node:assert/strict";
import {handleQuotationDraftPdfPreview} from "../server/quotation-draft-pdf-http.mjs";

const ORIGIN="https://thebedesk.com/api/quotation/draft/pdf-preview";
const actor={trustedSession:true},companyId="tenantA";
const logo=new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAYAAACbU/80AAAALElEQVR42u3OIQEAAAgDMJKg6Z+HLhDjZmJ+tT2XVAICAgICAgICAgICAgIC6cADRvhjW1wPDGYAAAAASUVORK5CYII=","base64"));
const validDraft=()=>({
 quoteNumber:"QT-001",issueDate:"2026-11-15",
 customerName:"Synthetic Customer",customerContact:"Gaborone",
 items:[{description:"Memorial",quantity:2,unitPriceCents:150000}],
 discountCents:10000,paymentMethod:"Transfer"
});
function setup(){
 const calls={reader:0,write:0,load:0,text:[],image:0};
 const authorization={
  assertCompanyEditor:async({actor:a,companyId:id})=>a===actor&&id===companyId,
  assertCompanyReader:async({actor:a,companyId:id})=>a===actor&&id===companyId
 };
 const store={
  writePrivateAsset:async()=>{calls.write++;throw Error("preview_must_not_write")},
  upsertCompanyLogoSettings:async()=>{calls.write++;throw Error("preview_must_not_write")},
  getCompanyLogoSettings:async({companyId:id})=>{
   calls.reader++;
   return id===companyId?{companyId,logoAssetId:"logoA",layout:{xPercent:4,yPercent:2,widthPercent:20}}:null;
  },
  readPrivateAsset:async({companyId:id,logoAssetId})=>{
   calls.reader++;
   return id===companyId&&logoAssetId==="logoA"?{
    bytes:logo,mimeType:"image/png",width:32,height:24,aspectRatio:32/24
   }:null;
  }
 };
 const pages=[{width:612.24,height:858.96},{width:841.92,height:1190.64}].map(dim=>({
  getSize:()=>dim,getWidth:()=>dim.width,getHeight:()=>dim.height,
  drawImage:()=>{calls.image++},drawText:(s)=>{calls.text.push(s)},drawRectangle:()=>{}
 }));
 const pdfLib={
  StandardFonts:{Helvetica:"regular",HelveticaBold:"bold"},
  rgb:(r,g,b)=>({r,g,b}),
  PDFDocument:{load:async()=>{calls.load++;return {
   getPages:()=>pages,
   embedPng:async()=>({width:32,height:24}),embedJpg:async()=>({width:32,height:24}),
   embedFont:async()=>({widthOfTextAtSize:(s,size)=>s.length*size*.45}),
   save:async()=>new Uint8Array(Buffer.from("%PDF-1.7\nSYNTHETIC PREVIEW"))
  }}}
 };
 const templates={getApprovedLogoFreeTemplate:async()=>({
  id:"approvedSynthetic",logoFree:true,pageCount:2,bytes:new Uint8Array(Buffer.from("%PDF-1.7\nSYNTHETIC TEMPLATE")),
  pages:[
   {width:612.24,height:858.96,logoZone:{x:0,y:0,width:320,height:250}},
   {width:841.92,height:1190.64,logoZone:{x:0,y:0,width:253,height:300}}
  ]
 })};
 const verifyMutation=async({request})=>request.headers.get("x-csrf-token")==="validToken";
 const call=(draft=validDraft(),overrides={},opts={})=>handleQuotationDraftPdfPreview({
  request:new Request(opts.url||ORIGIN,{
   method:opts.method||"POST",
   headers:{"content-type":opts.type||"application/json","x-csrf-token":opts.token||"validToken"},
   body:opts.method==="GET"?undefined:(opts.rawBody??JSON.stringify(draft))
  }),
  actor,companyId,authorization,verifyMutation,store,templates,pdfLib,...overrides
 });
 return {call,calls,store};
}
test("POST renders two-page branded draft without writes and with server-recomputed totals",async()=>{
 const {call,calls}=setup();
 const result=await call();
 assert.equal(result.status,200);
 assert.equal(result.headers.get("content-type"),"application/pdf");
 assert.equal(result.headers.get("cache-control"),"private, no-store");
 assert.equal(result.headers.get("content-disposition"),'attachment; filename="quotation-draft-preview.pdf"');
 assert.equal(new TextDecoder().decode(await result.arrayBuffer()).startsWith("%PDF-"),true);
 assert.equal(calls.write,0);assert.equal(calls.image,2);
 assert.ok(calls.text.includes("P3,000.00"));
 assert.ok(calls.text.includes("-P100.00"));
 assert.ok(calls.text.includes("P2,900.00"));
});
test("unauthorized tenant and CSRF rejection occur before storage or parsing",async()=>{
 const {call,calls}=setup();
 assert.equal((await call(null,{companyId:"tenantB"},{rawBody:"{"})).status,403);
 assert.equal((await call(null,{verifyMutation:async()=>false},{rawBody:"{"})).status,403);
 assert.equal(calls.reader,0);assert.equal(calls.load,0);
});
test("authorization and CSRF exceptions fail closed",async()=>{
 const {call,calls}=setup();
 assert.equal((await call(undefined,{authorization:{
  assertCompanyEditor:async()=>{throw Error("identity_offline")}
 }})).status,403);
 assert.equal((await call(undefined,{verifyMutation:async()=>{throw Error("csrf_offline")}})).status,403);
 assert.equal(calls.reader,0);
});
test("rejects invalid monetary input, forged subtotal and too many items",async()=>{
 const {call,calls}=setup();
 assert.equal((await call({...validDraft(),items:[{description:"X",quantity:1,unitPriceCents:-5}]})).status,400);
 assert.equal((await call({...validDraft(),subtotalCents:1})).status,400);
 assert.equal((await call({...validDraft(),items:Array.from({length:9},()=>({
  description:"Item",quantity:1,unitPriceCents:100
 }))})).status,400);
 assert.equal(calls.load,0);assert.equal(calls.reader,0);
});
test("rejects unsupported format, oversized request and malformed JSON",async()=>{
 const {call,calls}=setup();
 assert.equal((await call(undefined,{}, {type:"text/plain"})).status,415);
 assert.equal((await call(undefined,{}, {rawBody:"x".repeat(32769)})).status,413);
 assert.equal((await call(undefined,{}, {rawBody:"{"})).status,400);
 assert.equal(calls.load,0);assert.equal(calls.reader,0);
});
test("GET and mismatched paths do not render anything",async()=>{
 const {call,calls}=setup();
 assert.equal((await call(undefined,{}, {method:"GET"})).status,405);
 assert.equal((await call(undefined,{}, {url:"https://thebedesk.com/api/quotation/logo/pdf-preview"})).status,404);
 assert.equal(calls.load,0);
});
test("an absent CSRF verifier is always denied",async()=>{
 const {call,calls}=setup();
 assert.equal((await call(undefined,{verifyMutation:undefined})).status,403);
 assert.equal(calls.reader,0);
});

test("private logo with altered but proportional metadata cannot be downloaded in draft PDF",async()=>{
 const {call,calls,store}=setup();
 const forgedStore={...store,
  readPrivateAsset:async args=>{
   const original=await store.readPrivateAsset(args);
   return original?{...original,width:64,height:48}:original;
  }
 };
 const result=await call(undefined,{store:forgedStore});
 assert.equal(result.status,422);
 assert.equal((await result.json()).error,"quotation_draft_pdf_preview_unavailable");
 assert.equal(calls.image,0,"no images drawn when bytes disagree with saved dimensions");
 assert.equal(calls.write,0,"preview never overwrites the logo asset or settings");
});
