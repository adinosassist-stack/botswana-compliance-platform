import test from "node:test";
import assert from "node:assert/strict";
import {
 QUOTATION_CUSTOM_DEFAULT_COPY,QUOTATION_CUSTOM_MAX_ITEMS,
 quotationCustomSample,quotationCustomMoneyCents,quotationCustomFormatMoney,
 validateQuotationCustomPage
} from "../public/js/quotation-customizable-page-model.mjs";

test("reference sample keeps concrete and grout in two distinct rows with P14,000 total",()=>{
 const sample=quotationCustomSample();
 const draft=validateQuotationCustomPage(sample);
 assert.equal(draft.items.length,9);
 assert.equal(draft.items[6].description,"Concrete");
 assert.equal(draft.items[7].description,"Grout 2kg");
 assert.equal(draft.items[8].description,"Labour / Transport");
 assert.equal(draft.subtotalCents,1400000);
 assert.equal(draft.totalCents,1400000);
 assert.equal(quotationCustomFormatMoney(draft.totalCents),"P14,000.00");
});
test("customer name and telephone are independent required fields",()=>{
 const data=quotationCustomSample();
 data.customerName="Synthetic Mr M";
 data.customerPhone="+267 72 123 456";
 const result=validateQuotationCustomPage(data);
 assert.equal(result.customerName,"Synthetic Mr M");
 assert.equal(result.customerPhone,"+267 72 123 456");
 assert.throws(()=>validateQuotationCustomPage({...data,customerPhone:""}),/invalid_quotation_custom_text/);
 assert.throws(()=>validateQuotationCustomPage({...data,customerName:""}),/invalid_quotation_custom_text/);
});
test("all displayed static labels, bank fields and footer copy are explicitly editable",()=>{
 const data=quotationCustomSample();
 const keys=Object.keys(QUOTATION_CUSTOM_DEFAULT_COPY);
 assert.ok(keys.length>=25);
 for(const key of keys)data.copy[key]=key==="bankAccount"?"":key+" replacement";
 const output=validateQuotationCustomPage(data);
 assert.equal(output.copy.heading,"heading replacement");
 assert.equal(output.copy.footerEmail,"footerEmail replacement");
 assert.equal(output.copy.footerPhone,"footerPhone replacement");
 assert.equal(output.copy.bankAccount,"");
 assert.equal(output.copy.termsHeading,"termsHeading replacement");
 assert.equal(output.copy.customerPhoneLabel,"customerPhoneLabel replacement");
});
test("terms content preserves original punctuation and all line breaks, without replacing refund policy",()=>{
 const data=quotationCustomSample();
 const exact="1. Supplied terms.\n\n4. Original cancellation text stays as written.";
 data.termsText=exact;
 const result=validateQuotationCustomPage(data);
 assert.equal(result.termsText,exact);
 assert.equal(result.reviewOnly,true);
});
test("integer cents never use floating arithmetic; discounts bounded by subtotal",()=>{
 assert.equal(quotationCustomMoneyCents("0.01"),1);
 assert.equal(quotationCustomMoneyCents("14000.00"),1400000);
 assert.equal(quotationCustomFormatMoney(1),"P0.01");
 const data=quotationCustomSample();data.discount="0.10";
 assert.equal(validateQuotationCustomPage(data).totalCents,1399990);
 for(const amount of ["-1","1.234","1e3","P200","Infinity","10000000.01"])
  assert.throws(()=>quotationCustomMoneyCents(amount),/invalid_quotation_money/);
 data.discount="14000.01";
 assert.throws(()=>validateQuotationCustomPage(data),/invalid_quotation_custom_discount/);
});
test("12 rows accepted; additional rows refused without dropping or combining material",()=>{
 const data=quotationCustomSample();
 while(data.items.length<QUOTATION_CUSTOM_MAX_ITEMS)
  data.items.push({description:"Extra "+data.items.length,quantity:"1",unitPrice:"0.00"});
 assert.equal(validateQuotationCustomPage(data).items.length,QUOTATION_CUSTOM_MAX_ITEMS);
 data.items.push({description:"Overflow",quantity:"1",unitPrice:"0.00"});
 assert.throws(()=>validateQuotationCustomPage(data),/invalid_quotation_custom_item_count/);
});
test("invalid field injection, fake totals and unsafe newlines are rejected",()=>{
 const data=quotationCustomSample();
 assert.throws(()=>validateQuotationCustomPage({...data,companyId:"cross-tenant"}),/unsupported_quotation_custom_page_field/);
 assert.throws(()=>validateQuotationCustomPage({...data,grandTotalCents:0}),/unsupported_quotation_custom_page_field/);
 assert.throws(()=>validateQuotationCustomPage({...data,copy:{...data.copy,evilLabel:"x"}}),/unsupported_quotation_custom_copy_field/);
 assert.throws(()=>validateQuotationCustomPage({...data,items:[{description:"x",quantity:"0",unitPrice:"0"}]}),/invalid_quotation_custom_quantity/);
 assert.throws(()=>validateQuotationCustomPage({...data,copy:{...data.copy,heading:"One\nTwo"}}),/invalid_quotation_custom_text/);
});
test("review-only sample pre-fills the Lovely terms without supplying a bank account",()=>{
 const data=quotationCustomSample();
 assert.equal(data.copy.bankAccount,"");
 assert.match(data.termsText,/^Dear Lovely Tombstone customer,/);
 assert.match(data.termsText,/Customer Declaration:/);
 const result=validateQuotationCustomPage(data);
 assert.equal(result.termsText,data.termsText);
 assert.equal(result.reviewOnly,true);
});
