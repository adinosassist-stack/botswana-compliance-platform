// Pure owner-assistant request gate. No route, credential exchange, or deployment.
// The caller MUST supply server-verified identity; never derive authority from request input.
export const OWNER_ASSISTANT_READ_ACTIONS = Object.freeze([
  "business_health.read",
  "financial_position.read",
  "finance_data_quality.read",
  "finance_daily_inflows.read",
  "receivables_summary.read",
  "compliance_status.read",
  "daily_operations_summary.read"
]);
const allowed = new Set(OWNER_ASSISTANT_READ_ACTIONS);
const deny = code => Object.freeze({allowed:false,executionAllowed:false,code});

export function authorizeOwnerAssistantRead({enabled=false,identity=null,actionKey=null,tenantId=null}={}) {
  if(enabled !== true) return deny("owner_assistant_disabled");
  if(!identity || identity.serverVerified !== true || identity.role !== "owner" || identity.systemActor === true)
    return deny("owner_identity_required");
  if(typeof identity.tenantId !== "string" || !identity.tenantId.trim() || identity.tenantId !== tenantId)
    return deny("tenant_scope_mismatch");
  if(typeof actionKey !== "string" || !allowed.has(actionKey)) return deny("read_action_not_allowed");
  return Object.freeze({allowed:true,executionAllowed:false,readOnly:true,actionKey,tenantId});
}
