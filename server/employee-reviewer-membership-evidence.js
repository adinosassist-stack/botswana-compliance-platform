/**
 * EXPERIMENTAL PostgreSQL evidence of an active reviewer membership and a
 * matching current review. This is NOT approval permission or execution
 * authorization and must not be wired to production dispatch.
 *
 * Use with the existing transaction client, AFTER locking the proposal head.
 * A concurrent membership deactivation cannot commit while the shared lock
 * is held. No caller-supplied role or permission is trusted here.
 */
const isUuid = value => typeof value === "string" &&
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value);
const isId = value => typeof value === "string" &&
  /^[A-Za-z0-9_:.-]{1,200}$/.test(value);

export function createEmployeeReviewerMembershipEvidence(client) {
  if (!client || typeof client.query !== "function") {
    throw new TypeError("invalid_pg_client");
  }
  return {
    async hasCurrentReviewerMembership(tenantId, reviewerId, proposalId, reviewId) {
      if (!isUuid(tenantId) || !isUuid(reviewerId) ||
          !isId(proposalId) || !isId(reviewId)) return false;
      const result = await client.query(
        `select 1 from memberships m
         join employee_dispatch_proposal_reviews r
           on r.tenant_id=m.tenant_id::text and r.reviewer_id=m.user_id::text
         join employee_dispatch_proposal_heads h
           on h.tenant_id=r.tenant_id and h.proposal_id=r.proposal_id
         join employee_dispatch_proposal_versions v
           on v.tenant_id=h.tenant_id and v.proposal_id=h.proposal_id
          and v.revision=h.current_revision
         where m.tenant_id=$1::uuid and m.user_id=$2::uuid
           and m.status='active' and r.proposal_id=$3 and r.review_id=$4
           and r.proposal_revision=h.current_revision
           and r.review_sequence=h.last_review_sequence
           and r.decision='approved' and h.revoked=false
           and r.reviewer_id<>v.author_id
         for share of m, h`,
        [tenantId, reviewerId, proposalId, reviewId]
      );
      return result.rowCount === 1;
    }
  };
}
// Intentionally NO isAuthorizedReviewer method: active membership is not
// equivalent to people.workflow.approve, and review authorship must still
// be established from trusted authenticated write provenance.
