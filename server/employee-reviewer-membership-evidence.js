/**
 * Evidence of active tenant membership, not proof of approval permission.
 * The caller supplies a PostgreSQL transaction client already bound to the
 * authenticated request; this module does not grant dispatch authorization.
 */
const isUuid = value => typeof value === "string" &&
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value);

export function createEmployeeReviewerMembershipEvidence(client) {
  if (!client || typeof client.query !== "function") {
    throw new TypeError("invalid_pg_client");
  }
  return {
    async hasActiveMembership(tenantId, reviewerId) {
      if (!isUuid(tenantId) || !isUuid(reviewerId)) return false;
      const result = await client.query(
        `select 1 from memberships
         where tenant_id=$1::uuid and user_id=$2::uuid and status='active'
         for share`,
        [tenantId, reviewerId]
      );
      return result.rowCount === 1;
    }
  };
}
// Intentionally does not expose isAuthorizedReviewer. A membership row alone
// does not establish people.workflow.approve or the review's provenance.
