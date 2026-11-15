/**
 * Inert cross-module API acceptance: verified session -> upload -> layout save
 * -> private saved image -> two-page PDF preview. Synthetic fixtures only.
 * Does not prove production D1/R2, real rasterization or pdf-lib integration.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {handleQuotationLogoHttp} from "../server/quotation-logo-http.mjs";
import {handleQuotationLogoPdfPreview} from "../server/quotation-logo-pdf-http.mjs";

const pageOne={width:612.24,height:858.96};
const pageTwo={width:841.92,height:1190.64};
const png=Uint8Array.from([137,80,78,71,13,10,26,10,...new Array(80).fill(0)]);
const pdfBytes=Uint8Array.from(Buffer.from("%PDF-1.7\nSYNTHETIC QUOTATION PDF"));
const actor={verifiedSession:"tenant-A-session"};
function createHarness(){
 const assets=new Map(),saved=new Map(),pdfDraws=[];
 const store={
  async writePrivateAsset({companyId,mimeType,bytes,width,height}){
   const id="logo_"+(assets.size+1);
   assets.set(companyId+":"+id,{mimeType,bytes,width,height,aspectRatio:width/height});
   return {logoAssetId:id};
  },
  async readPrivateAsset({companyId,logoAssetId}){
   return assets.get(companyId+":"+logoAssetId)||null;
  },
  async getCompanyLogoSettings({companyId}){
   return saved.get(companyId)||null;
  },
  async upsertCompanyLogoSettings({companyId,settings}){
   assert.equal(companyId,settings.companyId);
   saved.set(companyId,settings);
  }
 };
 const authorization={
  assertCompanyEditor:async({actor:a,companyId})=>a===actor&&companyId==="tenantA",
  assertCompanyReader:async({actor:a,companyId})=>a===actor&&companyId==="tenantA"
 };
 const verifyMutation=async({actor:a,companyId,request})=>
  a===actor&&companyId==="tenantA"&&request.headers.get("x-csrf-token")==="confirmed-csrf";
 const decodeAndSanitizeLogo=async({bytes,mimeType})=>{
  assert.equal(mimeType,"image/png");
  assert.equal(bytes.length,png.length);
  return {type:"image/png",bytes:new Uint8Array(png),width:200,height:100};
 };
 const templates={getApprovedLogoFreeTemplate:async({companyId})=>{
  assert.equal(companyId,"tenantA");
  return {id:"synthetic-approved",logoFree:true,pageCount:2,bytes:pdfBytes,pages:[
   {...pageOne,logoZone:{x:0,y:0,width:320,height:250}},
   {...pageTwo,logoZone:{x:0,y:0,width:253,height:300}}
  ]};
 }};
 const pdfLib={PDFDocument:{load:async()=>({
  getPages:()=>[
   {getSize:()=>pageOne,drawImage:(_,rect)=>pdfDraws.push(rect)},
   {getSize:()=>pageTwo,drawImage:(_,rect)=>pdfDraws.push(rect)}
  ],embedPng:async()=>({}),save:async()=>pdfBytes
 })}};
 const request=(path,init={},overrides={})=>handleQuotationLogoHttp({
  request:new Request("https://thebedesk.com"+path,init),actor,companyId:"tenantA",
  store,authorization,verifyMutation,decodeAndSanitizeLogo,...overrides
 });
 const preview=(overrides={})=>handleQuotationLogoPdfPreview({
  request:new Request("https://thebedesk.com/api/quotation/logo/pdf-preview"),
  actor,companyId:"tenantA",store,authorization,templates,pdfLib,...overrides
 });
 return {request,preview,pdfDraws,store};
}
test("tenant A uploads, saves, reloads and previews the exact saved logo layout",async()=>{
 const h=createHarness();
 const upload=await h.request("/api/quotation/logo/upload",{
  method:"POST",headers:{"content-type":"image/png","x-csrf-token":"confirmed-csrf"},body:png
 });
 assert.equal(upload.status,201);
 const {logoAssetId,aspectRatio}=await upload.json().then(v=>v);
 assert.equal(aspectRatio,2);
 const layout={xPercent:4,yPercent:2,widthPercent:20};
 const saved=await h.request("/api/quotation/logo",{
  method:"PUT",headers:{"content-type":"application/json","x-csrf-token":"confirmed-csrf"},
  body:JSON.stringify({logoAssetId,aspectRatio,layout})
 });
 assert.equal(saved.status,200);
 const reload=await h.request("/api/quotation/logo");
 const content=await reload.json();
 assert.equal(content.settings.logoAssetId,logoAssetId);
 assert.equal(content.settings.layout.widthPercent,20);
 const image=await h.request("/api/quotation/logo/image");
 assert.equal(image.status,200);
 assert.equal(image.headers.get("cache-control"),"private, no-store");
 assert.deepEqual(new Uint8Array(await image.arrayBuffer()),png);
 const preview=await h.preview();
 assert.equal(preview.status,200);
 assert.equal(preview.headers.get("content-type"),"application/pdf");
 assert.equal(h.pdfDraws.length,2);
 assert.ok(Math.abs(h.pdfDraws[0].width-122.448)<0.001);
 assert.ok(h.pdfDraws[1].width<h.pdfDraws[0].width*2);
});
test("one tenant cannot upload, save, reload or export against another tenant",async()=>{
 const h=createHarness();
 const attempt=await h.request("/api/quotation/logo/upload",{
  method:"POST",headers:{"content-type":"image/png","x-csrf-token":"confirmed-csrf"},body:png
 },{companyId:"tenantB"});
 assert.equal(attempt.status,403);
 const read=await h.request("/api/quotation/logo/image",{}, {companyId:"tenantB"});
 assert.equal(read.status,403);
 const preview=await h.preview({companyId:"tenantB"});
 assert.equal(preview.status,403);
 assert.equal(h.pdfDraws.length,0);
});
test("missing or invalid anti-CSRF token denies upload before image processing",async()=>{
 const h=createHarness();
 const response=await h.request("/api/quotation/logo/upload",{
  method:"POST",headers:{"content-type":"image/png"},body:png
 },{decodeAndSanitizeLogo:async()=>{throw Error("processor_must_not_run")}});
 assert.equal(response.status,403);
});
