import test from "node:test";
import assert from "node:assert/strict";
import {quotationCustomSample} from "../public/js/quotation-customizable-page-model.mjs";
import {LOVELY_FINAL_HTML_REFERENCE} from "../server/quotation-final-html-contract.mjs";
import {renderLovelyFinalQuotationPrivatePdf} from "../server/quotation-final-html-private-pdf.mjs";
const actor={id:"synthetic-editor"},companyId="syntheticTenant";
const sample=()=>{const x=quotationCustomSample();x.termsText="Synthetic terms for private test only.";return x};
const validDoc={getPageCount:()=>2,getPages:()=>[
 {getSize:()=>({width:595.28,height:841.89})},
 {getSize:()=>({width:595.28,height:841.89})}
]};
const pdfLib={PDFDocument:{load:async()=>validDoc}};
const browser=(geometry=[{clipped:false,scrollHeight:1100,clientHeight:1122},{clipped:false,scrollHeight:1000,clientHeight:1122}])=>{
 const calls=[];
 const page={setContent:async html=>{calls.push(["setContent",html])},
 emulateMedia:async()=>calls.push(["printMode"]),
 evaluate:async fn=>fn.toString().includes("document.fonts")?undefined:geometry,
 pdf:async()=>new Uint8Array([37,80,68,70,45,49]),close:async()=>calls.push(["closed"])};
 return {calls,newPage:async()=>page};
};
const authority=({actor:a,companyId:c})=>a===actor&&c===companyId;
const run=(overrides={})=>renderLovelyFinalQuotationPrivatePdf({
 actor,companyId,draft:sample(),
 authority:{assertPrivatePreview:authority},
 browser:browser(),pdfLib,sourceSha256:LOVELY_FINAL_HTML_REFERENCE.sourceSha256,
 ...overrides
});
test("returns preview only after independent authorization and valid two-page geometry",async()=>{
 const b=browser();const result=await run({browser:b});
 assert.equal(result.pageCount,2);
 assert.equal(result.previewOnly,true);
 assert.equal(result.contentType,"application/pdf");
 assert.deepEqual([...result.bytes],[37,80,68,70,45,49]);
 assert.ok(b.calls.some(x=>x[0]==="setContent"&&x[1].includes("Grout 2kg")));
 assert.equal(b.calls.at(-1)[0],"closed");
});
test("rejects missing/stale HTML fingerprint before opening browser",async()=>{
 const b=browser();await assert.rejects(run({sourceSha256:"obsolete",
  browser:b}),/source_identity_mismatch/);
 assert.deepEqual(b.calls,[]);
});
test("denies invalid or cross-tenant authority before browser access",async()=>{
 const b=browser();await assert.rejects(run({browser:b,
  authority:{assertPrivatePreview:async()=>false}}),/authorization_denied/);
 assert.deepEqual(b.calls,[]);
});
test("rejects missing reviewed terms before any PDF output and closes browser",async()=>{
 const b=browser();const d=sample();d.termsText="";
 await assert.rejects(run({browser:b,draft:d}),/terms_not_qualified/);
 assert.deepEqual(b.calls,[]);
});
test("rejects clipped content before creating PDF, always closes browser",async()=>{
 const b=browser([{clipped:true,scrollHeight:1122,clientHeight:1122},
  {clipped:false,scrollHeight:900,clientHeight:1122}]);
 await assert.rejects(run({browser:b}),/geometry_overflow/);
 assert.equal(b.calls.some(x=>x[0]==="closed"),true);
});
test("refuses extra PDF page even when DOM geometry was two pages",async()=>{
 await assert.rejects(run({pdfLib:{PDFDocument:{load:async()=>({
   getPageCount:()=>3,getPages:()=>[]
 })}}}),/invalid_page_geometry/);
});
test("refuses wrong A4 size even when PDF contains two pages",async()=>{
 await assert.rejects(run({pdfLib:{PDFDocument:{load:async()=>({
   getPageCount:()=>2,getPages:()=>[{getSize:()=>({width:600,height:841})},
    {getSize:()=>({width:595.28,height:841.89})}]
 })}}}),/invalid_page_geometry/);
});


const PRIVATE_SYNTHETIC_PNG=new Uint8Array(Buffer.from(
 "iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAYAAACbU/80AAAALElEQVR42u3OIQEAAAgDMJKg6Z+HLhDjZmJ+tT2XVAICAgICAgICAgIC6cADRvhjW1wPDGYAAAAASUVORK5CYII=",
 "base64"));
const validLogo=()=>({
 mimeType:"image/png",bytes:PRIVATE_SYNTHETIC_PNG,width:32,height:24,
 widthPercent:32,xPercent:0
});
test("revalidates private PNG and embeds it on both pages only after tenant authorization",async()=>{
 const b=browser();
 const z=await run({browser:b,logoSource:{
  getPrivateCompanyLogo:async ({actor:a,companyId:c})=>{
   assert.equal(a,actor);assert.equal(c,companyId);return validLogo()
  }
 }});
 assert.equal(z.pageCount,2);
 const html=b.calls.find(x=>x[0]==="setContent")[1];
 assert.equal((html.match(/data:image\/png;base64,/g)||[]).length,2);
 assert.ok(!html.includes("http://"));
});
test("cross-tenant denial prevents logo read",async()=>{
 let lookedUp=false;
 await assert.rejects(run({authority:{assertPrivatePreview:async()=>false},
  logoSource:{getPrivateCompanyLogo:async()=>{lookedUp=true;return validLogo()}}}),
  /authorization_denied/);
 assert.equal(lookedUp,false);
});
test("missing logo and mismatched private metadata fail closed",async()=>{
 await assert.rejects(run({logoSource:{getPrivateCompanyLogo:async()=>null}}),
  /logo_unconfigured/);
 await assert.rejects(run({logoSource:{getPrivateCompanyLogo:async()=>({
  ...validLogo(),width:64
 })}}),/dimension_mismatch/);
});
test("arbitrary logo mime types and malformed PNG are never passed to browser",async()=>{
 const b=browser();
 await assert.rejects(run({browser:b,logoSource:{
  getPrivateCompanyLogo:async()=>({...validLogo(),mimeType:"image/svg+xml"})
 }}),/logo_unconfigured/);
 await assert.rejects(run({browser:b,logoSource:{
  getPrivateCompanyLogo:async()=>({...validLogo(),bytes:new Uint8Array([1,2,3])})
 }}),/invalid_png_logo/);
 assert.deepEqual(b.calls,[]);
});
