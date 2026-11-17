import test from "node:test";
import assert from "node:assert/strict";
import {validateQuotationDraft,moneyBwp} from "../server/quotation-draft-model.mjs";
const valid=()=>({quoteNumber:"QT-001",issueDate:"2026-11-15",customerName:"Synthetic Customer",
 customerContact:"Gaborone",items:[{description:"Monument",quantity:2,unitPriceCents:125050},
 {description:"Installation",quantity:1,unitPriceCents:350000}],discountCents:10050});
test("recomputes all totals from integer cents",()=>{
 const result=validateQuotationDraft(valid());
 assert.equal(result.subtotalCents,600100);
 assert.equal(result.grandTotalCents,590050);
 assert.equal(result.items[0].lineTotalCents,250100);
 assert.equal(moneyBwp(result.grandTotalCents),"P5,900.50");
});
test("refuses forged line totals, unknown monetary inputs and negative amounts",()=>{
 assert.throws(()=>validateQuotationDraft({...valid(),items:[{description:"x",quantity:1,unitPriceCents:100,lineTotalCents:1}]}),/invalid_quotation_item/);
 assert.throws(()=>validateQuotationDraft({...valid(),discountCents:600101}),/invalid_quotation_discount/);
 assert.throws(()=>validateQuotationDraft({...valid(),items:[{description:"x",quantity:1,unitPriceCents:-1}]}),/invalid_quotation_item/);
});
test("refuses unsupported fields and overflowing line items",()=>{
 assert.throws(()=>validateQuotationDraft({...valid(),tenantId:"another"}),/unsupported_quotation_field/);
 assert.throws(()=>validateQuotationDraft({...valid(),items:Array.from({length:13},()=>({description:"x",quantity:1,unitPriceCents:1}))}),/invalid_quotation_item_count/);
 assert.throws(()=>validateQuotationDraft({...valid(),items:[{description:"x",quantity:999,unitPriceCents:1000000000}]}),/invalid_quotation_line_total/);
});
test("refuses invalid date, unprintable characters and potentially unsafe text",()=>{
 assert.throws(()=>validateQuotationDraft({...valid(),issueDate:"2026-02-30"}),/invalid_quotation_issue_date/);
 assert.throws(()=>validateQuotationDraft({...valid(),customerName:"<script>\nhello"}),/invalid_quotation_customerName/);
 assert.throws(()=>validateQuotationDraft({...valid(),customerName:"Résumé"}),/invalid_quotation_customerName/);
});
