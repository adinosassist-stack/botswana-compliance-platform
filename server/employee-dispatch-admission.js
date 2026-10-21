/**
 * Pure, default-off employee dispatch admission. No side effects or authority
 * are granted here: the caller must validate persisted proposal/review records,
 * then transactionally authorize and enqueue with a durable storage adapter.
 */
const INTERNAL_ACTIONS = Object.freeze({
  "internal.task.create": "task",
  "internal.report.draft": "report"
});
export const EMPLOYEE_DISPATCH_ACTIONS = Object.freeze(Object.keys(INTERNAL_ACTIONS));

const validId = value => typeof value === "string" && value.length > 0 && value.length <= 200 && /^[a-zA-Z0-9_:.\-]+$/.test(value);

export function evaluateEmployeeDispatch({ featureEnabled = false, killSwitch = true, auditAvailable = false, identity, proposal, review, action, idempotencyKey } = {}) {
  if (!featureEnabled || killSwitch || !auditAvailable) return { allowed: false, reason: "governance_unavailable" };
  if (!validId(identity?.tenantId) || !validId(identity?.actorId) || !Array.isArray(identity?.permissions) || !identity.permissions.includes("employee.workflow.dispatch")) return { allowed: false, reason: "unauthorized_actor" };
  if (!Object.hasOwn(INTERNAL_ACTIONS, action)) return { allowed: false, reason: "unsupported_action" };
  if (!validId(proposal?.id) || !validId(proposal?.tenantId) || proposal.tenantId !== identity.tenantId || proposal.action !== action) return { allowed: false, reason: "proposal_scope_mismatch" };
  // Review independence is from the original proposal author, not the dispatching worker.
  // Missing author identity fails closed until the trusted store supplies it.
  if (!validId(proposal.authorId) || !validId(review?.id) || review.proposalId !== proposal.id || review.tenantId !== identity.tenantId || review.status !== "approved" || !validId(review.reviewerId) || review.reviewerId === proposal.authorId || review.reviewerId === identity.actorId) return { allowed: false, reason: "approval_required" };
  if (!validId(idempotencyKey)) return { allowed: false, reason: "invalid_idempotency_key" };
  return { allowed: true, reason: "eligible_for_transactional_authorization", intentType: INTERNAL_ACTIONS[action] };
}
