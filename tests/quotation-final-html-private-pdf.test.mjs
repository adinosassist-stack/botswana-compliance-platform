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
