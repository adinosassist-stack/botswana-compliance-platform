/**
 * Real PDF-Lib acceptance with a synthetic two-page, logo-free quotation.
 *
 * This runs ONLY in isolated CI with a separately installed engine. It tests
 * production-facing renderer logic with real PDF pages, PNG embedding and PDF
 * serialization, unlike mock-only unit tests. It does NOT contain customer data
 * or qualify the actual Lovely visual template or staging Cloudflare bindings.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {join} from "node:path";
import {createRequire} from "node:module";
import {renderCompanyQuotationLogoPdf} from "../server/quotation-logo-pdf.mjs";

const root=process.env.QUOTATION_PDF_ENGINE_ROOT;
if(!root)throw Error("real_pdf_acceptance_requires_isolated_engine_root");
const engine=createRequire(join(root,"quotation-acceptance.cjs"))("pdf-lib");
assert.equal(typeof engine.PDFDocument?.load,"function");
const logo=new Uint8Array(Buffer.from(
 "iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAYAAACbU/80AAAALElEQVR42u3OIQEAAAgDMJKg6Z+HLhDjZmJ+tT2XVAICAgICAgICAgIC6cADRvhjW1wPDGYAAAAASUVORK5CYII=",
 "base64"));
const tenant="fixtureTenant",actor={verified:true},aspect=32/24;
const auth={
 assertCompanyReader:async({actor:a,companyId})=>a===actor&&companyId===tenant,
 assertCompanyEditor:async()=>true
};
const store={
 writePrivateAsset:async()=>{throw Error("preview_must_not_write")},
 upsertCompanyLogoSettings:async()=>{throw Error("preview_must_not_update")},
 getCompanyLogoSettings:async({companyId})=>companyId===tenant?{
  companyId:tenant,logoAssetId:"syntheticLogo",layout:{xPercent:4,yPercent:2,widthPercent:20}
 }:null,
 readPrivateAsset:async({companyId,logoAssetId})=>companyId===tenant&&logoAssetId==="syntheticLogo"?{
  bytes:logo,mimeType:"image/png",width:32,height:24,aspectRatio:aspect
 }:null
};
async function template(){
 const pdf=await engine.PDFDocument.create();
 const page1=pdf.addPage([612.24,858.96]);
 const page2=pdf.addPage([841.92,1190.64]);
 const font=await pdf.embedFont(engine.StandardFonts.Helvetica);
 page1.drawText("Synthetic quotation: not issued", {x:40,y:540,size:14,font});
 page2.drawText("Synthetic terms and conditions", {x:40,y:600,size:14,font});
 return {id:"synthetic_logo_free_1",logoFree:true,pageCount:2,
  pages:[
   {width:612.24,height:858.96,logoZone:{x:0,y:0,width:320,height:250}},
   {width:841.92,height:1190.64,logoZone:{x:0,y:0,width:253,height:300}}
  ],
  bytes:new Uint8Array(await pdf.save())
 };
}
test("real PDF engine saves and reloads two correctly sized pages with logo images",async()=>{
 const approved=await template();
 const out=await renderCompanyQuotationLogoPdf({
  actor,companyId:tenant,authorization:auth,store,pdfLib:engine,
  templates:{getApprovedLogoFreeTemplate:async()=>approved}
 });
 assert.ok(out.bytes.length>approved.bytes.length);
 assert.deepEqual(Array.from(out.bytes.subarray(0,5)),Array.from(Buffer.from("%PDF-")));
 const loaded=await engine.PDFDocument.load(out.bytes);
 assert.equal(loaded.getPageCount(),2);
 const p1=loaded.getPage(0),p2=loaded.getPage(1);
 assert.equal(p1.getWidth(),612.24);assert.equal(p1.getHeight(),858.96);
 assert.equal(p2.getWidth(),841.92);assert.equal(p2.getHeight(),1190.64);
 const xObj1=p1.node.Resources().lookup(engine.PDFName.of("XObject"),engine.PDFDict);
 const xObj2=p2.node.Resources().lookup(engine.PDFName.of("XObject"),engine.PDFDict);
 assert.ok(xObj1.keys().length>0,"first page includes image XObject");
 assert.ok(xObj2.keys().length>0,"terms page includes image XObject");
 assert.ok(out.placement.x+out.placement.width<=320);
 assert.ok(out.termsPlacement.x+out.termsPlacement.width<=253);
});
test("real engine refuses a template with content-sized logo exclusion zone",async()=>{
 const approved=await template();
 approved.pages[0].logoZone={x:0,y:0,width:45,height:20};
 await assert.rejects(renderCompanyQuotationLogoPdf({
  actor,companyId:tenant,authorization:auth,store,pdfLib:engine,
  templates:{getApprovedLogoFreeTemplate:async()=>approved}
 }),/logo_outside_approved_template_zone/);
});

test("actual PDF-Lib renders an opt-in quote draft with integer BWP totals",async()=>{
 const approved=await template();
 const draft={
  quoteNumber:"QT-2026-001",issueDate:"2026-11-15",
  customerName:"Synthetic Customer",customerContact:"Gaborone",
  items:[{description:"Granite memorial",quantity:2,unitPriceCents:125050},
         {description:"Installation",quantity:1,unitPriceCents:350000}],
  discountCents:10050,paymentMethod:"Bank transfer"
 };
 const result=await renderCompanyQuotationLogoPdf({
  actor,companyId:tenant,authorization:auth,store,pdfLib:engine,draft,
  templates:{getApprovedLogoFreeTemplate:async()=>approved}
 });
 assert.deepEqual(result.draftTotals,{
  subtotalCents:600100,discountCents:10050,grandTotalCents:590050
 });
 const rendered=await engine.PDFDocument.load(result.bytes);
 assert.equal(rendered.getPageCount(),2);
 assert.ok(result.bytes.length>approved.bytes.length);
 assert.deepEqual(rendered.getPage(1).getSize(),{width:841.92,height:1190.64});
});
test("real renderer refuses overfull eight-line table rather than clipping",async()=>{
 const approved=await template();
 const draft={quoteNumber:"X1",issueDate:"2026-11-15",customerName:"Fixture",
  customerContact:"Test",items:Array.from({length:9},()=>({description:"Item",quantity:1,unitPriceCents:100}))};
 await assert.rejects(renderCompanyQuotationLogoPdf({
  actor,companyId:tenant,authorization:auth,store,pdfLib:engine,draft,
  templates:{getApprovedLogoFreeTemplate:async()=>approved}
 }),/invalid_quotation_item_count/);
});
