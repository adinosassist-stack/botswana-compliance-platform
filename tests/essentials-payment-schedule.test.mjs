import test from "node:test";
import assert from "node:assert/strict";
import {previewInvoicePayments} from "../server/essentials-payment-schedule.mjs";
test("computes outstanding balance using only verified allocations",()=>{
 const x=previewInvoicePayments({invoiceTotalMinor:100000,depositDueMinor:20000,instalments:[{id:"p1",dueDate:"2026-12-01",amountMinor:80000}],settledAllocations:[{bankTransactionId:"bank1",amountMinor:20000,settlementVerified:true}]});
 assert.equal(x.outstandingMinor,80000);assert.equal(x.scheduledMinor,100000);assert.equal(x.previewOnly,true);
});
test("rejects unverified settlement and reused transaction",()=>{
 const base={invoiceTotalMinor:100000};
 assert.throws(()=>previewInvoicePayments({...base,settledAllocations:[{bankTransactionId:"bank1",amountMinor:1,settlementVerified:false}]}),/invalid_settlement/);
 assert.throws(()=>previewInvoicePayments({...base,settledAllocations:[{bankTransactionId:"bank1",amountMinor:1,settlementVerified:true},{bankTransactionId:"bank1",amountMinor:1,settlementVerified:true}]}),/invalid_settlement/);
});
test("rejects overpayment and overscheduled amount",()=>{
 assert.throws(()=>previewInvoicePayments({invoiceTotalMinor:100,depositDueMinor:101}),/deposit_exceeds_total/);
 assert.throws(()=>previewInvoicePayments({invoiceTotalMinor:100,settledAllocations:[{bankTransactionId:"bank1",amountMinor:101,settlementVerified:true}]}),/overpayment/);
});

test("a zero-value claimed settlement is never a settled payment",()=>{
 assert.throws(()=>previewInvoicePayments({invoiceTotalMinor:10000,
  settledAllocations:[{bankTransactionId:"bank-zero",amountMinor:0,settlementVerified:true}]}),/invalid_zero_settlement/);
});
test("pending deposit and instalments do not reduce outstanding balance",()=>{
 const x=previewInvoicePayments({invoiceTotalMinor:180000,depositDueMinor:30000,
  instalments:[{id:"month1",dueDate:"2026-12-21",amountMinor:75000},
               {id:"month2",dueDate:"2027-01-21",amountMinor:75000}]});
 assert.equal(x.settledMinor,0);
 assert.equal(x.outstandingMinor,180000);
 assert.equal(x.scheduledMinor,180000);
 assert.equal(x.previewOnly,true);
});
