import { randomUUID } from "node:crypto";
import { createEmployeeDispatchPostgresTransactionStore } from "./employee-dispatch-postgres-transaction.js";

/**
 * DESIGN-ONLY authenticated issuance of a DISABLED People reviewer grant.
 *
 * The resolveAuthenticatedSession callback MUST be a trusted server-side
 * middleware adapter, never an object read from request JSON. The canonical
 * Node sessions and memberships tables are rechecked inside the same
 * PostgreSQL transaction that writes the grant and immutable issuance audit.
 * This module creates no routes, enables no grants and authorizes no dispatch.
 */
const isUuid = value => typeof value === "string" &&
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value);

export function createEmployeeReviewerGrantIssuerDraft({ pool, resolveAuthenticatedSession } = {}) {
  if (!pool || typeof pool.connect !== "function" ||
      typeof resolveAuthenticatedSession !== "function") {
    throw new TypeError("invalid_grant_issuer_dependencies");
  }

  const store = createEmployeeDispatchPostgresTransactionStore(pool, client => ({
    async issueDisabledGrant(tenantId, sessionId, reviewerId) {
      // Never use a caller-provided owner ID or role. Resolve the current
      // issuer identity from the trusted session row in the same transaction.
      const issuer = await client.query(
        `select s.user_id::text as issuer_id
         from sessions s
         join users u on u.id=s.user_id
         join memberships m on m.tenant_id=s.tenant_id and m.user_id=s.user_id
         where s.id=$1::uuid and s.tenant_id=$2::uuid
           and s.revoked_at is null and s.expires_at>now()
           and s.session_generation=u.session_generation
           and m.status='active' and m.role='owner'
         for share of s,u,m`,
        [sessionId, tenantId]
      );
      if (issuer.rowCount !== 1 || !isUuid(issuer.rows?.[0]?.issuer_id)) {
        return false;
      }
      const issuerId = issuer.rows[0].issuer_id;
      if (issuerId === reviewerId) return false;

      // The draft INSERT trigger separately checks the issuer's current
      // membership and the active membership of the proposed reviewer.
      const inserted = await client.query(
        `insert into employee_dispatch_reviewer_permission_grants
          (tenant_id,reviewer_user_id,permission,granted_by_user_id,enabled)
         values ($1::uuid,$2::uuid,'people.workflow.approve',$3::uuid,false)
         returning reviewer_user_id`,
        [tenantId, reviewerId, issuerId]
      );
      if (inserted.rowCount !== 1 ||
          inserted.rows?.[0]?.reviewer_user_id !== reviewerId) {
        throw new Error("disabled_grant_insert_unconfirmed");
      }

      const audited = await client.query(
        `insert into employee_dispatch_grant_issuance_audit
          (event_id,tenant_id,reviewer_user_id,permission,issuer_user_id,
           issuer_session_id,event_type)
         values ($1::uuid,$2::uuid,$3::uuid,'people.workflow.approve',
                 $4::uuid,$5::uuid,'employee.reviewer_grant.issued_disabled')
         returning event_id`,
        [randomUUID(), tenantId, reviewerId, issuerId, sessionId]
      );
      if (audited.rowCount !== 1 || !isUuid(audited.rows?.[0]?.event_id)) {
        throw new Error("grant_issuance_audit_unconfirmed");
      }
      return true;
    }
  }));

  return {
    async issueDisabledGrant({ context, reviewerId } = {}) {
      if (!isUuid(reviewerId)) return { issued: false, reason: "invalid_request" };
      try {
        const session = await resolveAuthenticatedSession(context);
        if (!isUuid(session?.id) || !isUuid(session?.tenantId)) {
          return { issued: false, reason: "unauthenticated" };
        }
        // No tenant ID, issuer ID or role is taken from context.body.
        const issued = await store.transaction(tx =>
          tx.issueDisabledGrant(session.tenantId, session.id, reviewerId)
        );
        return issued === true
          ? { issued: true, reason: "disabled_grant_created" }
          : { issued: false, reason: "forbidden" };
      } catch {
        // A failing audit or DB constraint must roll back issuance.
        return { issued: false, reason: "governance_unavailable" };
      }
    }
  };
}
