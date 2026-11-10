/**
 * Pure, default-deny admission guard for a future employee workflow dispatcher.
 * No database, queue, scheduler, external effects or activation path is provided.
 * Trusted callers must obtain these values from authenticated and persisted sources.
 */
const INTERNAL_ACTIONS = Object.freeze(new Set(["create_internal_task","prepare_report_draft"]));
const VALID_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const validId = value => typeof value === "string" && VALID_ID.test(value);
export function evaluateEmployeeDispatchAdmission(input = {}) {
 const deny = reason => Object.freeze({allowed:false,reason});
 if (input.featureEnabled !== true || input.killSwitch !== false || input.auditAvailable !== true)
  return deny("governance_denied");
 if (!validId(input.tenantId) || !validId(input.actorId) || !validId(input.proposalId) ||
     !validId(input.reviewId) || !validId(input.reviewerId) || !validId(input.idempotencyKey))
  return deny("invalid_identity");
 if (input.proposalTenantId !== input.tenantId || input.reviewTenantId !== input.tenantId)
  return deny("tenant_mismatch");
 if (!validId(input.proposalRevision) || !validId(input.reviewedProposalRevision) ||
     input.proposalRevision !== input.reviewedProposalRevision)
  return deny("revision_mismatch");
 if (input.proposalStatus !== "approved" || input.reviewStatus !== "approved" ||
     input.reviewerId === input.actorId || input.reviewerAuthorized !== true ||
     input.currentApprovedReview !== true || input.currentProposalRevision !== true)
  return deny("approval_denied");
 if (input.actorAuthorized !== true || input.budgetAvailable !== true)
  return deny("authorization_denied");
 if (!INTERNAL_ACTIONS.has(input.action))
  return deny("action_denied");
 return Object.freeze({allowed:true,reason:"eligible_for_atomic_admission"});
}
