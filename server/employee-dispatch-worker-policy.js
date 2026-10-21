/**
 * Default-deny worker preflight. This does not execute work or mutate state.
 * All facts must be loaded from trusted server storage immediately before
 * the worker commits any internal side effect.
 */
import { evaluateEmployeeDispatch } from "./employee-dispatch-admission.js";

export function evaluateEmployeeWorker({
  featureEnabled = false, killSwitch = true, auditAvailable = false,
  identity, proposal, review, intent, action, currentReview = false,
  reviewerAuthorized = false, currentRevision = false
} = {}) {
  if (!intent || intent.state !== "leased" || intent.attempts < 1 ||
      !Number.isSafeInteger(intent.attempts) ||
      intent.tenantId !== identity?.tenantId ||
      intent.proposalId !== proposal?.id ||
      intent.reviewId !== review?.id ||
      intent.action !== action ||
      intent.idempotencyKey == null) {
    return { allowed: false, reason: "invalid_worker_intent" };
  }
  if (currentReview !== true || reviewerAuthorized !== true || currentRevision !== true) {
    return { allowed: false, reason: "approval_required" };
  }
  const decision = evaluateEmployeeDispatch({
    featureEnabled, killSwitch, auditAvailable, identity, proposal, review,
    action, idempotencyKey: intent.idempotencyKey
  });
  return decision.allowed
    ? { allowed: true, reason: "eligible_for_internal_worker_execution" }
    : { allowed: false, reason: decision.reason };
}
