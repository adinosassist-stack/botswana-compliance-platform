import test from "node:test";
import assert from "node:assert/strict";
import {reconcileLedger,prepareSupplierPaymentReview} from "../server/agentic/finance-readonly.mjs";
test("reconciliation consumes each bank row at most once",()=>{
 const result=reconcileLedger({ledger:[{id:"l1",reference:"A",amountMinor:500},{id:"l2",reference:"A",amountMinor:500}],bank:[{id:"b1",reference:"A",amountMinor:500}]});
 assert.equal(result.matches.length,1);assert.deepEqual(result.unmatchedLedger,["l2"]);assert.equal(result.readOnly,true);
});
test("duplicate invoices are held and never paid",()=>{
 const result=prepareSupplierPaymentReview({invoices:[{id:"i1",supplierId:"s",invoiceNumber:"001",amountMinor:500},{id:"i2",supplierId:"s",invoiceNumber:"001",amountMinor:500}]});
 assert.deepEqual(result.duplicates,["i2"]);assert.equal(result.proposals.length,1);assert.equal(result.paymentExecutionEnabled,false);
});
test("invalid amounts fail closed",()=>{
 assert.throws(()=>reconcileLedger({ledger:[{id:"a",reference:"r",amountMinor:0.5}]}),/INVALID_MINOR_UNITS/);
 assert.throws(()=>prepareSupplierPaymentReview({invoices:[{id:"a",supplierId:"s",invoiceNumber:"x",amountMinor:-1}]}),/INVALID_INVOICE_AMOUNT/);
});
