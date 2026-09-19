import assert from "node:assert/strict";
import {AGENT_ACTION_CATALOG} from "../cloudflare/src/agent-policy.js";
import {NEVER_AUTONOMOUS_ACTIONS} from "../cloudflare/src/delegated-authority.js";
import {AGENT_RUNTIME_GUARD_VERSION,evaluateAgentRuntimeGuard} from "../cloudflare/src/agent-runtime-guard.js";

const base={
  agentKey:"thebe",
  actorRole:"owner",
  tenantScoped:true,
  tenantId:"tenant-A",
  actorTenantId:"tenant-A",
  targetTenantId:"tenant-A",
  mode:"shadow",
  phase:"phase1",
  budgetStatus:"within_limit",
  agentStatus:"enabled",
  killSwitchActive:false
};

assert.match(AGENT_RUNTIME_GUARD_VERSION,/^2026-09-20\./);

let result=evaluateAgentRuntimeGuard({...base,actionKey:"financial_position.read"});
assert.equal(result.allowed,true);
assert.equal(result.executionAllowed,false);
assert.equal(result.preExecutionMonitor,true);
assert.equal(result.auditRequired,true);

result=evaluateAgentRuntimeGuard({...base,actionKey:"finance_brief.prepare"});
assert.equal(result.allowed,true);
assert.equal(result.executionAllowed,false);
assert.equal(result.policy.humanReviewRequired,true);

for(const actionKey of Object.keys(AGENT_ACTION_CATALOG)){
  const crossTenant=evaluateAgentRuntimeGuard({...base,actionKey,targetTenantId:"tenant-B"});
  assert.equal(crossTenant.allowed,false,actionKey);
  assert.equal(crossTenant.code,"cross_tenant_forbidden",actionKey);

  const killed=evaluateAgentRuntimeGuard({...base,actionKey,killSwitchActive:true});
  assert.equal(killed.allowed,false,actionKey);
  assert.equal(killed.code,"runtime_kill_switch_active",actionKey);

  const overBudget=evaluateAgentRuntimeGuard({...base,actionKey,budgetStatus:"exceeded"});
  assert.equal(overBudget.allowed,false,actionKey);
  assert.equal(overBudget.code,"agent_budget_exceeded",actionKey);
}

for(const actionKey of NEVER_AUTONOMOUS_ACTIONS){
  const humanOnly=evaluateAgentRuntimeGuard({
    ...base,
    actionKey,
    approvalState:"approved",
    strongAuth:"server_verified",
    mode:"execute",
    globalExecutionEnabled:true
  });
  assert.equal(humanOnly.allowed,false,actionKey);
  assert.equal(humanOnly.executionAllowed,false,actionKey);
  assert.equal(humanOnly.code,"human_only_action",actionKey);
}

result=evaluateAgentRuntimeGuard({
  ...base,
  actionKey:"finance_brief.prepare",
  approvalState:"approved",
  approvalPayloadHash:"old-payload",
  actionPayloadHash:"new-payload"
});
assert.equal(result.allowed,false);
assert.equal(result.code,"stale_approval_payload");

result=evaluateAgentRuntimeGuard({
  ...base,
  actionKey:"task.create",
  mode:"execute",
  globalExecutionEnabled:true
});
assert.equal(result.allowed,false);
assert.equal(result.executionAllowed,false);
assert.equal(result.code,"action_not_enabled");

for(const actionKey of [...Object.getOwnPropertyNames(Object.prototype),"unknown.action"]){
  const unknown=evaluateAgentRuntimeGuard({...base,actionKey});
  assert.equal(unknown.allowed,false,actionKey);
  assert.equal(unknown.code,"unknown_action",actionKey);
}

console.log("v94 deterministic agent runtime guard: PASS");
