import test from "node:test";
import assert from "node:assert/strict";
import {employeeDispatchIntentIdentity as identity} from "../server/employee-workflow-dispatch-intent.js";
const input=()=>({tenantId:"tenantA",proposalId:"proposalA",proposalRevision:"rev1",action:"create_internal_task",actorId:"actorA"});
test("same logical intent has deterministic identity",()=>{
 assert.equal(identity(input()),identity({...input()}));
});
test("tenant proposal revision action and actor all change intent identity",()=>{
 const baseline=identity(input());
 for(const change of [{tenantId:"tenantB"},{proposalId:"proposalB"},{proposalRevision:"rev2"},
  {action:"prepare_report_draft"},{actorId:"actorB"}])
  assert.notEqual(identity({...input(),...change}),baseline);
});
test("separator-containing identifiers cannot collide across fields",()=>{
 assert.notEqual(identity({...input(),tenantId:"a_b",proposalId:"c"}),identity({...input(),tenantId:"a",proposalId:"b_c"}));
});
test("malformed intent and unsafe actions fail closed",()=>{
 for(const change of [{tenantId:""},{proposalId:"x y"},{proposalRevision:null},
  {actorId:undefined},{action:"approve_payment"},{action:"send_external_message"}])
  assert.throws(()=>identity({...input(),...change}),TypeError);
 assert.throws(()=>identity(null),TypeError);
});
