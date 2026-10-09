import assert from "node:assert/strict";
import fs from "node:fs";
import {
  AGENT_RUNTIME_CONTAINMENT_VERSION,
  evaluateAgentRuntimeContainment,
  parseTenantControlList,
  tenantContainmentFromEnv
} from "../cloudflare/src/agent-runtime-containment.js";

const activeAuthority=Object.freeze({ready:true,agentId:"THEBE-001",state:"active",executionCapable:true});
const base={tenantId:"tenant-1",agentAuthority:activeAuthority};

assert.equal(AGENT_RUNTIME_CONTAINMENT_VERSION,"2026-10-09.v1");
assert.equal(evaluateAgentRuntimeContainment(base).allowed,true);
assert.equal(evaluateAgentRuntimeContainment({...base,suspendedTenantsRaw:"tenant-2,tenant-1"}).code,"tenant_suspended");
assert.equal(evaluateAgentRuntimeContainment({...base,quarantinedTenantsRaw:"tenant-1"}).code,"tenant_quarantined");
assert.equal(evaluateAgentRuntimeContainment({...base,globalKillSwitch:true}).code,"runtime_kill_switch_active");
assert.equal(evaluateAgentRuntimeContainment({...base,runtimeEnabled:false}).code,"agent_runtime_disabled");
assert.equal(evaluateAgentRuntimeContainment({...base,tenantId:""}).code,"tenant_scope_required");

for(const state of ["restricted","suspended","revoked"]){
  const result=evaluateAgentRuntimeContainment({...base,agentAuthority:{...activeAuthority,state}});
  assert.equal(result.allowed,false);
  assert.equal(result.code,`agent_authority_${state}`);
}
assert.equal(evaluateAgentRuntimeContainment({...base,agentAuthority:{ready:false,state:"restricted",executionCapable:false}}).code,"agent_authority_unavailable");
assert.equal(evaluateAgentRuntimeContainment({...base,agentAuthority:{...activeAuthority,executionCapable:false}}).code,"agent_authority_invalid");

assert.equal(parseTenantControlList("").ok,true);
assert.deepEqual(parseTenantControlList("tenant-1,tenant-1,tenant-2").values,["tenant-1","tenant-2"]);
for(const malformed of ["tenant-1,",",tenant-1","tenant one","tenant-1,,tenant-2"]){
  assert.equal(parseTenantControlList(malformed).ok,false,`${malformed} must fail closed`);
  assert.equal(evaluateAgentRuntimeContainment({...base,suspendedTenantsRaw:malformed}).code,"tenant_control_config_invalid");
}

assert.equal(tenantContainmentFromEnv({AGENT_RUNTIME_SUSPENDED_TENANTS:"tenant-1"},"tenant-1",activeAuthority).code,"tenant_suspended");
assert.equal(tenantContainmentFromEnv({AGENT_RUNTIME_QUARANTINED_TENANTS:"tenant-1"},"tenant-1",activeAuthority).code,"tenant_quarantined");
assert.equal(tenantContainmentFromEnv({AGENT_RUNTIME_KILL_SWITCH:"true"},"tenant-1",activeAuthority).code,"runtime_kill_switch_active");
assert.equal(tenantContainmentFromEnv({AGENT_RUNTIME_ENABLED:"0"},"tenant-1",activeAuthority).code,"agent_runtime_disabled");

const wrapper=fs.readFileSync(new URL("../cloudflare/src/jit-capability-governance-entry.js",import.meta.url),"utf8");
assert.match(wrapper,/tenantContainmentFromEnv/);
assert.match(wrapper,/loadCanonicalAgentAuthority/);
assert.match(wrapper,/evaluateBoundContainment/);
assert.match(wrapper,/containment\.allowed!==true/);
assert.match(wrapper,/issueBoundCapability/);
assert.match(wrapper,/verifyBoundCapability/);
const authIndex=wrapper.indexOf("const auth=await authenticate(request,env)");
const containmentIndex=wrapper.indexOf("evaluateBoundContainment(env,auth)");
const permitIndex=wrapper.indexOf("if(permit)return issueBoundCapability");
assert.ok(authIndex>=0&&containmentIndex>authIndex&&permitIndex>containmentIndex,"containment must run after auth and before JIT permit issue/execute");
assert.doesNotMatch(wrapper,/UPDATE\s+agent_jit_execution_permits/i);
assert.doesNotMatch(wrapper,/DELETE\s+FROM\s+agent_jit_execution_permits/i);
assert.doesNotMatch(wrapper,/INSERT\s+INTO\s+agent_jit_execution_permits/i);

const costGate=fs.readFileSync(new URL("../docs/agent-cost-accounting-release-gate.md",import.meta.url),"utf8");
assert.match(costGate,/experimental \/ disabled/i);
assert.doesNotMatch(wrapper,/AGENT_COST_ACCOUNTING_ENABLED|agent_cost_budgets|agent_cost_reservations/);

console.log("v316 tenant runtime containment checks passed");
