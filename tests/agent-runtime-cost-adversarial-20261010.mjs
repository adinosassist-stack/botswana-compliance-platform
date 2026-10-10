import assert from "node:assert/strict";
import {evaluateAgentCostAdmission,normalizeAgentUsage} from "../cloudflare/src/agent-cost-admission.js";
import {evaluateAgentRuntimeGuard} from "../cloudflare/src/agent-runtime-guard.js";
import {authorizeAndReserveAgentCost} from "../cloudflare/src/agent-cost-execution-boundary.js";
import {reserveAgentCost} from "../cloudflare/src/agent-cost-reservations.js";

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

// A cost reservation is never an authorization token. An absent policy
// snapshot, a mismatched reservation identity, or a stale approval cannot
// reach storage even if a caller requests execution.
for(const [name,guardPatch,reservePatch] of [
 ["missing cost policy",{costAdmission:null},{}],
 ["missing tenant",{tenantId:""},{}],
 ["reservation cross-tenant",{}, {tenantId:"tenant-b"}],
 ["reservation actor mismatch",{}, {actorTenantId:"tenant-b"}],
 ["reservation agent mismatch",{}, {agentId:"other-agent"}],
 ["reservation amount mismatch",{}, {estimatedCostMinor:24}],
 ["missing run id",{}, {runId:""}],
 ["missing reservation id",{}, {reservationId:""}],
 ["policy tenant mismatch",{costAdmission:{...base,tenantId:"tenant-b"}},{}],
 ["policy actor mismatch",{costAdmission:{...base,actorTenantId:"tenant-b"}},{}],
 ["policy agent mismatch",{costAdmission:{...base,agentId:"other-agent"}},{}]
]){
 const result=await authorizeAndReserveAgentCost(env,{
  guardInput:{...guard,...guardPatch},
  reservationInput:{...reserve,...reservePatch}
 });
 assert.equal(result.allowed,false,name);
 assert.equal(result.executionAllowed,false,name);
 assert.equal(databaseCalls,0,name);
}
assert.equal(databaseCalls,0);

// The baseline request lacks delegated execution authority, so the guard
// denies before reaching D1. Do not mislabel this as an outage-path test.
const guardedOutage={DB:{prepare(){throw new Error("D1 unavailable");}}};
const guardedResult=await authorizeAndReserveAgentCost(guardedOutage,{guardInput:guard,reservationInput:reserve});
assert.equal(guardedResult.allowed,false);
assert.equal(guardedResult.executionAllowed,false);


// An outage while reading the budget must deny deterministically, not throw.
// Exercise the reservation function directly because the baseline runtime guard
// intentionally denies before any storage operation.
const readOutage={DB:{prepare(){throw new Error("D1 unavailable");}}};
const deniedRead=await reserveAgentCost(readOutage,reserve);
assert.deepEqual(deniedRead,{allowed:false,code:"cost_reservation_unavailable"});

console.log("Agent runtime adversarial cost/authority denial tests passed");
