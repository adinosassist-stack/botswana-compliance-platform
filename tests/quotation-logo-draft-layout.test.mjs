import test from "node:test";
import assert from "node:assert/strict";
import {drawLovelyQuotationDraft,wrapQuotationDescription} from "../server/quotation-draft-lovely-pdf.mjs";

const draft=()=>({
 quoteNumber:"TEST-Q-2026",issueDate:"2026-11-15",
 customerName:"Synthetic Customer",customerContact:"Gaborone",
 items:[{description:"Granite memorial",quantity:2,unitPriceCents:125050}],
 discountCents:10050,paymentMethod:"Manual payment"
});
function harness(widthFactor=.55){
 const written=[],boxes=[];
 const font={widthOfTextAtSize:(v,size)=>v.length*size*widthFactor};
 const page={getWidth:()=>612.24,getHeight:()=>858.96,
  drawText:(v,options)=>written.push({v,...options}),
  drawRectangle:rect=>boxes.push(rect)};
 const doc={getPages:()=>[page,{}],embedFont:async()=>font};
 return {pdf:doc,written,boxes,font,pdfLib:{
  StandardFonts:{Helvetica:"regular",HelveticaBold:"bold"},
  rgb:(r,g,b)=>({r,g,b})}};
}
test("wraps a long invoice description over two lines without losing any characters",async()=>{
 const {pdf,pdfLib,written,font}=harness();
 const description="Premium Granite Memorial Monument With Beautiful Long Sides";
 const lines=wrapQuotationDescription(font,description,226,8);
 assert.equal(lines.length,2);
 assert.equal(lines.join(" "),description);
 const out=await drawLovelyQuotationDraft({pdf,pdfLib,draft:{
  ...draft(),items:[{description,quantity:2,unitPriceCents:125050}]
 }});
 assert.equal(out.grandTotalCents,240050);
 const rowTexts=written.filter(v=>v.y===858.96-337||v.y===858.96-348);
 assert.deepEqual(rowTexts.map(v=>v.v),lines);
 assert.ok(written.some(v=>v.v==="P2,401.00"));
});
test("one long unspaced word never gets ellipsis or loses characters",()=>{
 const h=harness();
 const word="A".repeat(54);
 const lines=wrapQuotationDescription(h.font,word,226,8);
 assert.equal(lines.join(""),word);
 assert.ok(lines.length<=2);
 assert.ok(lines.every(x=>!x.includes("...")));
});
test("customer name that cannot fit is rejected rather than silently truncated",async()=>{
 const {pdf,pdfLib}=harness(.75);
 await assert.rejects(drawLovelyQuotationDraft({pdf,pdfLib,draft:{
  ...draft(),customerName:"W".repeat(60)
 }}),/quotation_draft_field_overflow/);
});
test("description that cannot fit two rows fails instead of shortening contract details",async()=>{
 const {pdf,pdfLib}=harness(1.3);
 await assert.rejects(drawLovelyQuotationDraft({pdf,pdfLib,draft:{
  ...draft(),items:[{description:"W".repeat(60),quantity:1,unitPriceCents:100}]
 }}),/quotation_draft_field_overflow/);
});
test("unused banking fields cannot be silently ignored on a PDF preview",async()=>{
 const {pdf,pdfLib}=harness();
 for(const key of ["bankAccount","bankName"]){
  await assert.rejects(drawLovelyQuotationDraft({pdf,pdfLib,draft:{
   ...draft(),[key]:"Not authorized for preview"
  }}),/unsupported_quotation_field/);
 }
});
