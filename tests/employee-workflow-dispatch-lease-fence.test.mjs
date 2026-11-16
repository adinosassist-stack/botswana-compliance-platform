import test from "node:test";
import assert from "node:assert/strict";
import {evaluateEmployeeDispatchLeaseCompletion as check} from "../server/employee-workflow-dispatch-lease-fence.js";
const valid=()=>({featureEnabled:true,killSwitch:false,auditAvailable:true,
 presentedLeaseToken:"lease_token_00000001",currentLeaseToken:"lease_token_00000001",
 nowMs:100,leaseExpiresAtMs:101,intentStatus:"claimed",
 approvalStillCurrent:true,actorStillAuthorized:true,tenantStillMatches:true});
test("only current unexpired fenced claim is eligible for atomic completion",()=>{
 assert.equal(check(valid()).allowed,true);
});
test("old lease token is denied even before expiry",()=>{
 assert.equal(check({...valid(),currentLeaseToken:"lease_token_00000002"}).allowed,false);
});
test("expiration boundary and malformed clocks deny",()=>{
 for(const change of [{nowMs:101},{nowMs:102},{nowMs:-1},{nowMs:NaN},
  {nowMs:100.5},{leaseExpiresAtMs:"101"},{leaseExpiresAtMs:undefined}])
  assert.equal(check({...valid(),...change}).allowed,false);
});
test("governance revocation and stale approvals deny",()=>{
 for(const change of [{featureEnabled:"true"},{killSwitch:true},{auditAvailable:false},
  {approvalStillCurrent:false},{actorStillAuthorized:false},{tenantStillMatches:false},
  {intentStatus:"completed"},{intentStatus:"retry"}])
  assert.equal(check({...valid(),...change}).allowed,false);
});
test("missing or malformed lease tokens deny",()=>{
 for(const change of [{presentedLeaseToken:"short"},{currentLeaseToken:null},
  {presentedLeaseToken:undefined},{presentedLeaseToken:"lease token 00000001"}])
  assert.equal(check({...valid(),...change}).allowed,false);
});
