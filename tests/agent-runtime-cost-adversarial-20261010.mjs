import assert from "node:assert/strict";
import {evaluateAgentCostAdmission,normalizeAgentUsage} from "../cloudflare/src/agent-cost-admission.js";
import {evaluateAgentRuntimeGuard} from "../cloudflare/src/agent-runtime-guard.js";
import {authorizeAndReserveAgentCost} from "../cloudflare/src/agent-cost-execution-boundary.js";

// Adversarial checks for the disabled-by-default experimental accounting path.
// All denied requests must terminate before touching D1.
let databaseCalls=0;
const env={DB:{prepare(){databaseCalls++;throw Error("denied request reached D1");}}};
const base={tenantId:"tenant-a",actorTenantId:"tenant-a",agentId:"thebe",estimatedCostMinor:25,spentMinor:75,budgetMinor:100,usageKnown:true,enabled:true};
const reserve={tenantId:"tenant-a",actorTenantId:"tenant-a",agentId:"thebe",runId:"run-1",reservationId:"reservation-1",estimatedCostMinor:25};
const guard={agentKey:"thebe",actionKey:"task.create",tenantScoped:true,tenantId:"tenant-a",actorTenantId:"tenant-a",targetTenantId:"tenant-a",mode:"execute",costAdmission:base};

for(const [name,patch,code] of [
 ["suspension",{suspended:true},"agent_suspended"],
 ["unknown usage",{usageKnown:false},"cost_usage_unknown"],
 ["overspend",{estimatedCostMinor:26},"agent_cost_budget_exceeded"],
 ["tenant mismatch",{actorTenantId:"tenant-b"},"cost_tenant_mismatch"],
 ["disabled",{enabled:false},"cost_admission_disabled"],
 ["negative spend",{spentMinor:-1},"cost_amount_invalid"],
 ["fractional spend",{spentMinor:0.5},"cost_amount_invalid"],
 ["unsafe integer",{estimatedCostMinor:Number.MAX_SAFE_INTEGER+1},"cost_amount_invalid"]
]){
 const decision=evaluateAgentCostAdmission({...base,...patch});
 assert.equal(decision.allowed,false,name);
 assert.equal(decision.code,code,name);
 const result=await authorizeAndReserveAgentCost(env,{guardInput:{...guard,costAdmission:{...base,...patch}},reservationInput:reserve});
 assert.equal(result.allowed,false,name);
 assert.equal(result.executionAllowed,false,name);
 assert.equal(databaseCalls,0,name);
}
for(const [name,patch] of [
 ["cross-tenant target",{targetTenantId:"tenant-b"}],
 ["kill switch",{killSwitchActive:true}],
 ["disabled agent",{agentStatus:"disabled"}],
 ["stale owner approval",{approvalState:"approved",approvalPayloadHash:"original",actionPayloadHash:"changed"}],
 ["unknown tool",{actionKey:"unknown.side.effect"}]
]){
 const decision=evaluateAgentRuntimeGuard({...guard,...patch});
 assert.equal(decision.allowed,false,name);
 const result=await authorizeAndReserveAgentCost(env,{guardInput:{...guard,...patch},reservationInput:reserve});
 assert.equal(result.executionAllowed,false,name);
 assert.equal(databaseCalls,0,name);
}
assert.equal(evaluateAgentCostAdmission({...base,estimatedCostMinor:25}).remainingMinor,0);
assert.equal(normalizeAgentUsage({provider:"provider",model:"model",runId:"run",inputTokens:1,outputTokens:2,estimatedCostMinor:25}).verifiedCost,false);
assert.equal(normalizeAgentUsage({provider:"provider",model:"model",runId:"run",inputTokens:1,outputTokens:2,estimatedCostMinor:NaN}),null);
assert.equal(databaseCalls,0);
console.log("Agent runtime adversarial cost/authority denial tests passed");
