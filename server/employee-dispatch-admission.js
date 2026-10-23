/**
 * Pure, fail-closed admission preflight for future employee workflow dispatch.
 * No database writes, approvals, queues or effects are performed here.
 */
export const EMPLOYEE_INTERNAL_ACTIONS = Object.freeze([
  "create_internal_task",
  "prepare_report_draft"
]);

export function evaluateEmployeeDispatchAdmission(input = {}) {
  const deny = reason => Object.freeze({ allowed: false, reason });
  if (input.featureEnabled !== true || input.killSwitch !== false ||
      input.auditAvailable !== true) return deny("governance_denied");
  if (typeof input.tenantId !== "string" || !input.tenantId.trim() ||
      typeof input.actorId !== "string" || !input.actorId.trim())
    return deny("identity_missing");
  if (input.proposalTenantId !== input.tenantId) return deny("tenant_mismatch");
  if (input.action !== "create_internal_task" &&
      input.action !== "prepare_report_draft") return deny("action_denied");
  if (input.persistedApprovalValid !== true ||
      input.reviewerAuthorized !== true ||
      input.currentProposalRevision !== true ||
      input.approvalUnrevoked !== true) return deny("approval_denied");
  if (input.authorizationCurrent !== true || input.budgetAvailable !== true)
    return deny("authorization_denied");
  return Object.freeze({ allowed: true, reason: "preflight_only" });
}
