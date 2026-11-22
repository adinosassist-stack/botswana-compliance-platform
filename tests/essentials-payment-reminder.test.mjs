import test from "node:test";
import assert from "node:assert/strict";
import {preparePaymentReminder} from "../server/essentials-payment-reminder.mjs";
import {previewInvoicePayments} from "../server/essentials-payment-schedule.mjs";

const invoice={customerName:"Example Client",invoiceReference:"INV-1",dueDate:"2026-12-01"};

test("prepares an overdue message without sending",()=>{
 const x=preparePaymentReminder({type:"overdue",customerName:"Client",invoiceReference:"INV-1",outstandingMinor:35000,dueDate:"2026-11-01"});
 assert.match(x.text,/P350\.00/);
 assert.equal(x.prepareOnly,true);
 assert.equal(x.providerSend,false);
 assert.equal(x.requiresHumanReview,true);
 assert.ok(Object.isFrozen(x));
});

test("rejects a zero outstanding balance for all reminder types",()=>{
 for(const type of ["upcoming","overdue","receipt_request"]){
  assert.throws(()=>preparePaymentReminder({...invoice,type,outstandingMinor:0}),/invalid_reminder/);
 }
});

test("does not chase a fully settled invoice, but pending schedules remain outstanding",()=>{
 const pending=previewInvoicePayments({invoiceTotalMinor:25000,depositDueMinor:5000,instalments:[{id:"one",dueDate:"2026-12-01",amountMinor:20000}]});
 assert.equal(pending.outstandingMinor,25000);
 assert.match(preparePaymentReminder({...invoice,type:"upcoming",outstandingMinor:pending.outstandingMinor}).text,/P250\.00/);
 const settled=previewInvoicePayments({invoiceTotalMinor:25000,settledAllocations:[{bankTransactionId:"verified-bank-1",settlementVerified:true,amountMinor:25000}]});
 assert.equal(settled.outstandingMinor,0);
 assert.throws(()=>preparePaymentReminder({...invoice,type:"overdue",outstandingMinor:settled.outstandingMinor}),/invalid_reminder/);
});

test("formats integer thebe exactly without floating point rounding",()=>{
 for(const [minor,expected] of [[1,"P0.01"],[99,"P0.99"],[101,"P1.01"],[10005,"P100.05"],[9007199254740991,"P90071992547409.91"]]){
  const x=preparePaymentReminder({...invoice,type:"receipt_request",outstandingMinor:minor});
  assert.ok(x.text.includes(expected),expected);
 }
});

test("rejects malformed amount, control/bidi characters and invalid dates",()=>{
 for(const minor of [-1,0,1.1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,"100"]){
  assert.throws(()=>preparePaymentReminder({...invoice,type:"overdue",outstandingMinor:minor}),/invalid_reminder/);
 }
 for(const bad of ["AB\nCD","AB\rCD","AB\u202eCD","AB\u2066CD","AB\u2028CD","AB\u0085CD"]){
  assert.throws(()=>preparePaymentReminder({...invoice,type:"upcoming",customerName:bad,outstandingMinor:100}),/invalid_reminder/);
  assert.throws(()=>preparePaymentReminder({...invoice,type:"upcoming",invoiceReference:bad,outstandingMinor:100}),/invalid_reminder/);
 }
 for(const date of ["2026-02-30","2026-13-01","2026-1-01","not-a-date"]){
  assert.throws(()=>preparePaymentReminder({...invoice,type:"overdue",outstandingMinor:100,dueDate:date}),/invalid_due_date/);
 }
});

test("receipt request remains prepare-only and has no due date requirement",()=>{
 const x=preparePaymentReminder({type:"receipt_request",customerName:"Customer",invoiceReference:"INV-2",outstandingMinor:1234});
 assert.match(x.text,/P12\.34/);
 assert.equal(x.providerSend,false);
 assert.equal(x.requiresHumanReview,true);
});
