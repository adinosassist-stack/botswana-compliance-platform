// Pure, read-only anomaly classification. This function never authorizes execution.
const SIGNALS = new Set(["cross_tenant_attempt","authorization_denied","unexpected_tool","retry_after_denial","budget_threshold","suspended_agent_call","policy_unavailable","audit_unavailable"]);
export function classifyAgentAnomaly(input={}) {
  const deny = reason => Object.freeze({ok:false,reason,executionAllowed:false,requiresOwnerReview:false});
  if (!input || typeof input !== "object" || Array.isArray(input)) return deny("invalid_input");
  const {tenantId,agentId,correlationId,signal,count=1} = input;
  if (![tenantId,agentId,correlationId].every(v => typeof v === "string" && v.trim() === v && v.length > 0 && v.length <= 128)) return deny("invalid_identity");
  if (!SIGNALS.has(signal) || !Number.isSafeInteger(count) || count < 1 || count > 100000) return deny("invalid_signal");
  const severe = ["cross_tenant_attempt","suspended_agent_call","policy_unavailable","audit_unavailable"].includes(signal);
  const review = severe || (["authorization_denied","unexpected_tool","retry_after_denial"].includes(signal) && count >= 3) || signal === "budget_threshold";
  return Object.freeze({ok:true,tenantId,agentId,correlationId,signal,severity:severe?"critical":review?"high":"informational",requiresOwnerReview:review,recommendSuspension:severe,executionAllowed:false});
}
