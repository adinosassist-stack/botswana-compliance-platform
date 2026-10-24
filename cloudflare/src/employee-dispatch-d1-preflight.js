import { APPROVED_EMPLOYEE_PROVENANCE_SQL } from "./employee-proposal-review-d1-store.js";

/**
 * Preparation-only D1 eligibility snapshot. Does not enqueue, execute, or grant
 * permission. The production writer MUST recheck provenance in its atomic batch.
 */
export function createEmployeeDispatchD1Preflight(db) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("invalid_d1");
  return {
    async check({ tenantId, proposalKey, featureEnabled = false, killSwitch = true, auditAvailable = false } = {}) {
      if (featureEnabled !== true || killSwitch !== false || auditAvailable !== true) {
        return { eligible: false, reason: "governance_unavailable" };
      }
      if (typeof tenantId !== "string" || !/^[a-zA-Z0-9_:.-]{1,200}$/.test(tenantId) ||
          typeof proposalKey !== "string" || proposalKey.length < 1 || proposalKey.length > 2048) {
        return { eligible: false, reason: "invalid_scope" };
      }
      try {
        const row = await db.prepare(`SELECT proposal_revision,workflow_revision,author_id,reviewer_id
          FROM (${APPROVED_EMPLOYEE_PROVENANCE_SQL}) LIMIT 1`).bind(tenantId, proposalKey).first();
        if (!row || typeof row.proposal_revision !== "string" || typeof row.workflow_revision !== "string") {
          return { eligible: false, reason: "approval_required" };
        }
        return { eligible: true, reason: "snapshot_only_no_execution_authority",
          proposalRevision: row.proposal_revision, workflowRevision: row.workflow_revision };
      } catch {
        return { eligible: false, reason: "governance_unavailable" };
      }
    }
  };
}
