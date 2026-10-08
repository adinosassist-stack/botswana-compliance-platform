// Provider-neutral, fail-closed cost admission for autonomous agent runs.
// This module does not grant authority: callers MUST also pass agent-runtime-guard.
export const AGENT_COST_POLICY_VERSION="2026-10-08.v1";
const validMinor=value=>Number.isSafeInteger(value)&&value>=0;
export function evaluateAgentCostAdmission({
  tenantId,actorTenantId,agentId,estimatedCostMinor,
  spentMinor,budgetMinor,usageKnown=true,enabled=false,
  suspended=false
}={}){
  const deny=(code)=>Object.freeze({allowed:false,code,version:AGENT_COST_POLICY_VERSION});
  if(enabled!==true)return deny("cost_admission_disabled");
  if(!tenantId||!actorTenantId||String(tenantId)!==String(actorTenantId))return deny("cost_tenant_mismatch");
  if(!agentId||typeof agentId!=="string")return deny("agent_identity_required");
  if(suspended===true)return deny("agent_suspended");
  if(usageKnown!==true)return deny("cost_usage_unknown");
  if(![estimatedCostMinor,spentMinor,budgetMinor].every(validMinor))return deny("cost_amount_invalid");
  if(estimatedCostMinor>budgetMinor-spentMinor)return deny("agent_cost_budget_exceeded");
  return Object.freeze({allowed:true,code:"cost_admitted",remainingMinor:budgetMinor-spentMinor-estimatedCostMinor,version:AGENT_COST_POLICY_VERSION});
}
export function normalizeAgentUsage({provider,model,inputTokens,outputTokens,estimatedCostMinor,runId}={}){
  if(!provider||!model||!runId||typeof provider!=="string"||typeof model!=="string"||typeof runId!=="string")return null;
  if(![inputTokens,outputTokens,estimatedCostMinor].every(validMinor))return null;
  return Object.freeze({provider,model,runId,inputTokens,outputTokens,estimatedCostMinor,currency:"BWP",verifiedCost:false});
}
