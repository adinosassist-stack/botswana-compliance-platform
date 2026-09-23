import assert from "node:assert/strict";
import {AGENT_ACTION_CATALOG} from "../cloudflare/src/agent-policy.js";
import {evaluateAgentRuntimeGuard} from "../cloudflare/src/agent-runtime-guard.js";

const action=AGENT_ACTION_CATALOG["finance_reconciliation.prepare"];
assert.ok(action,"finance reconciliation prepare action must exist");
assert.equal(action.capability,"finance");
assert.equal(action.phase1Enabled,true);
assert.equal(action.humanReviewRequired,true);
assert.equal(action.externalSideEffect,false);
assert.deepEqual(action.roles,["owner","manager"]);

const base={
  agentKey:"thebe",
  actionKey:"finance_reconciliation.prepare",
  actorRole:"owner",
  tenantScoped:true,
  tenantId:"tenant-A",
  actorTenantId:"tenant-A",
  targetTenantId:"tenant-A",
  agentStatus:"enabled",
  killSwitchActive:false,
  budgetStatus:"within_limit",
  approvalState:"none",
  actionPayloadHash:"payload-hash",
  mode:"shadow",
  globalExecutionEnabled:false,
  amountMinor:0,
  dailyActionCount:0,
  phase:"phase1"
};

let decision=evaluateAgentRuntimeGuard(base);
assert.equal(decision.allowed,true);
assert.equal(decision.executionAllowed,false);
assert.equal(decision.policy.humanReviewRequired,true);
assert.equal(decision.authority.code,"delegation_not_required");

decision=evaluateAgentRuntimeGuard({...base,targetTenantId:"tenant-B"});
assert.equal(decision.allowed,false);
assert.equal(decision.code,"cross_tenant_forbidden");

decision=evaluateAgentRuntimeGuard({...base,killSwitchActive:true});
assert.equal(decision.allowed,false);
assert.equal(decision.code,"runtime_kill_switch_active");

decision=evaluateAgentRuntimeGuard({...base,budgetStatus:"exceeded"});
assert.equal(decision.allowed,false);
assert.equal(decision.code,"agent_budget_exceeded");

decision=evaluateAgentRuntimeGuard({...base,actorRole:"reviewer"});
assert.equal(decision.allowed,false);
assert.equal(decision.code,"role_forbidden");

decision=evaluateAgentRuntimeGuard({...base,mode:"execute"});
assert.equal(decision.allowed,false);
assert.equal(decision.executionAllowed,false);
assert.equal(decision.code,"execution_not_authorized");

for(const actionKey of ["payment.execute","journal_entry.post","government_filing.submit"]){
  const blocked=evaluateAgentRuntimeGuard({...base,actionKey,actorRole:"owner",approvalState:"approved",strongAuth:"server_verified",mode:"execute",globalExecutionEnabled:true});
  assert.equal(blocked.allowed,false,actionKey);
  assert.equal(blocked.executionAllowed,false,actionKey);
  assert.equal(blocked.code,"human_only_action",actionKey);
}

console.log("v106 pass 1: finance runtime-guard authority adversarial PASS");
