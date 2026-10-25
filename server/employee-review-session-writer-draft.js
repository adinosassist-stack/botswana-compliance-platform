import { randomUUID } from "node:crypto";
import { createEmployeeDispatchPostgresTransactionStore } from "./employee-dispatch-postgres-transaction.js";

/**
 * DESIGN-ONLY authenticated People review writer for disposable PostgreSQL.
 * Requires db/drafts/employee-dispatch-review-session-provenance.sql.
 * The resolver MUST be a server-middleware adapter, never request JSON.
 * No runtime route, task execution or dispatch authorization is exposed.
 */
const uuid = value => typeof value === "string" &&
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value);
const id = value => typeof value === "string" &&
  /^[A-Za-z0-9_:.-]{1,200}$/.test(value);
const decisions = new Set(["approved", "rejected"]);

export function createEmployeeReviewSessionWriterDraft({ pool, resolveAuthenticatedSession } = {}) {
  if (!pool || typeof pool.connect !== "function" ||
      typeof resolveAuthenticatedSession !== "function") {
    throw new TypeError("invalid_review_writer_dependencies");
  }

  const store = createEmployeeDispatchPostgresTransactionStore(pool, client => ({
    async record(tenantId, sessionId, proposalId, decision) {
      // All identity and permission evidence comes from persisted current DB
      // rows, not an actorId, role or permission submitted by the caller.
      const principal = await client.query(
        `select s.user_id::text as reviewer_id,
                h.current_revision
         from sessions s
         join users u on u.id=s.user_id
         join memberships m on m.tenant_id=s.tenant_id and m.user_id=s.user_id
         join employee_dispatch_reviewer_permission_grants g
           on g.tenant_id=m.tenant_id and g.reviewer_user_id=m.user_id
         join memberships issuer
           on issuer.tenant_id=g.tenant_id and issuer.user_id=g.granted_by_user_id
         join employee_dispatch_proposal_heads h
           on h.tenant_id=s.tenant_id::text and h.proposal_id=$3
         join employee_dispatch_proposal_versions v
           on v.tenant_id=h.tenant_id and v.proposal_id=h.proposal_id
          and v.revision=h.current_revision
         where s.id=$1::uuid and s.tenant_id=$2::uuid
           and s.revoked_at is null and s.expires_at>now()
           and s.session_generation=u.session_generation
           and m.status='active' and m.role in ('owner','manager','reviewer')
           and g.permission='people.workflow.approve'
           and g.enabled=true and g.revoked_at is null
           and issuer.status='active' and issuer.role='owner'
           and issuer.user_id<>m.user_id
           and v.author_id<>s.user_id::text and h.revoked=false
         for update of h
         for share of s,u,m,g,issuer`,
        [sessionId, tenantId, proposalId]
      );
      if (principal.rowCount !== 1 || !uuid(principal.rows?.[0]?.reviewer_id)) {
        return null;
      }
      const { reviewer_id: reviewerId, current_revision: revision } = principal.rows[0];
      const reviewId = randomUUID();
      const review = await client.query(
        `insert into employee_dispatch_proposal_reviews
          (tenant_id,review_id,proposal_id,proposal_revision,reviewer_id,decision)
         values ($1,$2,$3,$4,$5,$6)
         returning review_id`,
        [tenantId, reviewId, proposalId, revision, reviewerId, decision]
      );
      if (review.rowCount !== 1 || review.rows?.[0]?.review_id !== reviewId) {
        throw new Error("review_insert_unconfirmed");
      }
      const provenance = await client.query(
        `insert into employee_dispatch_review_session_provenance
          (tenant_id,review_id,session_id,reviewer_user_id)
         values ($1,$2,$3::uuid,$4::uuid)
         returning review_id`,
        [tenantId, reviewId, sessionId, reviewerId]
      );
      if (provenance.rowCount !== 1 || provenance.rows?.[0]?.review_id !== reviewId) {
        throw new Error("review_session_provenance_unconfirmed");
      }
      // The transaction must COMMIT before this review is considered durable.
      // The deferred DB trigger independently requires provenance on COMMIT.
      return reviewId;
    }
  }));

  return {
    async recordReview({ context, proposalId, decision } = {}) {
      if (!id(proposalId) || !decisions.has(decision)) {
        return { recorded: false, reason: "invalid_request" };
      }
      try {
        const session = await resolveAuthenticatedSession(context);
        if (!uuid(session?.id) || !uuid(session?.tenantId)) {
          return { recorded: false, reason: "unauthenticated" };
        }
        const reviewId = await store.transaction(tx =>
          tx.record(session.tenantId, session.id, proposalId, decision)
        );
        return reviewId
          ? { recorded: true, reviewId }
          : { recorded: false, reason: "forbidden" };
      } catch {
        return { recorded: false, reason: "governance_unavailable" };
      }
    }
  };
}
