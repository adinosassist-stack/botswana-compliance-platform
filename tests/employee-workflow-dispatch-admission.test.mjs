import test from "node:test";
import assert from "node:assert/strict";
import {evaluateEmployeeDispatchAdmission as evaluate} from "../server/employee-workflow-dispatch-admission.js";
const valid=()=>({featureEnabled:true,killSwitch:false,auditAvailable:true,
 tenantId:"tenantA",actorId:"actorA",proposalId:"proposalA",reviewId:"reviewA",
 reviewerId:"reviewerB",idempotencyKey:"keyA",proposalTenantId:"tenantA",reviewTenantId:"tenantA",
 proposalStatus:"approved",reviewStatus:"approved",reviewerAuthorized:true,
 currentApprovedReview:true,currentProposalRevision:true,actorAuthorized:true,
 budgetAvailable:true,action:"create_internal_task"});
test("eligible admission is a pure decision and does not execute",()=>{
 assert.deepEqual(evaluate(valid()),{allowed:true,reason:"eligible_for_atomic_admission"});
 assert.equal(evaluate({...valid(),action:"prepare_report_draft"}).allowed,true);
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
