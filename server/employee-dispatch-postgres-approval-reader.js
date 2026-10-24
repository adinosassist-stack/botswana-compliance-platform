/**
 * EXPERIMENTAL, READ-ONLY PostgreSQL employee proposal/review adapter.
 * Depends on db/drafts/employee-dispatch-proposal-review-postgres.sql,
 * which is NOT an applied migration. Not a complete dispatch store.
 *
 * The caller MUST run all methods on a single client within an open
 * transaction. All proposal editors/review writers MUST acquire the same
 * proposal-head row lock before mutating revision/review state. Until that
 * write-side discipline and identity authorization are implemented and
 * tested, this reader cannot authorize production dispatch.
 */
const validId = value => typeof value === "string" &&
  /^[A-Za-z0-9_:.-]{1,200}$/.test(value);

export function createEmployeeDispatchPostgresApprovalReader(client) {
  if (!client || typeof client.query !== "function") throw new TypeError("invalid_pg_client");
  const locked = new Set();
  const key = (tenantId, proposalId) => {
    if (!validId(tenantId) || !validId(proposalId)) throw new TypeError("invalid_proposal_scope");
    return JSON.stringify([tenantId, proposalId]);
  };
  const requireLocked = (tenantId, proposalId) => {
    const scope = key(tenantId, proposalId);
    if (!locked.has(scope)) throw new Error("proposal_lock_required");
  };

  async function getLatestReview(tenantId, proposalId) {
    requireLocked(tenantId, proposalId);
    const result = await client.query(
      `select r.review_id, r.proposal_id, r.tenant_id, r.reviewer_id, r.decision
       from employee_dispatch_proposal_reviews r
       join employee_dispatch_proposal_heads h
         on h.tenant_id=r.tenant_id and h.proposal_id=r.proposal_id
        and h.current_revision=r.proposal_revision
       where r.tenant_id=$1 and r.proposal_id=$2 and h.revoked=false
       order by r.reviewed_at desc, r.review_id desc limit 1`,
      [tenantId, proposalId]
    );
    const row = result.rows?.[0];
    if (!row) return null;
    return {
      id: row.review_id, tenantId: row.tenant_id,
      proposalId: row.proposal_id, reviewerId: row.reviewer_id,
      status: row.decision
    };
  }

  return {
    async getProposal(tenantId, proposalId) {
      const scope = key(tenantId, proposalId);
      const result = await client.query(
        `select v.tenant_id, v.proposal_id, v.author_id, v.action
         from employee_dispatch_proposal_heads h
         join employee_dispatch_proposal_versions v
           on v.tenant_id=h.tenant_id and v.proposal_id=h.proposal_id
          and v.revision=h.current_revision
         where h.tenant_id=$1 and h.proposal_id=$2 and h.revoked=false
         for update of h`,
        [tenantId, proposalId]
      );
      const row = result.rows?.[0];
      if (!row) return null;
      locked.add(scope);
      return {
        id: row.proposal_id, tenantId: row.tenant_id,
        authorId: row.author_id, action: row.action
      };
    },
    getLatestReview,
    async isCurrentApprovedReview(tenantId, proposalId, reviewId) {
      requireLocked(tenantId, proposalId);
      if (!validId(reviewId)) return false;
      const review = await getLatestReview(tenantId, proposalId);
      return review?.id === reviewId && review.status === "approved";
    },
    async isCurrentProposalRevision(tenantId, proposalId, reviewId) {
      requireLocked(tenantId, proposalId);
      if (!validId(reviewId)) return false;
      const result = await client.query(
        `select 1 from employee_dispatch_proposal_heads h
         join employee_dispatch_proposal_reviews r
           on r.tenant_id=h.tenant_id and r.proposal_id=h.proposal_id
          and r.proposal_revision=h.current_revision
         where h.tenant_id=$1 and h.proposal_id=$2 and r.review_id=$3
           and h.revoked=false limit 1`,
        [tenantId, proposalId, reviewId]
      );
      return result.rowCount === 1;
    }
    // Deliberately no isAuthorizedReviewer, lockDispatchKey, insertIntentOnce
    // or appendAudit: this reader cannot satisfy queueEmployeeDispatch.
  };
}
