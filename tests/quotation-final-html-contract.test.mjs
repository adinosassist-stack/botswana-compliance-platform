import test from "node:test";
import assert from "node:assert/strict";
import {LOVELY_FINAL_HTML_REFERENCE,OBSOLETE_LOVELY_PDF_CANDIDATE_B_SHA256,
 assertLovelyFinalHtmlPdfRenderer} from "../server/quotation-final-html-contract.mjs";
import {drawLovelyQuotationDraft} from "../server/quotation-draft-lovely-pdf.mjs";
import {handleQuotationFullPrivateRequest} from "../server/quotation-full-private-staging-worker.mjs";

test("final HTML identity is distinct from obsolete bank/terms PDF candidate B",()=>{
 assert.equal(LOVELY_FINAL_HTML_REFERENCE.sourceSha256,
 "c57be4e21c126dc318c0caafc17c04cdee50099e130db2f1796f2d93cc982449");
 assert.notEqual(LOVELY_FINAL_HTML_REFERENCE.sourceSha256,
 OBSOLETE_LOVELY_PDF_CANDIDATE_B_SHA256);
 assert.deepEqual([...LOVELY_FINAL_HTML_REFERENCE.separateMaterials],["Concrete","Grout 2kg"]);
 assert.equal(LOVELY_FINAL_HTML_REFERENCE.expectedDefaultItems,9);
});
test("source SHA alone does not activate HTML PDF generation",()=>{
 assert.throws(()=>assertLovelyFinalHtmlPdfRenderer({rendererId:"lovely-final-html-v1",
  sourceSha256:LOVELY_FINAL_HTML_REFERENCE.sourceSha256}),/runtime_not_qualified/);
 assert.throws(()=>assertLovelyFinalHtmlPdfRenderer({rendererId:"old-pdf",
  sourceSha256:OBSOLETE_LOVELY_PDF_CANDIDATE_B_SHA256}),/renderer_not_qualified/);
});
test("legacy PDF renderer rejects fully editable HTML quotations instead of dropping custom wording",async()=>{
 const customPage={quoteNumber:"SYN-01",issueDate:"2026-11-17",
  customerName:"Synthetic",customerPhone:"000000000",location:"Test",
  discount:"0",items:[{description:"Concrete",quantity:"1",unitPrice:"20.00"}],
  copy:{},termsText:"Synthetic terms"};
 // It must reject before loading or drawing onto the obsolete PDF.
 await assert.rejects(drawLovelyQuotationDraft({
  pdf:{getPages(){throw Error("legacy_template_must_not_be_read")}},
  pdfLib:{StandardFonts:{Helvetica:"Helvetica"}},
  draft:{quoteNumber:"SYN-01",issueDate:"2026-11-17",customerName:"Synthetic",
   customerContact:"000000000",items:[{description:"Concrete",quantity:1,unitPriceCents:2000}],
   discountCents:0,customPage}
 }),/lovely_html_document_requires_html_renderer/);
});
test("full staging PDF worker cannot enable obsolete Candidate B from any env flags",async()=>{
 const req=new Request("https://quotation.internal.example.test/api/quotation/draft/pdf-preview",{
  method:"POST"});
 const env={QUOTATION_FULL_PDF_ENABLED:"approved-private-staging-only"};
 const out=await handleQuotationFullPrivateRequest(req,env);
 assert.equal(out.status,404);
});
