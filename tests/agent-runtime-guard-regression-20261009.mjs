import assert from "node:assert/strict";
import {evaluateAgentRuntimeGuard} from "../cloudflare/src/agent-runtime-guard.js";

const base={agentKey:"thebe",actionKey:"financial_position.read",actorRole:"owner",tenantScoped:true,tenantId:"tenant-a",actorTenantId:"tenant-a",targetTenantId:"tenant-a",agentStatus:"enabled",killSwitchActive:false,budgetStatus:"within_limit",mode:"shadow",phase:"phase1"};
const cases=[
  [{tenantScoped:false},"tenant_scope_required"],
  [{actorTenantId:"tenant-b"},"cross_tenant_forbidden"],
  [{targetTenantId:"tenant-b"},"cross_tenant_forbidden"],
  [{agentStatus:"disabled"},"agent_disabled"],
  [{killSwitchActive:true},"runtime_kill_switch_active"],
  [{budgetStatus:"exceeded"},"agent_budget_exceeded"],
  [{actionKey:"not_registered.action"},"unknown_action"],
  [{actionKey:"payment.execute"},"human_only_action"],
  [{approvalState:"approved"},"approval_payload_binding_required"],
  [{approvalState:"approved",approvalPayloadHash:"old",actionPayloadHash:"new"},"stale_approval_payload"],
  [{actionKey:"task.create"},"action_not_enabled"]
];
for(const [patch,expected] of cases){
  assert.equal(evaluateAgentRuntimeGuard({...base,...patch}).code,expected);
}
assert.equal(evaluateAgentRuntimeGuard(base).executionAllowed,false);
assert.equal(evaluateAgentRuntimeGuard({...base,mode:"execute"}).executionAllowed,false);
console.log("Agent runtime guard regression: 13 assertions passed");
