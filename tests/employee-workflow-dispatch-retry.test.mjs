import test from "node:test";
import assert from "node:assert/strict";
import {evaluateEmployeeDispatchRetry as decide} from "../server/employee-workflow-dispatch-retry.js";
const valid=()=>({featureEnabled:true,killSwitch:false,auditAvailable:true,currentLease:true,
 tenantStillMatches:true,approvalStillCurrent:true,actorStillAuthorized:true,
 attempt:1,maxAttempts:3,failureKind:"transient"});
test("bounded transient retries and dead-letter exhaustion",()=>{
 assert.equal(decide(valid()).decision,"retry");
 assert.equal(decide({...valid(),attempt:2}).decision,"retry");
 assert.deepEqual(decide({...valid(),attempt:3}),{decision:"dead_letter",reason:"attempts_exhausted"});
});
test("permanent and authorization failures never retry",()=>{
 for(const failureKind of ["permanent","authorization","validation"])
  assert.equal(decide({...valid(),failureKind}).decision,"dead_letter");
});
test("invalid counters and unknown failures fail closed",()=>{
 for(const change of [{attempt:0},{attempt:1.2},{attempt:11},{maxAttempts:0},
  {maxAttempts:11},{attempt:4},{failureKind:"timeout-ish"},{failureKind:undefined}])
  assert.equal(decide({...valid(),...change}).decision,"stop");
});
test("revoked authorization, lease, audit or kill switch stop retry",()=>{
 for(const change of [{featureEnabled:"true"},{killSwitch:true},{auditAvailable:false},
  {currentLease:false},{tenantStillMatches:false},{approvalStillCurrent:false},
  {actorStillAuthorized:false}])
  assert.equal(decide({...valid(),...change}).decision,"stop");
});
