/**
 * Pure fencing decision for future durable employee workflow dispatch.
 * A database transaction must enforce this decision atomically; this module
 * never claims, renews, completes, or executes a lease.
 */
const validToken = v => typeof v === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(v);
const validTime = v => Number.isSafeInteger(v) && v >= 0;
export function evaluateEmployeeDispatchLeaseCompletion(input = {}) {
 const deny = reason => Object.freeze({allowed:false,reason});
 if (input.featureEnabled !== true || input.killSwitch !== false || input.auditAvailable !== true)
  return deny("governance_denied");
 if (!validToken(input.presentedLeaseToken) || !validToken(input.currentLeaseToken) ||
     input.presentedLeaseToken !== input.currentLeaseToken)
  return deny("lease_fence_denied");
 if (!validTime(input.nowMs) || !validTime(input.leaseExpiresAtMs) ||
     input.nowMs >= input.leaseExpiresAtMs)
  return deny("lease_expired");
 if (input.intentStatus !== "claimed" || input.approvalStillCurrent !== true ||
     input.actorStillAuthorized !== true || input.tenantStillMatches !== true)
  return deny("state_denied");
 return Object.freeze({allowed:true,reason:"eligible_for_atomic_completion"});
}
