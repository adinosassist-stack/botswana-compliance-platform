import test from "node:test";
import assert from "node:assert/strict";
import {prepareAgentApprovalPreview} from "../cloudflare/src/agent-approval-preview-boundary.js";
const identity={tenantId:"tenant-1",actorId:"owner-1",actorRole:"owner"};
for(const workflow of ["employee_task_assignment","overdue_invoice_followup","monthly_management_report"]){
 test(workflow+" is a non-executing approval preview",()=>{
  const result=prepareAgentApprovalPreview({identity,request:{workflow,simulationId:"sim-1"}});
  assert.equal(result.ok,true);assert.equal(result.executionAllowed,false);assert.equal(result.sideEffects,false);
  assert.equal(result.canSubmitApproval,false);assert.equal(result.approvalState,"not_requested");
  assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.proposal));
 });
}
test("manager can preview only internal task",()=>{
 assert.equal(prepareAgentApprovalPreview({identity:{...identity,actorRole:"manager"},request:{workflow:"employee_task_assignment",simulationId:"s"}}).ok,true);
 assert.equal(prepareAgentApprovalPreview({identity:{...identity,actorRole:"manager"},request:{workflow:"overdue_invoice_followup",simulationId:"s"}}).ok,false);
});
test("untrusted authority and unknown workflow fail closed",()=>{
 const req={workflow:"employee_task_assignment",simulationId:"sim-1"};
 for(const request of [{...req,tenantId:"another"}, {...req,executionAllowed:true},{...req,actorRole:"owner"},{...req,approvalState:"approved"},{...req,workflow:"payment_activation"}]){
  const r=prepareAgentApprovalPreview({identity,request});assert.equal(r.ok,false);assert.equal(r.executionAllowed,false);
 }
 for(const bad of [null,{}, {...identity,tenantId:" tenant-1"}, {...identity,actorRole:"viewer"}]){
  assert.equal(prepareAgentApprovalPreview({identity:bad,request:req}).executionAllowed,false);
 }
});
