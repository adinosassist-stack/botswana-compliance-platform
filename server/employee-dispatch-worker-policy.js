/**
 * Default-deny worker preflight. This does not execute work or mutate state.
 * All facts must be loaded from trusted server storage immediately before
 * the worker commits any internal side effect.
 */
import { evaluateEmployeeDispatch } from "./employee-dispatch-admission.js";

export function evaluateEmployeeWorker({
  featureEnabled = false, killSwitch = true, auditAvailable = false,
  identity, proposal, review, intent, action, currentReview = false,
  reviewerAuthorized = false, currentRevision = false,
  leaseToken, nowEpochSeconds
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
  if (!Number.isSafeInteger(intent.maxAttempts) || intent.maxAttempts < 1 ||
      intent.maxAttempts > 10 || intent.attempts > intent.maxAttempts ||
      typeof leaseToken !== "string" || !/^[a-zA-Z0-9_:.\-]{1,200}$/.test(leaseToken) ||
      intent.leaseToken !== leaseToken ||
      !Number.isSafeInteger(nowEpochSeconds) || nowEpochSeconds < 0 ||
      !Number.isSafeInteger(intent.leaseExpiresAt) || intent.leaseExpiresAt <= nowEpochSeconds) {
    return { allowed: false, reason: "invalid_worker_lease" };
  }
  if (currentReview !== true || reviewerAuthorized !== true || currentRevision !== true) {
    return { allowed: false, reason: "approval_required" };
  }
  const decision = evaluateEmployeeDispatch({
    featureEnabled, killSwitch, auditAvailable, identity, proposal, review,
    action, idempotencyKey: intent.idempotencyKey
  });
  // Storage must still fence completion in the same transaction as the effect;
  // this preflight decision is not a reusable execution grant.
  if (!decision.allowed) return { allowed: false, reason: decision.reason };
  // Bind the persisted execution category to the allowlisted action mapping.
  // A stale or tampered intent must not be routed to another effect adapter.
  if (intent.intentType !== decision.intentType) {
    return { allowed: false, reason: "intent_type_mismatch" };
  }
  return { allowed: true, reason: "eligible_for_internal_worker_execution" };
}
