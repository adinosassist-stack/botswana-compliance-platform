import test from "node:test";
import assert from "node:assert/strict";
import {handleAuthenticatedAgentPreview as handle} from "../cloudflare/src/agent-approval-preview-handler.js";
const principal={authenticated:true,tenantId:"tenant-a",actorId:"owner-a",actorRole:"owner"};
const body={workflow:"monthly_management_report",simulationId:"sim-a"};
test("disabled by default, even with valid principal",()=>{
 const result=handle({principal,body});assert.equal(result.ok,false);assert.equal(result.code,"agent_preview_disabled");
});
test("authenticated and explicitly enabled returns inert preview",()=>{
 const result=handle({principal,body,featureEnabled:true});assert.equal(result.ok,true);
 assert.equal(result.proposal.tenantId,"tenant-a");assert.equal(result.executionAllowed,false);
 assert.equal(result.canSubmitApproval,false);
});
test("kill switch, missing authentication and request identity spoofing fail closed",()=>{
 for(const input of [
  {principal,body,featureEnabled:true,killSwitch:true},
  {principal:{...principal,authenticated:false},body,featureEnabled:true},
  {principal:null,body,featureEnabled:true},
  {principal,body:{...body,tenantId:"tenant-b"},featureEnabled:true},
  {principal,body:{...body,approvalState:"approved"},featureEnabled:true},
  {principal,body:{...body,execute:true},featureEnabled:true}
 ]){
  const result=handle(input);assert.equal(result.ok,false);assert.equal(result.executionAllowed,false);
 }
});
test("manager cannot preview finance or management report",()=>{
 assert.equal(handle({principal:{...principal,actorRole:"manager"},body,featureEnabled:true}).ok,false);
});
