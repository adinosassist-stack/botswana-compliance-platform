import { randomUUID } from "node:crypto";
import { createEmployeeDispatchPostgresTransactionStore } from "./employee-dispatch-postgres-transaction.js";

/**
 * DRAFT ONLY: no HTTP route, no production migration, no dispatch or worker.
 * resolveAuthenticatedSession MUST come from trusted server-side middleware,
 * never from request JSON. This service revalidates the canonical Node session
 * inside the transaction; a different active owner must activate the grant.
 */
const uuid = value => typeof value === "string" &&
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value);

export function createEmployeeReviewerGrantActivatorDraft({ pool, resolveAuthenticatedSession } = {}) {
  if (!pool || typeof pool.connect !== "function" ||
      typeof resolveAuthenticatedSession !== "function") {
    throw new TypeError("invalid_grant_activation_dependencies");
  }

  const store = createEmployeeDispatchPostgresTransactionStore(pool, client => ({
    async activate(tenantId, sessionId, reviewerId) {
      const evidence = await client.query(
        `select s.user_id::text as activator_id
         from sessions s
         join users u on u.id=s.user_id
         join memberships activator
           on activator.tenant_id=s.tenant_id and activator.user_id=s.user_id
         join employee_dispatch_reviewer_permission_grants g
           on g.tenant_id=s.tenant_id and g.reviewer_user_id=$3::uuid
         join memberships issuer
           on issuer.tenant_id=g.tenant_id and issuer.user_id=g.granted_by_user_id
         join memberships reviewer
           on reviewer.tenant_id=g.tenant_id and reviewer.user_id=g.reviewer_user_id
         where s.id=$1::uuid and s.tenant_id=$2::uuid
           and s.revoked_at is null and s.expires_at>now()
           and s.session_generation=u.session_generation
           and activator.status='active' and activator.role='owner'
           and issuer.status='active' and issuer.role='owner'
           and reviewer.status='active'
           and g.permission='people.workflow.approve'
           and g.enabled=false and g.revoked_at is null
           and activator.user_id<>g.granted_by_user_id
           and activator.user_id<>g.reviewer_user_id
         for update of g
         for share of s,u,activator,issuer,reviewer`,
        [sessionId, tenantId, reviewerId]
      );
      if (evidence.rowCount !== 1 || !uuid(evidence.rows?.[0]?.activator_id)) {
        return false;
      }
      const activatorId = evidence.rows[0].activator_id;
      const audit = await client.query(
        `insert into employee_dispatch_grant_activation_audit
           (event_id,tenant_id,reviewer_user_id,permission,activated_by_user_id,
            activation_session_id,event_type)
         values ($1,$2::uuid,$3::uuid,'people.workflow.approve',
                 $4::uuid,$5::uuid,'employee.reviewer_grant.activated')
         returning event_id`,
        [randomUUID(), tenantId, reviewerId, activatorId, sessionId]
      );
      if (audit.rowCount !== 1 || !uuid(audit.rows?.[0]?.event_id)) {
        throw new Error("activation_audit_unconfirmed");
      }
      const change = await client.query(
        `update employee_dispatch_reviewer_permission_grants
         set enabled=true
         where tenant_id=$1::uuid and reviewer_user_id=$2::uuid
           and permission='people.workflow.approve'
           and enabled=false and revoked_at is null
         returning enabled`,
        [tenantId, reviewerId]
      );
      if (change.rowCount !== 1 || change.rows?.[0]?.enabled !== true) {
        throw new Error("activation_update_unconfirmed");
      }
      return true;
    }
  }));

  return {
    async activateDisabledGrant({ context, reviewerId } = {}) {
      if (!uuid(reviewerId)) return { activated: false, reason: "invalid_request" };
      try {
        const session = await resolveAuthenticatedSession(context);
        if (!uuid(session?.id) || !uuid(session?.tenantId)) {
          return { activated: false, reason: "unauthenticated" };
        }
        const enabled = await store.transaction(tx =>
          tx.activate(session.tenantId, session.id, reviewerId)
        );
        return enabled === true
          ? { activated: true, reason: "grant_activated" }
          : { activated: false, reason: "forbidden" };
      } catch {
        return { activated: false, reason: "governance_unavailable" };
      }
    }
  };
}
