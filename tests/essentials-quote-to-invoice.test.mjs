import test from "node:test";
import assert from "node:assert/strict";
import {prepareInvoiceFromQuotation} from "../server/essentials-quote-to-invoice.mjs";
const quotation={companyId:"tenant-a",customerId:"customer-1",reference:"Q-1",items:[{description:"Stone",quantity:2,unitMinor:50000,lineMinor:100000}],discountMinor:5000,totalMinor:95000};
test("creates immutable draft with source reference and exact totals",()=>{
 const result=prepareInvoiceFromQuotation({quotation,invoiceReference:"INV-1",createdAt:"2026-11-18"});
 assert.equal(result.status,"draft");assert.equal(result.totalMinor,95000);assert.equal(result.sourceQuotationReference,"Q-1");assert.equal(Object.isFrozen(result.items),true);
});
test("rejects inconsistent source amounts",()=>{
 assert.throws(()=>prepareInvoiceFromQuotation({quotation:{...quotation,totalMinor:1},invoiceReference:"INV-1",createdAt:"2026-11-18"}),/invalid_totals/);
});
test("rejects invalid dates and lines",()=>{
 assert.throws(()=>prepareInvoiceFromQuotation({quotation,invoiceReference:"INV-1",createdAt:"2026-02-30"}),/invalid_date/);
 assert.throws(()=>prepareInvoiceFromQuotation({quotation:{...quotation,items:[{description:"Stone",quantity:2,unitMinor:50000,lineMinor:1}]},invoiceReference:"INV-1",createdAt:"2026-11-18"}),/invalid_line/);
});

test("does not silently convert a source quotation with an explicit foreign or unknown currency into BWP",()=>{
 const input={quotation,invoiceReference:"INV-1",createdAt:"2026-11-18"};
 for(const currency of ["USD","ZAR","bwp",null]){
  assert.throws(()=>prepareInvoiceFromQuotation({...input,quotation:{...quotation,currency}}),/invalid_currency/);
 }
 assert.equal(prepareInvoiceFromQuotation({...input,quotation:{...quotation,currency:"BWP"}}).currency,"BWP");
 // Existing implicit BWP snapshots remain supported without forced migration.
 assert.equal(prepareInvoiceFromQuotation(input).currency,"BWP");
});
