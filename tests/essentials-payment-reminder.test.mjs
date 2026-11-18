import test from "node:test";
import assert from "node:assert/strict";
import {preparePaymentReminder} from "../server/essentials-payment-reminder.mjs";
test("prepares an overdue message without sending",()=>{
 const x=preparePaymentReminder({type:"overdue",customerName:"Client",invoiceReference:"INV-1",outstandingMinor:35000,dueDate:"2026-11-01"});
 assert.match(x.text,/P350.00/);assert.equal(x.providerSend,false);assert.equal(x.requiresHumanReview,true);
});
test("rejects invalid reminder data",()=>{
 assert.throws(()=>preparePaymentReminder({type:"overdue",customerName:"Client",invoiceReference:"INV-1",outstandingMinor:-1,dueDate:"2026-11-01"}),/invalid_reminder/);
});
