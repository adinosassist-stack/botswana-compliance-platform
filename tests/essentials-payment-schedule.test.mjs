import test from "node:test";
import assert from "node:assert/strict";
import {previewInvoicePayments,projectInvoiceSchedule} from "../server/essentials-payment-schedule.mjs";
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

test("deposit first and due-date ordered instalments reflect canonical allocations",()=>{
 const base={invoiceTotalMinor:180000,depositDueMinor:30000,depositDueDate:"2026-11-20",
  instalments:[{id:"b",dueDate:"2027-01-21",amountMinor:75000},{id:"a",dueDate:"2026-12-21",amountMinor:75000}],
  asOf:"2026-12-22"};
 const x=projectInvoiceSchedule({...base,allocatedMinor:60000});
 assert.deepEqual(x.rows.map(r=>[r.kind,r.id,r.coveredMinor,r.remainingMinor,r.status]),
  [["deposit",null,30000,0,"paid"],["instalment","a",30000,45000,"overdue"],["instalment","b",0,75000,"unpaid"]]);
 assert.equal(x.outstandingMinor,120000);assert.equal(x.overdueMinor,45000);
 assert.equal(x.scheduledOutstandingMinor,120000);assert.equal(x.unscheduledOutstandingMinor,0);
 const reversed=projectInvoiceSchedule({...base,allocatedMinor:10000});
 assert.equal(reversed.rows[0].remainingMinor,20000);assert.equal(reversed.rows[0].status,"overdue");
 assert.equal(reversed.outstandingMinor,170000);
 assert.equal(projectInvoiceSchedule({...base,allocatedMinor:180000}).overdueMinor,0);
});
test("schedule projection never treats unscheduled balances or a future due date as overdue",()=>{
 const base={invoiceTotalMinor:100000,depositDueMinor:20000,depositDueDate:"2026-12-01",asOf:"2026-12-01"};
 const x=projectInvoiceSchedule({...base,allocatedMinor:10000});
 assert.equal(x.rows[0].status,"partially_paid");assert.equal(x.overdueMinor,0);
 assert.equal(x.unscheduledOutstandingMinor,80000);
 assert.equal(projectInvoiceSchedule({...base,allocatedMinor:50000}).unscheduledOutstandingMinor,50000);
 assert.equal(projectInvoiceSchedule({...base,allocatedMinor:100000}).outstandingMinor,0);
});
test("schedule projection rejects overpayment, invalid dates and zero instalments",()=>{
 const base={invoiceTotalMinor:100000,allocatedMinor:0,asOf:"2026-12-01"};
 assert.throws(()=>projectInvoiceSchedule({...base,allocatedMinor:100001}),/overpayment/);
 assert.throws(()=>projectInvoiceSchedule({...base,allocatedMinor:-1}),/invalid_allocated/);
 assert.throws(()=>projectInvoiceSchedule({...base,depositDueMinor:100}),/invalid_schedule_date/);
 assert.throws(()=>projectInvoiceSchedule({...base,asOf:"2026-02-30"}),/invalid_schedule_date/);
 assert.throws(()=>projectInvoiceSchedule({...base,instalments:[{id:"a",dueDate:"2026-12-01",amountMinor:0}]}),/invalid_zero_instalment/);
});
