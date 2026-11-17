/**
 * Real isolated Chromium print acceptance for owner-selected final Lovely HTML.
 * Synthetic data only; no service, real template, credentials or customer data.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {join} from "node:path";
import {quotationCustomSample} from "../public/js/quotation-customizable-page-model.mjs";
import {renderLovelyFinalQuotationPrintHtml} from "../server/quotation-final-html-print.mjs";
const root=process.env.QUOTATION_BROWSER_ENGINE_ROOT;
if(!root)throw Error("quotation_chromium_engine_root_required");
const {chromium}=createRequire(join(root,"final-quote-acceptance.cjs"))("playwright");
const pdfLib=createRequire(join(process.cwd(),"quotation-pdf.cjs"))("pdf-lib");

let browser;
test.before(async()=>{browser=await chromium.launch({headless:true})});
test.after(async()=>{await browser?.close()});
const sample=()=>{
 const q=quotationCustomSample();
 q.termsText="1. Synthetic private test terms — never a customer contract.\n2. Reviewed wording must be provided before issue.";
 q.customerName="Synthetic customer K";
 q.customerPhone="+267 70 000 000";
 return q;
};
async function inspectPrint(q){
 const p=await browser.newPage({viewport:{width:1100,height:900},deviceScaleFactor:1});
 try{
  const {html}=renderLovelyFinalQuotationPrintHtml(q);
  await p.setContent(html,{waitUntil:"load"});
  await p.emulateMedia({media:"print"});
  await p.evaluate(()=>document.fonts.ready);
  const geometry=await p.evaluate(()=>[...document.querySelectorAll(".page")].map(el=>{
    const a=el.getBoundingClientRect();
    const boxes=[...el.querySelectorAll("*")];
    return {
      height:el.clientHeight,scrollHeight:el.scrollHeight,
      clipped:boxes.filter(x=>{
        const r=x.getBoundingClientRect();
        return r.bottom>a.bottom+1 || r.top<a.top-1 ||
          x.scrollHeight>x.clientHeight+2;
      }).map(x=>x.className||x.tagName)
    };
  }));
  return {pdf:await p.pdf({format:"A4",preferCSSPageSize:true,printBackground:true}),
   geometry,rows:await p.locator("article[data-page='1'] tbody tr").allInnerTexts(),
   text:await p.locator("body").innerText()};
 }finally{await p.close()}
}
test("final HTML print produces a real 2-page A4 PDF retaining editable customer and 9 separate rows",async()=>{
 const v=await inspectPrint(sample());
 const doc=await pdfLib.PDFDocument.load(v.pdf);
 assert.equal(doc.getPageCount(),2);
 for(const page of doc.getPages()){
   assert.ok(Math.abs(page.getWidth()-595.28)<1);
   assert.ok(Math.abs(page.getHeight()-841.89)<1);
 }
 assert.equal(v.rows.length,9);
 assert.match(v.rows[6],/^Concrete/);
 assert.match(v.rows[7],/^Grout 2kg/);
 assert.match(v.text,/Synthetic customer K/);
 assert.match(v.text,/\+267 70 000 000/);
 assert.match(v.text,/Synthetic private test terms/);
 assert.ok(v.geometry.every(x=>x.clipped.length===0),
 "Print PDF would silently clip text: "+JSON.stringify(v.geometry));
});
test("12 default-style items and representative terms remain within precisely 2 PDF pages",async()=>{
 const q=sample();while(q.items.length<12)
   q.items.push({description:"Synthetic additional material "+q.items.length,quantity:"1",unitPrice:"100.00"});
 const v=await inspectPrint(q);
 assert.equal((await pdfLib.PDFDocument.load(v.pdf)).getPageCount(),2);
 assert.equal(v.rows.length,12);
 assert.ok(v.geometry.every(x=>x.clipped.length===0),
  "12-row output clips print content: "+JSON.stringify(v.geometry));
});
test("detects excessively long terms as an overflow blocker, never as an accepted printable PDF",async()=>{
 const q=sample();q.termsText=Array(70).fill("Long synthetic contract sentence repeated to prove page-two clipping is detected.").join("\n");
 const v=await inspectPrint(q);
 assert.ok(v.geometry.some(x=>x.clipped.length>0||x.scrollHeight>x.height+2),
  "Expected browser geometry to identify overflowing contract text");
});
test("refuses absent terms before invoking Chromium",()=>{
 const q=sample();q.termsText="";
 assert.throws(()=>renderLovelyFinalQuotationPrintHtml(q),/terms_not_qualified/);
});
