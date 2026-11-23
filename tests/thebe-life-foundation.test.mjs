import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {THEBE_LIFE_RELEASE_MODE,pulaToThebe,thebeToPula,householdBudget,motsheloRotation,motsheloPayoutReview} from "../server/thebe-life-domain.mjs";

test("BWP accounting uses exact integer thebe; ambiguous inputs fail closed",()=>{
 assert.equal(pulaToThebe("0.05"),5);
 assert.equal(pulaToThebe("10.1"),1010);
 assert.equal(pulaToThebe("10"),1000);
 assert.equal(thebeToPula(1005),"10.05");
 assert.equal(thebeToPula(0),"0.00");
 for(const bad of [10.10,-1,"-2.00","+3.00","1e3","1,000","01.00","0.999","Infinity","",null,"99999999999.00"]){
  assert.throws(()=>pulaToThebe(bad),/thebe_life_/);
 }
 assert.throws(()=>thebeToPula(-1),/thebe_life_/);
});
test("household budgets show unallocated income and overspending without modifying funds",()=>{
 const summary=householdBudget({
  income:[{id:"salary",amount:"5500.00"},{id:"side_income",amount:"500.00"}],
  envelopes:[{id:"rent",amount:"2500.00"},{id:"groceries",amount:"1200.00"},{id:"school_fees",amount:"1500.00"},{id:"emergency",amount:"400.00"}],
  expenses:[{envelopeId:"rent",amount:"2500.00"},{envelopeId:"groceries",amount:"1350.25"},{envelopeId:"school_fees",amount:"300.00"}]
 });
 assert.equal(summary.currency,"BWP");
 assert.equal(summary.incomeThebe,600000);
 assert.equal(summary.plannedThebe,560000);
 assert.equal(summary.spentThebe,415025);
 assert.equal(summary.unallocatedThebe,40000);
 assert.equal(summary.actualCashMarginThebe,184975);
 assert.deepEqual(summary.categories.find(x=>x.id==="groceries"),{
  id:"groceries",budgetThebe:120000,spentThebe:135025,remainingThebe:-15025,overBudget:true
 });
 assert.equal(summary.categories.find(x=>x.id==="emergency").spentThebe,0);
});
test("bad or cross-envelope allocations are rejected before calculating a family budget",()=>{
 assert.throws(()=>householdBudget({income:[{id:"same",amount:"10"},{id:"same",amount:"20"}]}),/duplicate/);
 assert.throws(()=>householdBudget({envelopes:[{id:"food",amount:"10"}],expenses:[{envelopeId:"rent",amount:"2"}]}),/unknown_envelope/);
 assert.throws(()=>householdBudget({envelopes:[{id:"food",amount:"1e4"}]}),/amount/);
 const over=householdBudget({income:[{id:"income",amount:"100"}],envelopes:[{id:"school",amount:"150"}]});
 assert.equal(over.exceedsIncome,true);
 assert.equal(over.unallocatedThebe,-5000);
});
test("Motshelo rotates planned recipients deterministically across calendar years",()=>{
 const rounds=motsheloRotation({memberIds:["alice","bob","casey"],monthlyContribution:"200.00",startMonth:"2026-12",rounds:5});
 assert.deepEqual(rounds.map(x=>[x.month,x.recipientMemberId,x.expectedPoolThebe,x.status]),[
  ["2026-12","alice",60000,"PLANNED_NOT_FUNDED"],
  ["2027-01","bob",60000,"PLANNED_NOT_FUNDED"],
  ["2027-02","casey",60000,"PLANNED_NOT_FUNDED"],
  ["2027-03","alice",60000,"PLANNED_NOT_FUNDED"],
  ["2027-04","bob",60000,"PLANNED_NOT_FUNDED"]
 ]);
});
test("Motshelo rotation forbids missing members, duplicates, invalid months and funds overflow",()=>{
 for(const row of [
  {memberIds:["a"],monthlyContribution:"100",startMonth:"2026-11"},
  {memberIds:["a","a"],monthlyContribution:"100",startMonth:"2026-11"},
  {memberIds:["a","b"],monthlyContribution:"0",startMonth:"2026-11"},
  {memberIds:["a","b"],monthlyContribution:"100",startMonth:"2026-13"},
  {memberIds:["a","b"],monthlyContribution:"100",startMonth:"2026-11",rounds:121},
  {memberIds:["a","b"],monthlyContribution:"9999999999.99",startMonth:"2026-11"}
 ])assert.throws(()=>motsheloRotation(row),/thebe_life_/);
});
const group=()=>({memberIds:["alice","bob","casey"],recipientMemberId:"bob",monthlyContribution:"100.00"});
const paid=(memberId,receiptId,verifiedBy)=>({memberId,amount:"100.00",recordedBy:memberId,status:"verified_external",receiptId,verifiedBy});
const approvals=()=>[{role:"chair",actorId:"chair_1",approved:true},{role:"treasurer",actorId:"treasurer_1",approved:true}];
test("Motshelo contributions are blocked until all external receipts and distinct officers exist",()=>{
 const empty=motsheloPayoutReview(group());
 assert.equal(empty.status,"BLOCKED");
 assert.equal(empty.verifiedMemberCount,0);
 assert.equal(empty.expectedPoolThebe,30000);
 assert.equal(empty.mayExecutePayment,false);
 const refs=[
  paid("alice","receipt_0001","treasurer_1"),
  paid("bob","receipt_0002","treasurer_1"),
  paid("casey","receipt_0003","treasurer_1")
 ];
 const withoutOfficers=motsheloPayoutReview({...group(),contributions:refs});
 assert.equal(withoutOfficers.status,"BLOCKED");
 assert.ok(withoutOfficers.reasons.includes("two_distinct_officers_required"));
 const ready=motsheloPayoutReview({...group(),contributions:refs,approvals:approvals()});
 assert.equal(ready.status,"READY_TO_RECORD_EXTERNAL_PAYOUT");
 assert.equal(ready.verifiedMemberCount,3);
 assert.equal(ready.reasons.length,0);
 assert.equal(ready.mayExecutePayment,false,"even a complete review never authorizes Thebe to transfer money");
});
test("unverified contributions, reused receipts and self-approval cannot unlock payout record",()=>{
 const refs=[
  paid("alice","receipt_0001","treasurer_1"),
  paid("bob","receipt_0002","treasurer_1"),
  paid("casey","receipt_0003","treasurer_1")
 ];
 const notVerified={...refs[1],status:"pending"};
 const pending=motsheloPayoutReview({...group(),contributions:[refs[0],notVerified,refs[2]],approvals:approvals()});
 assert.equal(pending.status,"BLOCKED");
 assert.ok(pending.reasons.includes("independent_receipt_missing:bob"));
 const sameReceipt=motsheloPayoutReview({...group(),contributions:[refs[0],{...refs[1],receiptId:"receipt_0001"},refs[2]],approvals:approvals()});
 assert.ok(sameReceipt.reasons.includes("reused_receipt"));
 const selfVerified=motsheloPayoutReview({...group(),contributions:[{...refs[0],verifiedBy:"alice"},refs[1],refs[2]],approvals:approvals()});
 assert.equal(selfVerified.status,"BLOCKED");
 const sameOfficer=motsheloPayoutReview({...group(),contributions:refs,approvals:[{role:"chair",actorId:"actor_1",approved:true},{role:"treasurer",actorId:"actor_1",approved:true}]});
 assert.equal(sameOfficer.status,"BLOCKED");
 const mismatch=motsheloPayoutReview({...group(),contributions:[{...refs[0],amount:"50.00"},refs[1],refs[2]],approvals:approvals()});
 assert.equal(mismatch.status,"BLOCKED");
 assert.ok(mismatch.reasons.includes("amount_mismatch:alice"));
 assert.throws(()=>motsheloPayoutReview({...group(),contributions:[refs[0],refs[0]]}),/duplicate_contributor/);
 assert.throws(()=>motsheloPayoutReview({...group(),contributions:[paid("intruder","receipt_0004","treasurer_1")]}),/contributor_not_member/);
 assert.throws(()=>motsheloPayoutReview({...group(),recipientMemberId:"intruder"}),/recipient_not_member/);
});
test("new finance package has no live route, payments or custody activation",()=>{
 assert.equal(THEBE_LIFE_RELEASE_MODE,"PLANNING_ONLY");
 const src=readFileSync(new URL("../server/thebe-life-domain.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(src,/\bfetch\s*\(|\.execute\s*\(|\.prepare\s*\(|\btransferFunds\s*\(|\bissueLoan\s*\(/);
 const doc=readFileSync(new URL("../docs/thebe-life-family-motshelo-foundation.md",import.meta.url),"utf8");
 assert.match(doc,/No production migration or route/);
 assert.match(doc,/non-custodial/i);
});
