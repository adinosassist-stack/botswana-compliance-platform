import test from "node:test";
import assert from "node:assert/strict";
import {assessTrustedBankSettlement as assess} from "../server/payments/trusted-bank-settlement-gate.mjs";

const invoice={id:"invoice-1",tenantId:"tenant-1",amountMinor:14900,currency:"BWP",reference:"THEBE-INV-001"};
const companyAccount={accountKey:"verified-company-account-1",currency:"BWP",ownerVerified:true};
const bankCredit={origin:"authenticated_company_bank_source",sourceAuthenticated:true,
  sourceType:"read_only_bank_transaction",bankTransactionId:"bank-credit-001",
  accountKey:"verified-company-account-1",reference:"THEBE-INV-001",
  amountMinor:14900,currency:"BWP",direction:"credit",status:"settled",
  finality:"confirmed",reversed:false,chargeback:false,reversalPending:false,
  settledAt:"2026-11-10T08:00:00Z"};
const input=(patch={})=>({invoice,companyAccount,bankCredit,asOf:"2026-11-10T09:00:00Z",...patch});

test("eligible is a structural match only, never an activation or allocation receipt",()=>{
 const result=assess(input());
 assert.equal(result.eligible,true);
 assert.equal(result.reason,"structural_bank_credit_match");
 assert.deepEqual(Object.keys(result).sort(),["bankTransactionId","eligible","invoiceId","reason","tenantId"]);
});
test("missing bank credit never verifies payment",()=>{
 assert.equal(assess(input({bankCredit:null})).reason,"bank_credit_unavailable");
});
test("public reference, statement import or owner boolean cannot impersonate trusted source",()=>{
 for(const patch of [{origin:"customer_upload"},{sourceAuthenticated:false},
  {sourceType:"csv"},{origin:undefined},{sourceAuthenticated:undefined},{sourceType:undefined}]){
  const result=assess(input({bankCredit:{...bankCredit,...patch}}));
  assert.equal(result.eligible,false);
  assert.equal(result.reason,"untrusted_or_incomplete_bank_credit");
 }
});
test("company bank identity must be independently authorized and exactly match",()=>{
 for(const account of [null,{...companyAccount,ownerVerified:false},
  {...companyAccount,accountKey:"other-company-bank"}, {...companyAccount,currency:"USD"}]){
  assert.equal(assess(input({companyAccount:account})).eligible,false);
 }
 assert.equal(assess(input({bankCredit:{...bankCredit,accountKey:"another-account"}})).reason,"company_account_mismatch");
});
test("bank credit must match server invoice reference, exact BWP minor units",()=>{
 assert.equal(assess(input({bankCredit:{...bankCredit,reference:"different"}})).reason,"bank_reference_mismatch");
 for(const patch of [{currency:"USD"},{amountMinor:14901},{amountMinor:0},
  {amountMinor:-10},{amountMinor:14.9},{amountMinor:NaN},{amountMinor:Number.MAX_SAFE_INTEGER+1}]){
  assert.equal(assess(input({bankCredit:{...bankCredit,...patch}})).reason,"bank_amount_or_currency_mismatch");
 }
});
test("pending, debit, reversal, chargeback and unknown finality fail closed",()=>{
 for(const patch of [{status:"pending"},{status:"reversed"},{direction:"debit"},
  {finality:"provisional"},{reversed:true},{chargeback:true},{reversalPending:true},
  {reversed:undefined},{chargeback:undefined},{reversalPending:undefined}]){
  assert.equal(assess(input({bankCredit:{...bankCredit,...patch}})).reason,"bank_credit_not_final");
 }
});
test("future or invalid bank timestamps cannot authorize funds",()=>{
 assert.equal(assess(input({bankCredit:{...bankCredit,settledAt:"2026-11-11T00:00:00Z"}})).reason,"future_bank_settlement");
 assert.equal(assess(input({bankCredit:{...bankCredit,settledAt:"2026-02-30T08:00:00Z"}})).reason,"untrusted_or_incomplete_bank_credit");
 assert.equal(assess(input({asOf:"yesterday"})).reason,"invalid_observation_time");
});
test("bank transaction IDs and references require canonical printable identity",()=>{
 for(const patch of [{bankTransactionId:" bank-credit-001"},{bankTransactionId:"bank-\u200bcredit"},
  {bankTransactionId:""},{reference:"THEBE-\u200bINV-001"}]){
  assert.equal(assess(input({bankCredit:{...bankCredit,...patch}})).reason,"untrusted_or_incomplete_bank_credit");
 }
});
test("invoice context cannot be forged through invalid identifiers or currencies",()=>{
 for(const patch of [{tenantId:""},{id:" invoice-1"},{reference:""},{currency:"USD"},{amountMinor:0}]){
  assert.equal(assess(input({invoice:{...invoice,...patch}})).reason,"invalid_invoice");
 }
});
test("gate does not mutate supplied evidence objects",()=>{
 const a=input();const before=JSON.stringify(a);
 assess(a);assert.equal(JSON.stringify(a),before);
});
