import test from "node:test";
import assert from "node:assert/strict";
import {parseBwpCents,formatBwpCents,prepareQuotationFormDraft} from "../public/js/quotation-draft-form-model.mjs";

const valid=()=>({
 quoteNumber:"QT-2026-011",issueDate:"2026-11-15",
 customerName:"Synthetic Customer",customerContact:"Gaborone",
 discount:"100.50",paymentMethod:"Bank transfer",
 items:[{description:"Headstone",quantity:"2",unitPrice:"1500.75"},
        {description:"Installation",quantity:"1",unitPrice:"3500.00"}]
});
test("strict pula decimal parser preserves cents without binary rounding",()=>{
 assert.equal(parseBwpCents("0"),0);
 assert.equal(parseBwpCents("0.1"),10);
 assert.equal(parseBwpCents("0.01"),1);
 assert.equal(parseBwpCents("1000.75"),100075);
 assert.equal(parseBwpCents("10000000"),1_000_000_000);
 assert.equal(formatBwpCents(590100),"P5,901.00");
 for(const invalid of ["1.234","P100","1,000","-1","01","1e4",
  "",".5","10000000.01","Infinity","0.001","1."])assert.throws(
  ()=>parseBwpCents(invalid),/invalid_bwp_amount/);
});
test("user form yields server-compatible draft with correctly calculated BWP totals",()=>{
 const r=prepareQuotationFormDraft(valid());
 assert.equal(r.subtotalCents,650150);
 assert.equal(r.discountCents,10050);
 assert.equal(r.grandTotalCents,640100);
 assert.deepEqual(r.draft.items,[
  {description:"Headstone",quantity:2,unitPriceCents:150075},
  {description:"Installation",quantity:1,unitPriceCents:350000}
 ]);
 assert.equal(r.draft.discountCents,10050);
 assert.equal(r.draft.customerName,"Synthetic Customer");
 assert.ok(!Object.hasOwn(r.draft,"companyId"));
 assert.ok(!Object.hasOwn(r.draft,"subtotalCents"));
});
test("unfilled customer values and invalid dates disable preview",()=>{
 for(const key of ["quoteNumber","customerName","customerContact"]){
  assert.throws(()=>prepareQuotationFormDraft({...valid(),[key]:""}),/invalid_quotation_/);
 }
 for(const date of ["","2026-02-30","2026-13-01","2026/11/15"])
  assert.throws(()=>prepareQuotationFormDraft({...valid(),issueDate:date}),/invalid_quotation_issue_date/);
});
test("declines oversize rows, malformed discounts, forbidden characters and money overflow",()=>{
 assert.throws(()=>prepareQuotationFormDraft({...valid(),discount:"9000"}),/invalid_quotation_discount/);
 assert.throws(()=>prepareQuotationFormDraft({...valid(),customerName:"Script\nInjection"}),/invalid_quotation_customerName/);
 assert.throws(()=>prepareQuotationFormDraft({...valid(),items:[
  ...Array.from({length:9},()=>({description:"Item",quantity:"1",unitPrice:"1.00"}))
 ]}),/invalid_quotation_item_count/);
 assert.throws(()=>prepareQuotationFormDraft({...valid(),items:[
  {description:"Huge",quantity:"999",unitPrice:"10000000"}
 ]}),/invalid_quotation_line_total/);
 assert.throws(()=>prepareQuotationFormDraft({...valid(),totalCents:1}),/unsupported_quotation_form_field/);
 assert.throws(()=>prepareQuotationFormDraft({...valid(),items:[{description:"x",quantity:"0",unitPrice:"1"}]}),/invalid_quotation_item/);
});
