import assert from "node:assert/strict";
import {evaluateAgentAction as gate} from "../cloudflare/src/agent-security-gate.js";
const base={tenantId:"a",taskTenantId:"a",tool:"financial_position.read",allowedTools:["financial_position.read","payment.execute"]};
assert.equal(gate(base).allowed,true);
assert.equal(gate(base).executionAllowed,false);
assert.equal(gate(base).allowed,true);
assert.equal(gate(base).reason,"preflight_eligible");
assert.equal(gate(base).reason,"preflight_eligible");
assert.equal(Object.isFrozen(gate(base)),true);
assert.equal(Object.isFrozen(gate({...base,taskTenantId:"other"})),true);
assert.throws(()=>{gate(base).executionAllowed=true},TypeError);
assert.throws(()=>{gate({...base,taskTenantId:"other"}).allowed=true},TypeError);
assert.equal(gate(base).requiresOwnerApproval,false);
assert.equal(gate({...base,taskStatus:"active",approval:{ownerApproved:true}}).executionAllowed,false);
assert.equal(gate({...base,approval:{ownerApproved:true},externalDestination:true}).allowed,false);
assert.equal(gate({...base,approval:{ownerApproved:true},policyViolation:true}).allowed,false);
assert.equal(gate({...base,taskStatus:"active",suspended:false,policyViolation:false,externalDestination:false}).allowed,true);
assert.equal(gate({...base,taskTenantId:"b"}).reason,"tenant_boundary");
assert.equal(gate({...base,taskTenantId:"b",tool:"payment.execute"}).reason,"tenant_boundary");
assert.equal(gate({...base,taskTenantId:"b"}).executionAllowed,false);
assert.equal(gate({...base,suspended:true}).allowed,false);
assert.equal(gate({...base,taskStatus:"paused"}).allowed,false);
assert.equal(gate({...base,taskStatus:"paused",policyViolation:true}).reason,"responsibility_inactive");
assert.equal(gate({...base,taskStatus:null}).reason,"responsibility_inactive");
assert.equal(gate({...base,taskStatus:"ACTIVE"}).reason,"responsibility_inactive");
assert.equal(gate({...base,taskStatus:"active "}).reason,"responsibility_inactive");
assert.equal(gate({...base,taskStatus:1}).reason,"responsibility_inactive");
assert.equal(gate({...base,taskStatus:"cancelled"}).reason,"responsibility_inactive");
assert.equal(gate({...base,taskStatus:"completed"}).executionAllowed,false);
assert.equal(gate({...base,suspended:true}).reason,"responsibility_inactive");
assert.equal(gate({...base,suspended:"unknown"}).reason,"responsibility_inactive");
assert.equal(gate({...base,suspended:null}).reason,"responsibility_inactive");
assert.equal(gate({...base,suspended:0}).reason,"responsibility_inactive");
assert.equal(gate({...base,suspended:[]}).reason,"responsibility_inactive");
assert.equal(gate({...base,tool:"records.delete"}).allowed,false);
assert.equal(gate({...base,tool:"payment.execute"}).reason,"tool_not_trusted");
assert.equal(gate({...base,tool:"__proto__",allowedTools:["__proto__"]}).allowed,false);
assert.equal(gate({...base,tool:"constructor",allowedTools:["constructor"]}).allowed,false);
assert.equal(gate({...base,tool:"financial_position.read\\u0000",allowedTools:["financial_position.read\\u0000"]}).allowed,false);
for(const dangerousTool of ["government_filing.submit","records.delete","external_message.send"]){
  assert.equal(gate({...base,tool:dangerousTool,allowedTools:[dangerousTool]}).allowed,false);
}
assert.equal(gate({...base,externalDestination:true}).allowed,false);
assert.equal(gate({...base,externalDestination:true}).reason,"external_destination_denied");
assert.equal(gate({...base,externalDestination:true,tool:"payment.execute"}).reason,"external_destination_denied");
assert.equal(gate({...base,externalDestination:"unknown"}).reason,"external_destination_denied");
assert.equal(gate({...base,externalDestination:null}).reason,"external_destination_denied");
assert.equal(gate({...base,externalDestination:0}).reason,"external_destination_denied");
assert.equal(gate({...base,policyViolation:true}).allowed,false);
assert.equal(gate({...base,policyViolation:true,tool:"payment.execute"}).reason,"policy_violation");
assert.equal(gate({...base,policyViolation:"unknown"}).reason,"policy_violation");
assert.equal(gate({...base,policyViolation:null}).reason,"policy_violation");
assert.equal(gate({...base,policyViolation:0}).reason,"policy_violation");
assert.equal(gate({...base,policyViolation:[]}).reason,"policy_violation");
assert.equal(gate({...base,allowedTools:null}).reason,"tool_not_authorized");
assert.equal(gate({...base,allowedTools:"financial_position.read"}).reason,"tool_not_authorized");
assert.equal(gate({...base,allowedTools:{0:"financial_position.read"}}).reason,"tool_not_authorized");
assert.equal(gate({...base,allowedTools:[]}).reason,"tool_not_authorized");
assert.equal(gate({...base,tool:42,allowedTools:[42]}).reason,"tool_not_authorized");
assert.equal(gate({...base,tool:"x".repeat(121),allowedTools:["x".repeat(121)]}).reason,"tool_not_authorized");
assert.equal(gate({...base,allowedTools:["other.read"]}).reason,"tool_not_authorized");
assert.equal(gate({...base,tool:"toString",allowedTools:["toString"]}).allowed,false);
assert.equal(gate({...base,tool:"",allowedTools:[""]}).allowed,false);
assert.equal(gate({...base,tool:" financial_position.read",allowedTools:[" financial_position.read"]}).allowed,false);
assert.equal(gate({...base,tool:"financial_position.read ",allowedTools:["financial_position.read "]}).allowed,false);
assert.equal(gate({...base,tool:" financial_position.read",allowedTools:[" financial_position.read"]}).reason,"tool_not_authorized");
assert.equal(gate({...base,tenantId:123,taskTenantId:123}).reason,"tenant_boundary");
assert.equal(gate({...base,tenantId:"",taskTenantId:""}).reason,"tenant_boundary");
assert.equal(gate({...base,tenantId:" ",taskTenantId:" "}).reason,"tenant_boundary");
assert.equal(gate({...base,tenantId:" a",taskTenantId:" a"}).reason,"tenant_boundary");
assert.equal(gate({...base,tenantId:"a ",taskTenantId:"a "}).reason,"tenant_boundary");
assert.equal(gate({...base,tenantId:"a",taskTenantId:"A"}).reason,"tenant_boundary");
assert.equal(gate({...base,tenantId:"a",taskTenantId:null}).reason,"tenant_boundary");
assert.equal(gate({...base,taskTenantId:"other"}).executionAllowed,false);
assert.equal(gate({...base,allowedTools:["financial_position.read"],externalDestination:true}).executionAllowed,false);
assert.equal(gate({...base,allowedTools:["financial_position.read"],externalDestination:true}).allowed,false);
assert.equal(gate({...base,tool:"payment.execute",approval:{ownerApproved:true,tenantId:"a",tool:"payment.execute",expiresAt:"2099-01-01T00:00:00Z"}}).allowed,false);
assert.equal(gate({...base,tool:"payment.execute",allowedTools:["payment.execute"],approval:{ownerApproved:true}}).executionAllowed,false);
// Every preflight outcome, including denials, must remain non-executable.
for(const candidate of [base,{...base,taskTenantId:"other"},{...base,suspended:true},{...base,policyViolation:true},{...base,externalDestination:true},{...base,tool:"payment.execute"}]){
  assert.equal(gate(candidate).executionAllowed,false);
}
// Security invariant matrix: every untrusted or ambiguous input stays non-executable.
const invalidCases=[
  {tenantId:undefined},{tenantId:null},{tenantId:{}},{taskTenantId:undefined},
  {taskTenantId:[]},{taskStatus:undefined},{taskStatus:"revoked"},
  {suspended:1},{suspended:{}},{policyViolation:1},{policyViolation:{}},
  {externalDestination:1},{externalDestination:{}},{allowedTools:false},
  {allowedTools:{}},{tool:null},{tool:[]},{tool:"payment.execute"},
  {tool:"government_filing.submit"},{tool:"external_message.send"},
];
for(const change of invalidCases){
  const decision=gate({...base,...change});
  assert.equal(decision.allowed,false,JSON.stringify(change));
  assert.equal(decision.executionAllowed,false,JSON.stringify(change));
  assert.equal(Object.isFrozen(decision),true,JSON.stringify(change));
}
console.log("agent security gate tests PASS");
