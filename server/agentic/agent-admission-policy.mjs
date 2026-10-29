// Pure, default-deny admission policy. The caller must provide authenticated,
// server-derived tenant, actor and role context. Never trust model-generated claims.
const NON_EXECUTABLE = new Set(["payment.execute","subscription.activate","regulatory.activate"]);
export function admitAgentAction({policy,context,action,estimatedCostMinor=0,now=Date.now()}) {
  if (!policy || policy.enabled !== true || policy.stopped === true)
    return {allowed:false,reason:"agent_disabled"};
  if (!context || !context.authenticated || !context.tenantId || !context.actorId)
    return {allowed:false,reason:"unauthenticated"};
  if (policy.tenantId !== context.tenantId)
    return {allowed:false,reason:"tenant_mismatch"};
  if (typeof action !== "string" || !action || NON_EXECUTABLE.has(action))
    return {allowed:false,reason:"restricted_action"};
  if (!Array.isArray(policy.allowedActions) || !policy.allowedActions.includes(action))
    return {allowed:false,reason:"action_not_allowed"};
  if (!Number.isSafeInteger(estimatedCostMinor) || estimatedCostMinor < 0)
    return {allowed:false,reason:"invalid_cost"};
  if (!Number.isSafeInteger(policy.budgetMinor) || policy.budgetMinor < 0 ||
      !Number.isSafeInteger(policy.spentMinor) || policy.spentMinor < 0)
    return {allowed:false,reason:"invalid_budget"};
  if (estimatedCostMinor > policy.budgetMinor - policy.spentMinor)
    return {allowed:false,reason:"budget_exceeded"};
  if (policy.expiresAt != null && (!Number.isFinite(policy.expiresAt) || now >= policy.expiresAt))
    return {allowed:false,reason:"policy_expired"};
  if (policy.requiresApproval === true && policy.approved !== true)
    return {allowed:false,reason:"approval_required"};
  return {allowed:true,reason:"admitted"};
}
// This function authorizes nothing by itself: production must atomically reserve
// budget and recheck current policy in persistent storage before tool execution.
