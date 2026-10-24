/**
 * Experimental, read-only evidence for an explicit People review permission.
 * This is NOT reviewer authorization or a production dispatch capability.
 * Call on the same PostgreSQL transaction client after locking the proposal.
 * See db/drafts/employee-dispatch-reviewer-permission-postgres.sql.
 */
const uuid = v => typeof v === "string" &&
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(v);
const id = v => typeof v === "string" && /^[A-Za-z0-9_:.-]{1,200}$/.test(v);

export function createEmployeeReviewerPermissionEvidence(client) {
  if (!client || typeof client.query !== "function") throw new TypeError("invalid_pg_client");
  return {
    async hasExplicitApprovalGrant(tenantId, reviewerId, proposalId, reviewId) {
      if (!uuid(tenantId) || !uuid(reviewerId) || !id(proposalId) || !id(reviewId)) return false;
      const result = await client.query(
        `select 1 from employee_dispatch_reviewer_permission_grants g
         join memberships m
           on m.tenant_id=g.tenant_id and m.user_id=g.reviewer_user_id
         join memberships issuer
           on issuer.tenant_id=g.tenant_id and issuer.user_id=g.granted_by_user_id
         join employee_dispatch_proposal_reviews r
           on r.tenant_id=g.tenant_id::text and r.reviewer_id=g.reviewer_user_id::text
         join employee_dispatch_proposal_heads h
           on h.tenant_id=r.tenant_id and h.proposal_id=r.proposal_id
         join employee_dispatch_proposal_versions v
           on v.tenant_id=h.tenant_id and v.proposal_id=h.proposal_id
          and v.revision=h.current_revision
         where g.tenant_id=$1::uuid and g.reviewer_user_id=$2::uuid
           and g.permission='people.workflow.approve'
           and g.enabled=true and g.revoked_at is null
           and m.status='active' and m.role in ('owner','manager','reviewer')
           and issuer.status='active' and issuer.role='owner'
           and issuer.user_id<>m.user_id
           and r.proposal_id=$3 and r.review_id=$4
           and r.proposal_revision=h.current_revision
           and r.review_sequence=h.last_review_sequence
           and r.decision='approved' and h.revoked=false
           and v.author_id<>r.reviewer_id
         for share of g,m,issuer,h`,
        [tenantId, reviewerId, proposalId, reviewId]
      );
      return result.rowCount === 1;
    }
  };
}
// No isAuthorizedReviewer method: a grant row without trusted grant-issuer
// authentication and review-write provenance cannot authorize dispatch.
