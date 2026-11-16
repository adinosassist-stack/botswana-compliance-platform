import test from "node:test";
import assert from "node:assert/strict";
import {createQuotationDraftPreviewClient} from "../public/js/quotation-draft-api-client.mjs";

const pdf=new Uint8Array(Buffer.from("%PDF-1.7\nsynthetic preview"));
const sample={quoteNumber:"Q1",issueDate:"2026-11-15",customerName:"Fixture",
 customerContact:"Gaborone",items:[{description:"Memorial",quantity:1,unitPriceCents:10000}]};
const response=(body=pdf,headers={})=>new Response(body,{
 status:200,headers:{"content-type":"application/pdf",...headers}
});
test("disabled capability and absent CSRF fail closed",()=>{
 assert.throws(()=>createQuotationDraftPreviewClient({fetchImpl:async()=>response(),csrfToken:"long-enough-token"}),/disabled/);
 assert.throws(()=>createQuotationDraftPreviewClient({fetchImpl:async()=>response(),csrfToken:"x",enabled:true}),/unconfigured/);
});
test("POST sends same-origin CSRF JSON without putting company identity in URL",async()=>{
 let seen;
 const client=createQuotationDraftPreviewClient({enabled:true,csrfToken:"long-enough-token",
  fetchImpl:async(url,init)=>{seen={url,init};return response()}});
 const result=await client.previewPdf(sample);
 assert.equal(result.type,"application/pdf");
 assert.equal(result.size,pdf.length);
 assert.equal(seen.url,"/api/quotation/draft/pdf-preview");
 assert.equal(seen.init.credentials,"same-origin");
 assert.equal(seen.init.redirect,"error");
 assert.equal(seen.init.method,"POST");
 assert.equal(seen.init.headers["x-csrf-token"],"long-enough-token");
 assert.deepEqual(JSON.parse(seen.init.body),sample);
});
test("rejects non-PDF and forged large content-length",async()=>{
 const client=(res)=>createQuotationDraftPreviewClient({
  enabled:true,csrfToken:"long-enough-token",fetchImpl:async()=>res
 });
 await assert.rejects(client(response(pdf,{"content-type":"text/html"})).previewPdf(sample),/invalid_quotation_preview_type/);
 await assert.rejects(client(response(pdf,{"content-length":"10485761"})).previewPdf(sample),/quotation_preview_too_large/);
 await assert.rejects(client(response(Uint8Array.from([1,2,3,4,5]))).previewPdf(sample),/invalid_quotation_preview_pdf/);
});
test("oversized submitted draft is rejected before network request",async()=>{
 let fetched=false;
 const client=createQuotationDraftPreviewClient({enabled:true,csrfToken:"long-enough-token",
  fetchImpl:async()=>{fetched=true;return response()}});
 await assert.rejects(client.previewPdf({...sample,customerName:"z".repeat(33000)}),/quotation_draft_request_too_large/);
 assert.equal(fetched,false);
});
test("failed responses never return an apparently valid PDF",async()=>{
 const client=createQuotationDraftPreviewClient({enabled:true,csrfToken:"long-enough-token",
  fetchImpl:async()=>new Response('{"ok":false}',{status:403,headers:{"content-type":"application/json"}})});
 await assert.rejects(client.previewPdf(sample),/quotation_draft_preview_unavailable/);
});
