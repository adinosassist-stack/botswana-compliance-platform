import assert from "node:assert/strict";
import {authorizeAndReserveAgentCost} from "../cloudflare/src/agent-cost-execution-boundary.js";
let calls=0;
const env={DB:{prepare(){calls++;throw Error("database must not be reached");}}};
const reservationInput={tenantId:"t1",actorTenantId:"t1",agentId:"thebe",runId:"run1",reservationId:"res1",estimatedCostMinor:1};
const guardInput={agentKey:"thebe",actionKey:"task.create",tenantScoped:true,tenantId:"t1",actorTenantId:"t1",targetTenantId:"t1",mode:"shadow"};
const denied=await authorizeAndReserveAgentCost(env,{guardInput,reservationInput});
assert.equal(denied.allowed,false);
assert.equal(denied.executionAllowed,false);
assert.equal(calls,0);
const mismatch=await authorizeAndReserveAgentCost(env,{guardInput:{...guardInput,mode:"execute",targetTenantId:"other"},reservationInput});
assert.equal(mismatch.allowed,false);
assert.equal(calls,0);
const admission={tenantId:"t1",actorTenantId:"t1",agentId:"thebe",estimatedCostMinor:1,spentMinor:0,budgetMinor:100,usageKnown:true,enabled:true};
const forbidden=await authorizeAndReserveAgentCost(env,{
 guardInput:{...guardInput,mode:"execute",costAdmission:admission},
 reservationInput:{...reservationInput,estimatedCostMinor:2}
});
assert.equal(forbidden.allowed,false);
assert.equal(forbidden.executionAllowed,false);
assert.equal(calls,0);
// The runtime guard may deny first; do not mistake that for exercising the
// reservation estimate identity check. Require an explicit guard denial code.
assert.notEqual(forbidden.code,"cost_boundary_identity_mismatch");
const missing=await authorizeAndReserveAgentCost(env,{});
assert.equal(missing.code,"cost_boundary_invalid");
assert.equal(calls,0);
console.log("Agent execution boundary denies unauthorized reservations without database access");
