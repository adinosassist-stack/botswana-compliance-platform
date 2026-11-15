import test from "node:test";
import assert from "node:assert/strict";
import {handleQuotationLogoPdfPreview} from "../server/quotation-logo-pdf-http.mjs";
const url="https://thebedesk.com/api/quotation/logo/pdf-preview";
const actor={verifiedSession:"test"};
const companyId="lovelyA";
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const pdfBytes=Uint8Array.from(Buffer.from("%PDF-1.7\nTEST\n"));
const approval={
 assertCompanyReader:async({companyId:company})=>company==="lovelyA",
 assertCompanyEditor:async()=>true
};
const store={
 getCompanyLogoSettings:async({companyId:company})=>company==="lovelyA"?{
  companyId:company,logoAssetId:"logo1",layout:{xPercent:4,yPercent:2,widthPercent:20}
 }:null,
 readPrivateAsset:async({companyId:company})=>company==="lovelyA"?{
  bytes:png,mimeType:"image/png",aspectRatio:2
 }:null,
 writePrivateAsset:async()=>({}),upsertCompanyLogoSettings:async()=>{}
};
const approvedPages=[
 {width:612.24,height:858.96,logoZone:{x:0,y:0,width:320,height:250}},
 {width:841.92,height:1190.64,logoZone:{x:0,y:0,width:253,height:300}}
];
const templates={getApprovedLogoFreeTemplate:async({companyId:company})=>company==="lovelyA"?{
 id:"approved_v1",logoFree:true,pageCount:2,bytes:pdfBytes,pages:approvedPages
 }:null};
let draws=[];
const pdfLib={PDFDocument:{load:async()=>{
 draws=[];
 return {getPages:()=>[
  {getSize:()=>({width:612.24,height:858.96}),drawImage:(_,rect)=>draws.push(rect)},
  {getSize:()=>({width:841.92,height:1190.64}),drawImage:(_,rect)=>draws.push(rect)}
 ],embedPng:async()=>({}),save:async()=>pdfBytes};
}}};
const call=(method="GET",more={})=>handleQuotationLogoPdfPreview({
 request:new Request(url,{method}),actor,companyId,authorization:approval,
 store,templates,pdfLib,...more
});
test("company reader receives an attachment with both pages branded",async()=>{
 const res=await call();
 assert.equal(res.status,200);
 assert.equal(res.headers.get("content-type"),"application/pdf");
 assert.match(res.headers.get("content-disposition"),/attachment/);
 assert.equal(res.headers.get("cache-control"),"private, no-store");
 assert.equal(res.headers.get("x-content-type-options"),"nosniff");
 assert.equal(draws.length,2);
 assert.deepEqual(new Uint8Array(await res.arrayBuffer()),pdfBytes);
});
test("rejects unauthorized company and missing actor before rendering",async()=>{
 const denied=await call("GET",{authorization:{...approval,assertCompanyReader:async()=>false}});
 assert.equal(denied.status,403);
 const absent=await call("GET",{actor:null});assert.equal(absent.status,403);
 const other=await call("GET",{companyId:"companyB"});assert.equal(other.status,403);
});
test("GET-only, no unconfigured PDF backend and correct path required",async()=>{
 assert.equal((await call("POST")).status,405);
 assert.equal((await call("GET",{pdfLib:null})).status,503);
 assert.equal((await call("GET",{request:new Request("https://thebedesk.com/api/other")})).status,404);
});
test("malformed PDF output is never downloaded as if valid",async()=>{
 const bad={PDFDocument:{load:async()=>({
  getPages:()=>[
   {getSize:()=>({width:612.24,height:858.96}),drawImage:()=>{}},
   {getSize:()=>({width:841.92,height:1190.64}),drawImage:()=>{}}
  ],embedPng:async()=>({}),save:async()=>Uint8Array.from([1,2,3,4,5])
 })}};
 const res=await call("GET",{pdfLib:bad});assert.equal(res.status,500);
 assert.equal(res.headers.get("content-type"),"application/json; charset=utf-8");
});

test("authorization outage fails closed without access to template or PDF engine",async()=>{
 let loaded=false;
 const res=await call("GET",{
  authorization:{...approval,assertCompanyReader:async()=>{throw Error("identity_service_timeout")}},
  templates:{getApprovedLogoFreeTemplate:async()=>{loaded=true;throw Error("should_not_be_called")}}
 });
 assert.equal(res.status,403);
 assert.equal(loaded,false);
 assert.equal((await res.json()).error,"quotation_pdf_access_denied");
});
test("PDF output larger than 10 MiB is rejected by server before response",async()=>{
 const big=new Uint8Array(10*1024*1024+1);
 big.set(Buffer.from("%PDF-1.7"));
 const oversized={PDFDocument:{load:async()=>({
  getPages:()=>[
   {getSize:()=>({width:612.24,height:858.96}),drawImage:()=>{}},
   {getSize:()=>({width:841.92,height:1190.64}),drawImage:()=>{}}
  ],embedPng:async()=>({}),save:async()=>big
 })}};
 const res=await call("GET",{pdfLib:oversized});
 assert.equal(res.status,500);
 assert.equal(res.headers.get("content-type"),"application/json; charset=utf-8");
 assert.equal((await res.json()).error,"invalid_quotation_pdf_output");
});
