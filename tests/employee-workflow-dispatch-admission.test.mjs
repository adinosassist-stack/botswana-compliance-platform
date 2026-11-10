import test from "node:test";
import assert from "node:assert/strict";
import {evaluateEmployeeDispatchAdmission as evaluate} from "../server/employee-workflow-dispatch-admission.js";
const valid=()=>({featureEnabled:true,killSwitch:false,auditAvailable:true,
 tenantId:"tenantA",actorId:"actorA",proposalId:"proposalA",reviewId:"reviewA",
 reviewerId:"reviewerB",idempotencyKey:"keyA",proposalRevision:"rev2",reviewedProposalRevision:"rev2",proposalTenantId:"tenantA",reviewTenantId:"tenantA",
 proposalStatus:"approved",reviewStatus:"approved",reviewerAuthorized:true,
 currentApprovedReview:true,currentProposalRevision:true,actorAuthorized:true,
 budgetAvailable:true,action:"create_internal_task",reviewedAction:"create_internal_task",
 reviewedProposalId:"proposalA",reviewedActorId:"actorA",reviewedTenantId:"tenantA"});
test("eligible admission is a pure decision and does not execute",()=>{
 assert.deepEqual(evaluate(valid()),{allowed:true,reason:"eligible_for_atomic_admission"});
 assert.equal(evaluate({...valid(),action:"prepare_report_draft",reviewedAction:"prepare_report_draft"}).allowed,true);
});
test("all governance controls require exact typed booleans",()=>{
 for(const [field,allowed] of [["featureEnabled",true],["killSwitch",false],["auditAvailable",true]]){
  for(const value of [undefined,null,"true","false",1,0,{},[]]){
   assert.equal(evaluate({...valid(),[field]:value}).allowed,false,field);
  }
  assert.equal(evaluate({...valid(),[field]:allowed}).allowed,true);
 }
});
test("cross tenant and actor spoofed review denies",()=>{
 for(const change of [{proposalTenantId:"other"},{reviewTenantId:"other"},{reviewerId:"actorA"},{actorId:""},{idempotencyKey:""}])
  assert.equal(evaluate({...valid(),...change}).allowed,false);
});
test("stale or unauthorized approvals and revoked budget deny",()=>{
 for(const change of [{proposalStatus:"rejected"},{reviewStatus:"revoked"},{reviewerAuthorized:false},
 {currentApprovedReview:false},{currentProposalRevision:false},{actorAuthorized:false},{budgetAvailable:false}])
  assert.equal(evaluate({...valid(),...change}).allowed,false);
});
test("financial and external effects are categorically denied",()=>{
 for(const action of ["payroll","approve_payment","financial_posting","send_email","delete_record","grant_permission","file_regulatory_return",undefined])
  assert.equal(evaluate({...valid(),action}).allowed,false);
});

test("dispatch admission rejects stale, missing or mismatched reviewed proposal revision",()=>{
 for(const change of [{proposalRevision:"rev3"},{reviewedProposalRevision:"rev1"},
  {proposalRevision:undefined},{reviewedProposalRevision:null},
  {proposalRevision:""},{reviewedProposalRevision:"rev 2"}])
  assert.equal(evaluate({...valid(),...change}).allowed,false);
});

test("review cannot be reused for a different action, proposal, actor or tenant",()=>{
 for(const change of [{action:"prepare_report_draft"},{reviewedAction:"prepare_report_draft"},
  {proposalId:"proposalB"},{reviewedProposalId:"proposalB"},{actorId:"actorB"},
  {reviewedActorId:"actorB"},{reviewedTenantId:"tenantB"}])
  assert.equal(evaluate({...valid(),...change}).allowed,false);
});
