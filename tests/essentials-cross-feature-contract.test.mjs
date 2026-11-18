import test from "node:test";
import assert from "node:assert/strict";
import {prepareQuotationSnapshot} from "../server/quotation-model.mjs";
import {prepareInvoiceFromQuotation} from "../server/essentials-quote-to-invoice.mjs";
import {previewInvoicePayments} from "../server/essentials-payment-schedule.mjs";
import {preparePaymentReminder} from "../server/essentials-payment-reminder.mjs";
import {previewEssentialsJobProfit} from "../server/essentials-job-profit.mjs";

test("quotation snapshot flows to draft invoice, deposit, reminder and job profit without writes",()=>{
 const quotation=prepareQuotationSnapshot({
  company:{id:"tenant-a",name:"Lovely Stones PTY LTD",templateKey:"lovely",termsVersion:"1",logoVersion:"1"},
  customer:{id:"customer-a",name:"Customer A"},
  draft:{items:[{description:"Granite memorial",quantity:1,unitPrice:"1500.00"}],discount:"100.00"},
  reference:"Q-001",issuedAt:"2026-11-18"
 });
 const invoice=prepareInvoiceFromQuotation({quotation,invoiceReference:"INV-001",createdAt:"2026-11-18"});
 assert.equal(invoice.totalMinor,140000);
 assert.equal(invoice.tenantId,"tenant-a");
 const payments=previewInvoicePayments({invoiceTotalMinor:invoice.totalMinor,depositDueMinor:40000,instalments:[{id:"inst-1",dueDate:"2026-12-18",amountMinor:100000}]});
 assert.equal(payments.outstandingMinor,140000);
 assert.equal(payments.settledMinor,0);
 const reminder=preparePaymentReminder({type:"upcoming",customerName:"Customer A",invoiceReference:invoice.invoiceReference,outstandingMinor:payments.outstandingMinor,dueDate:"2026-12-18"});
 assert.match(reminder.text,/P1400\.00/);
 assert.equal(reminder.providerSend,false);
 const job=previewEssentialsJobProfit({tenantId:invoice.tenantId,projectId:"job-1",quotedRevenueThebe:invoice.totalMinor,actualRevenueThebe:invoice.totalMinor,estimatedCosts:{materials:50000},actualCosts:{materials:60000}});
 assert.equal(job.actualProfitThebe,80000);
 assert.equal(job.cashCollectedNotInferred,true);
});
