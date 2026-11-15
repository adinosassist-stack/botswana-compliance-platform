import test from "node:test";
import assert from "node:assert/strict";
import {quotationLogoPdfPlacement,renderCompanyQuotationLogoPdf} from "../server/quotation-logo-pdf.mjs";
test("PDF coordinates invert Y while keeping original image ratio",()=>{
 const r=quotationLogoPdfPlacement({layout:{xPercent:4,yPercent:2,widthPercent:34},aspectRatio:2,pageWidth:612.24,pageHeight:858.96});
 assert.ok(Math.abs(r.x-24.4896)<0.001);
 assert.ok(Math.abs(r.width/r.height-2)<0.0001);
 assert.ok(r.y+r.height<858.96);
});
test("tall image remains within page on PDF placement",()=>{
 const r=quotationLogoPdfPlacement({layout:{xPercent:99,yPercent:99,widthPercent:60},aspectRatio:0.25,pageWidth:612.24,pageHeight:858.96});
 assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=612.241&&r.y+r.height<=858.961);
 assert.ok(r.height<=858.96*0.300001);
});
test("PDF renderer fails closed without approved tenant-specific logo-free template",async()=>{
 const a={assertCompanyReader:async()=>true,assertCompanyEditor:async()=>true};
 const store={
  readPrivateAsset:async()=>({mimeType:"image/png",bytes:Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]),aspectRatio:2}),
  getCompanyLogoSettings:async()=>({companyId:"a",logoAssetId:"l1",layout:{xPercent:4,yPercent:2,widthPercent:34}}),
  writePrivateAsset:async()=>({logoAssetId:"l1"}),upsertCompanyLogoSettings:async()=>{}
 };
 const mockPdf={PDFDocument:{load:async()=>{throw Error("should_not_load_unapproved_template")}}};
 await assert.rejects(renderCompanyQuotationLogoPdf({actor:{},companyId:"a",authorization:a,store,
  templates:{getApprovedLogoFreeTemplate:async()=>({id:"legacy",logoFree:false,pageCount:2,bytes:new Uint8Array([1])})},
  pdfLib:mockPdf}),/unapproved_logo_pdf_template/);
});
test("PNG placement renders only on page one of approved blank template",async()=>{
 const b=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
 const auth={assertCompanyReader:async()=>true,assertCompanyEditor:async()=>true};
 const settings={companyId:"a",logoAssetId:"l1",layout:{xPercent:4,yPercent:2,widthPercent:34}};
 const store={
  readPrivateAsset:async()=>({bytes:b,mimeType:"image/png",aspectRatio:2}),
  getCompanyLogoSettings:async()=>settings,writePrivateAsset:async()=>({logoAssetId:"l1"}),upsertCompanyLogoSettings:async()=>{}
 };
 const calls=[];const pdf={
  getPages:()=>[{getSize:()=>({width:612.24,height:858.96}),drawImage:(_,r)=>calls.push(r)},
   {getSize:()=>({width:841.92,height:1190.64}),drawImage:()=>{throw Error("page_two_must_not_change")}}],
  embedPng:async()=>({}),save:async()=>Uint8Array.from([37,80,68,70])
 };
 const result=await renderCompanyQuotationLogoPdf({actor:{},companyId:"a",authorization:auth,store,
  templates:{getApprovedLogoFreeTemplate:async()=>({id:"lovely-clean-v1",logoFree:true,pageCount:2,bytes:Uint8Array.from([37,80,68,70])})},
  pdfLib:{PDFDocument:{load:async()=>pdf}}});
 assert.equal(result.templateId,"lovely-clean-v1");
 assert.equal(calls.length,1);assert.equal(result.logoAssetId,"l1");
});
