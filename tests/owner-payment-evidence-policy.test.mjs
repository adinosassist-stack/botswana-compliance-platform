import test from "node:test";
import assert from "node:assert/strict";
import {evaluateOwnerPaymentEvidence as evaluate, PAYMENT_DECISIONS as D} from "../server/payments/owner-payment-evidence-policy.mjs";

const invoice={id:"inv-1",tenantId:"tenant-a",amountMinor:150000,currency:"BWP"};
const bankEvidence={invoiceId:"inv-1",tenantId:"tenant-a",source:"trusted_bank_reconciliation",status:"settled",bankTransactionId:"bank-123",amountMinor:150000,currency:"BWP"};
const reviewer={authenticated:true,role:"owner",tenantId:"tenant-a",actorId:"owner-1"};
const input=(patch={})=>({tenantId:"tenant-a",invoice,bankEvidence,reviewer,priorBankAllocations:[],...patch});

test("trusted settled funds with authenticated tenant owner can be marked verified",()=>{
  assert.equal(evaluate(input()).decision,D.VERIFIED);
});
test("customer-submitted payment reference is never receipt proof",()=>{
  assert.equal(evaluate(input({bankEvidence:{...bankEvidence,source:"customer_upload"}})).decision,D.REVIEW_REQUIRED);
});
test("missing bank evidence waits for funds",()=>{
  assert.equal(evaluate(input({bankEvidence:null})).decision,D.AWAITING_FUNDS);
});
test("pending bank transaction cannot be verified",()=>{
  assert.equal(evaluate(input({bankEvidence:{...bankEvidence,status:"pending"}})).decision,D.REVIEW_REQUIRED);
});
test("wrong amount or currency cannot be verified",()=>{
  for(const patch of [{amountMinor:100000},{currency:"USD"}])
    assert.equal(evaluate(input({bankEvidence:{...bankEvidence,...patch}})).decision,D.REVIEW_REQUIRED);
});
test("cross tenant evidence or invoice is rejected",()=>{
  assert.notEqual(evaluate(input({bankEvidence:{...bankEvidence,tenantId:"tenant-b"}})).decision,D.VERIFIED);
  assert.equal(evaluate(input({invoice:{...invoice,tenantId:"tenant-b"}})).decision,D.REJECTED);
});
test("untrusted reviewer cannot verify",()=>{
  for(const patch of [{authenticated:false},{role:"staff"},{tenantId:"tenant-b"},{actorId:""}])
    assert.equal(evaluate(input({reviewer:{...reviewer,...patch}})).decision,D.REVIEW_REQUIRED);
});
test("invalid money and missing transaction ID are denied",()=>{
  assert.equal(evaluate(input({invoice:{...invoice,amountMinor:0}})).decision,D.REJECTED);
  assert.equal(evaluate(input({bankEvidence:{...bankEvidence,bankTransactionId:""}})).decision,D.REVIEW_REQUIRED);
});
test("no evidence or review input never grants verification",()=>{
  assert.notEqual(evaluate().decision,D.VERIFIED);
});

test("missing server-side allocation lookup cannot verify funds",()=>{
  assert.equal(evaluate(input({priorBankAllocations:undefined})).decision,D.REVIEW_REQUIRED);
});
test("same bank transaction cannot be reused for a second invoice",()=>{
  const priorBankAllocations=[{bankTransactionId:"bank-123",invoiceId:"inv-old",tenantId:"tenant-a"}];
  assert.equal(evaluate(input({priorBankAllocations})).reason,"bank_transaction_already_allocated");
});
test("malformed allocation history fails closed",()=>{
  assert.equal(evaluate(input({priorBankAllocations:[null]})).decision,D.REVIEW_REQUIRED);
});
test("different bank transaction remains eligible for owner review",()=>{
  const priorBankAllocations=[{bankTransactionId:"bank-older",invoiceId:"inv-old",tenantId:"tenant-a"}];
  assert.equal(evaluate(input({priorBankAllocations})).decision,D.VERIFIED);
});
