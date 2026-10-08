import assert from "node:assert/strict";
import {evaluateAgentCostAdmission as check,normalizeAgentUsage} from "../cloudflare/src/agent-cost-admission.js";
const base={tenantId:"t1",actorTenantId:"t1",agentId:"thebe",estimatedCostMinor:100,spentMinor:400,budgetMinor:500,usageKnown:true,enabled:true};
assert.equal(check(base).allowed,true);
for(const [patch,code] of [
  [{enabled:false},"cost_admission_disabled"],
  [{actorTenantId:"t2"},"cost_tenant_mismatch"],
  [{agentId:""},"agent_identity_required"],
  [{suspended:true},"agent_suspended"],
  [{usageKnown:false},"cost_usage_unknown"],
  [{estimatedCostMinor:101},"agent_cost_budget_exceeded"],
  [{spentMinor:-1},"cost_amount_invalid"],
  [{estimatedCostMinor:NaN},"cost_amount_invalid"],
  [{budgetMinor:0},"agent_cost_budget_exceeded"]
])assert.equal(check({...base,...patch}).code,code);
assert.equal(normalizeAgentUsage({provider:"p",model:"m",runId:"r",inputTokens:1,outputTokens:2,estimatedCostMinor:3}).currency,"BWP");
assert.equal(normalizeAgentUsage({provider:"p",model:"m",runId:"r",inputTokens:-1,outputTokens:2,estimatedCostMinor:3}),null);
console.log("Agent cost admission tests passed");
