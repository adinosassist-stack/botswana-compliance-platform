/**
 * Pure retry/dead-letter decision for the future durable dispatcher.
 * Does not schedule, persist, acknowledge, or execute any work.
 * Callers must obtain attempt count and lease state from a trusted store.
 */
const validCount = value => Number.isSafeInteger(value) && value >= 1 && value <= 10;
export function evaluateEmployeeDispatchRetry(input = {}) {
 const deny = reason => Object.freeze({decision:"stop",reason});
 if (input.featureEnabled !== true || input.killSwitch !== false || input.auditAvailable !== true)
  return deny("governance_denied");
 if (input.currentLease === false || input.tenantStillMatches !== true ||
     input.approvalStillCurrent !== true || input.actorStillAuthorized !== true)
  return deny("authorization_denied");
 if (!validCount(input.attempt) || !validCount(input.maxAttempts) ||
     input.attempt > input.maxAttempts)
  return deny("invalid_attempt");
 if (input.failureKind === "permanent" || input.failureKind === "authorization" ||
     input.failureKind === "validation")
  return Object.freeze({decision:"dead_letter",reason:"nonretryable"});
 if (input.failureKind !== "transient")
  return deny("unknown_failure");
 if (input.attempt >= input.maxAttempts)
  return Object.freeze({decision:"dead_letter",reason:"attempts_exhausted"});
 return Object.freeze({decision:"retry",reason:"transient_failure"});
}
