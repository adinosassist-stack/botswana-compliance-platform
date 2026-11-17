import test from "node:test";
import assert from "node:assert/strict";
import {quotationCustomSample} from "../public/js/quotation-customizable-page-model.mjs";
import {customQuotationToStoredDraft,storedQuotationToCustomPage,mountLovelyQuotationProtectedWorkspace}
 from "../public/js/quotation-custom-workspace-bridge.mjs";
const sample=()=>{
 const c=quotationCustomSample();
 c.termsText="Approved terms must be supplied separately; synthetic only.";
 c.customerPhone="+267 71 123 456";
 c.copy.heading="CUSTOM QUOTATION";
 for(let i=0;i<3;i++)c.items.push({description:"Extra "+i,quantity:"1",unitPrice:"100.50"});
 return c;
};
test("complete 12-row Lovely editor maps to canonical integer Pula draft without field loss",()=>{
 const input=sample(),converted=customQuotationToStoredDraft(input);
 assert.equal(converted.items.length,12);
 assert.equal(converted.items[6].description,"Concrete");
 assert.equal(converted.items[7].description,"Grout 2kg");
 assert.equal(converted.items[9].unitPriceCents,10050);
 assert.equal(converted.customerContact,input.customerPhone);
 assert.equal(converted.customPage.termsText,input.termsText);
 assert.deepEqual(storedQuotationToCustomPage(converted),input);
});
test("tampered server-returned totals, customer, item and missing full editor are rejected",()=>{
 for(const mutate of [
  x=>{x.customerContact="forged"},
  x=>{x.items[7].description="Concrete and grout"},
  x=>{x.items[0].unitPriceCents=-1},
  x=>{x.customPage.customerName="Someone else"},
  x=>{delete x.customPage}
 ]){
  const data=customQuotationToStoredDraft(sample());
  mutate(data);
  assert.throws(()=>storedQuotationToCustomPage(data),/quotation_custom_document_/);
 }
});
test("browser composition refuses absent capabilities before DOM or requests",()=>{
 assert.throws(()=>mountLovelyQuotationProtectedWorkspace({replaceChildren(){}},{
  capability:{enabled:true,authenticated:true,canEditQuotations:true,
   canCustomizeQuotationPreview:true}
 }),/quotation_workspace_disabled/);
});
test("edited twelve-row page must validate before any network submission",()=>{
 const bad=sample();bad.items[0].unitPrice="-1";
 assert.throws(()=>customQuotationToStoredDraft(bad),/invalid_quotation_money/);
 const malicious=sample();malicious.tenantId="forged";
 assert.throws(()=>customQuotationToStoredDraft(malicious),/unsupported_quotation_custom_page_field/);
});
