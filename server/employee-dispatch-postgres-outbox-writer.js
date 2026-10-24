import { randomUUID } from "node:crypto";

/**
 * EXPERIMENTAL, transaction-scoped PostgreSQL employee intent/audit writer.
 * Uses db/drafts/employee-dispatch-outbox-postgres.sql (NOT a migration).
 * MUST be constructed for one client within an open transaction.
 *
 * This intentionally does not implement persisted reviewer authorization,
 * proposal/review reads or worker execution. Alone it cannot satisfy
 * queueEmployeeDispatch's required trusted store methods.
 */
const validId = value => typeof value === "string" &&
  /^[A-Za-z0-9_:.-]{1,200}$/.test(value);
const INTENT_TYPES = Object.freeze({
  "internal.task.create": "task",
  "internal.report.draft": "report"
});

export function createEmployeeDispatchPostgresOutboxWriter(client) {
  if (!client || typeof client.query !== "function") throw new TypeError("invalid_pg_client");
  let lockScope = null;
  let admitted = null;

  return {
    async lockDispatchKey(tenantId, idempotencyKey) {
      if (!validId(tenantId) || !validId(idempotencyKey)) throw new TypeError("invalid_dispatch_key");
      const scope = JSON.stringify([tenantId, idempotencyKey]);
      if (lockScope !== null && lockScope !== scope) throw new Error("dispatch_lock_scope_changed");
      // The advisory lock serializes competing transactions for the same key;
      // unique (tenant_id, idempotency_key) remains the durable DB guarantee.
      const result = await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1::text, 0))",
        [scope]
      );
      if (result.rowCount !== 1) throw new Error("dispatch_lock_unconfirmed");
      lockScope = scope;
      return true;
    },

    async insertIntentOnce(intent) {
      const { tenantId, proposalId, reviewId, action, intentType, idempotencyKey } = intent ?? {};
      if (![tenantId, proposalId, reviewId, idempotencyKey].every(validId) ||
          !Object.hasOwn(INTENT_TYPES, action) || INTENT_TYPES[action] !== intentType) {
        throw new TypeError("invalid_dispatch_intent");
      }
      if (lockScope !== JSON.stringify([tenantId, idempotencyKey]) || admitted !== null) {
        throw new Error("dispatch_lock_or_insert_required");
      }
      const id = randomUUID();
      const inserted = await client.query(
        `insert into employee_dispatch_intents
          (id,tenant_id,proposal_id,review_id,action,intent_type,idempotency_key)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (tenant_id,idempotency_key) do nothing
         returning id`,
        [id, tenantId, proposalId, reviewId, action, intentType, idempotencyKey]
      );
      if (inserted.rowCount === 1) {
        admitted = { id: inserted.rows[0].id, tenantId, proposalId, reviewId, action,
          intentType, idempotencyKey, created: true, auditWritten: false };
        return { status: "created", sameIntent: true };
      }
      if (inserted.rowCount !== 0) throw new Error("invalid_dispatch_insert_result");
      const existing = await client.query(
        `select id,proposal_id,review_id,action,intent_type
         from employee_dispatch_intents
         where tenant_id=$1 and idempotency_key=$2`,
        [tenantId, idempotencyKey]
      );
      if (existing.rowCount !== 1) throw new Error("dispatch_idempotency_unconfirmed");
      const row = existing.rows[0];
      const sameIntent = row.proposal_id === proposalId && row.review_id === reviewId &&
        row.action === action && row.intent_type === intentType;
      if (sameIntent) {
        admitted = { id: row.id, tenantId, proposalId, reviewId, action,
          intentType, idempotencyKey, created: false, auditWritten: false };
      }
      return { status: "existing", sameIntent };
    },

    async appendAudit(event) {
      if (!admitted || admitted.auditWritten ||
          event?.type !== "employee.dispatch.admitted" ||
          !validId(event.actorId) ||
          event.tenantId !== admitted.tenantId ||
          event.proposalId !== admitted.proposalId ||
          event.reviewId !== admitted.reviewId ||
          event.action !== admitted.action ||
          event.idempotencyKey !== admitted.idempotencyKey ||
          event.created !== admitted.created) {
        throw new Error("invalid_dispatch_audit");
      }
      const result = await client.query(
        `insert into employee_dispatch_admission_audit
          (id,tenant_id,intent_id,actor_id,event_type,created)
         values ($1,$2,$3,$4,'employee.dispatch.admitted',$5)`,
        [randomUUID(), admitted.tenantId, admitted.id, event.actorId, admitted.created]
      );
      if (result.rowCount !== 1) throw new Error("dispatch_audit_unconfirmed");
      admitted.auditWritten = true;
      // The surrounding store.transaction must still COMMIT both writes.
      return true;
    }
  };
}
