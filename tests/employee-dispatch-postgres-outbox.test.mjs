import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";
import { createEmployeeDispatchPostgresTransactionStore } from "../server/employee-dispatch-postgres-transaction.js";
import { createEmployeeDispatchPostgresOutboxWriter } from "../server/employee-dispatch-postgres-outbox-writer.js";

// Never run these schema-draft tests on a nonlocal or persistent database.
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.EMPLOYEE_DISPATCH_PG_TEST_ONLY !== "true" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/employee_dispatch_ci") {
  throw new Error("refusing_non_ephemeral_postgres_database");
}

const validAction = "internal.task.create";
const seed = async (pool, tenantId, proposalId, reviewId) => {
  await pool.query(
    `insert into employee_dispatch_proposal_versions
      (tenant_id,proposal_id,revision,author_id,action,payload_digest)
     values ($1,$2,1,'author-1',$3,$4)`,
    [tenantId, proposalId, validAction, "a".repeat(64)]
  );
  await pool.query(
    "insert into employee_dispatch_proposal_heads (tenant_id,proposal_id,current_revision) values ($1,$2,1)",
    [tenantId, proposalId]
  );
  await pool.query(
    `insert into employee_dispatch_proposal_reviews
      (tenant_id,review_id,proposal_id,proposal_revision,reviewer_id,decision)
     values ($1,$2,$3,1,'reviewer-1','approved')`,
    [tenantId, reviewId, proposalId]
  );
};

test("disposable PostgreSQL dispatch: durable idempotency, tenant audit and rollback", async t => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
  const store = createEmployeeDispatchPostgresTransactionStore(
    pool, client => createEmployeeDispatchPostgresOutboxWriter(client)
  );
  const tenantA = "tenant-" + randomUUID();
  const tenantB = "tenant-" + randomUUID();
  const proposalA = "proposal-" + randomUUID();
  const proposalB = "proposal-" + randomUUID();
  const proposalOther = "proposal-" + randomUUID();
  const reviewA = "review-" + randomUUID();
  const reviewB = "review-" + randomUUID();
  const reviewOther = "review-" + randomUUID();

  const admit = async ({ tenantId, proposalId, reviewId, key, actorId = "dispatcher-1" }) =>
    store.transaction(async tx => {
      assert.equal(await tx.lockDispatchKey(tenantId, key), true);
      const result = await tx.insertIntentOnce({
        tenantId, proposalId, reviewId, action: validAction,
        intentType: "task", idempotencyKey: key
      });
      if (result.status === "existing" && result.sameIntent !== true) return result;
      assert.equal(await tx.appendAudit({
        type: "employee.dispatch.admitted", tenantId, proposalId, reviewId,
        action: validAction, idempotencyKey: key, actorId,
        created: result.status === "created"
      }), true);
      return result;
    });

  try {
    await seed(pool, tenantA, proposalA, reviewA);
    await seed(pool, tenantA, proposalB, reviewB);
    await seed(pool, tenantB, proposalOther, reviewOther);

    await t.test("same tenant/key replays only the identical immutable intent", async () => {
      const key = "same-" + randomUUID();
      assert.deepEqual(await admit({ tenantId: tenantA, proposalId: proposalA, reviewId: reviewA, key }),
        { status: "created", sameIntent: true });
      assert.deepEqual(await admit({ tenantId: tenantA, proposalId: proposalA, reviewId: reviewA, key }),
        { status: "existing", sameIntent: true });
      assert.deepEqual(await admit({ tenantId: tenantA, proposalId: proposalB, reviewId: reviewB, key }),
        { status: "existing", sameIntent: false });
      const intents = await pool.query(
        "select proposal_id from employee_dispatch_intents where tenant_id=$1 and idempotency_key=$2",
        [tenantA, key]
      );
      const audit = await pool.query(
        `select a.created from employee_dispatch_admission_audit a
         join employee_dispatch_intents i on i.id=a.intent_id and i.tenant_id=a.tenant_id
         where i.tenant_id=$1 and i.idempotency_key=$2 order by a.recorded_at`,
        [tenantA, key]
      );
      assert.equal(intents.rowCount, 1);
      assert.equal(intents.rows[0].proposal_id, proposalA);
      assert.equal(audit.rowCount, 2);
      assert.deepEqual(audit.rows.map(x => x.created).sort(), [false, true]);
    });

    await t.test("same idempotency key in another tenant is independent", async () => {
      const key = "tenant-key-" + randomUUID();
      assert.equal((await admit({ tenantId: tenantA, proposalId: proposalA, reviewId: reviewA, key })).status, "created");
      assert.equal((await admit({ tenantId: tenantB, proposalId: proposalOther, reviewId: reviewOther, key })).status, "created");
      const result = await pool.query("select tenant_id from employee_dispatch_intents where idempotency_key=$1", [key]);
      assert.deepEqual(result.rows.map(r => r.tenant_id).sort(), [tenantA, tenantB].sort());
    });

    await t.test("concurrent same-key admissions commit one intent and two audits", async () => {
      const key = "parallel-" + randomUUID();
      const args = { tenantId: tenantA, proposalId: proposalA, reviewId: reviewA, key };
      const results = await Promise.all([admit(args), admit(args)]);
      assert.deepEqual(results.map(r => r.status).sort(), ["created", "existing"]);
      const rows = await pool.query(
        "select count(*)::int as n from employee_dispatch_intents where tenant_id=$1 and idempotency_key=$2",
        [tenantA, key]
      );
      const audit = await pool.query(
        `select count(*)::int as n from employee_dispatch_admission_audit a
         join employee_dispatch_intents i on i.id=a.intent_id and i.tenant_id=a.tenant_id
         where i.tenant_id=$1 and i.idempotency_key=$2`,
        [tenantA, key]
      );
      assert.equal(rows.rows[0].n, 1);
      assert.equal(audit.rows[0].n, 2);
    });

    await t.test("audit validation failure rolls back the new intent", async () => {
      const key = "rollback-" + randomUUID();
      await assert.rejects(admit({ tenantId: tenantA, proposalId: proposalA,
        reviewId: reviewA, key, actorId: "invalid actor" }), /invalid_dispatch_audit/);
      const result = await pool.query(
        "select id from employee_dispatch_intents where tenant_id=$1 and idempotency_key=$2",
        [tenantA, key]
      );
      assert.equal(result.rowCount, 0);
    });

    await t.test("database rejects stale/revoked review and action mismatch", async () => {
      const direct = (key, tenantId, proposalId, reviewId, action = validAction, kind = "task") =>
        pool.query(`insert into employee_dispatch_intents
          (id,tenant_id,proposal_id,review_id,action,intent_type,idempotency_key)
          values ($1,$2,$3,$4,$5,$6,$7)`,
          [randomUUID(),tenantId,proposalId,reviewId,action,kind,key]);
      await assert.rejects(direct("wrong-" + randomUUID(), tenantB, proposalOther, reviewA),
        e => e.code === "23514");
      await assert.rejects(direct("action-" + randomUUID(), tenantA, proposalA, reviewA,
        "internal.report.draft", "report"), e => e.code === "23514");
      await pool.query("update employee_dispatch_proposal_heads set revoked=true where tenant_id=$1 and proposal_id=$2",
        [tenantA, proposalB]);
      await assert.rejects(direct("revoked-" + randomUUID(), tenantA, proposalB, reviewB),
        e => e.code === "23514");
    });

    await t.test("database prevents tampering with persisted intent/audit", async () => {
      const key = "immutable-" + randomUUID();
      await admit({ tenantId: tenantA, proposalId: proposalA, reviewId: reviewA, key });
      const intent = await pool.query("select id from employee_dispatch_intents where tenant_id=$1 and idempotency_key=$2",
        [tenantA,key]);
      const intentId = intent.rows[0].id;
      await assert.rejects(pool.query("delete from employee_dispatch_intents where id=$1",[intentId]),
        e => e.code === "23514");
      await assert.rejects(pool.query("update employee_dispatch_intents set state='pending' where id=$1",[intentId]),
        e => e.code === "23514");
      const audit = await pool.query("select id from employee_dispatch_admission_audit where intent_id=$1",[intentId]);
      await assert.rejects(pool.query("delete from employee_dispatch_admission_audit where id=$1",[audit.rows[0].id]),
        e => e.code === "23514");
      await assert.rejects(pool.query("update employee_dispatch_admission_audit set created=false where id=$1",[audit.rows[0].id]),
        e => e.code === "23514");
      await assert.rejects(pool.query(
        `insert into employee_dispatch_admission_audit
         (id,tenant_id,intent_id,actor_id,event_type,created)
         values ($1,$2,$3,'dispatcher-1','employee.dispatch.admitted',true)`,
        [randomUUID(),tenantB,intentId]),e=>e.code==="23503");
    });

    await t.test("writer never invents reviewer-authorization capability", async () => {
      const client = await pool.connect();
      try {
        const writer = createEmployeeDispatchPostgresOutboxWriter(client);
        assert.equal(writer.isAuthorizedReviewer, undefined);
        assert.equal(writer.getLatestReview, undefined);
        await assert.rejects(writer.insertIntentOnce({}), /invalid_dispatch_intent/);
      } finally { client.release(); }
    });
  } finally {
    // All tables exist only in the disposable GitHub Actions PostgreSQL service.
    // Immutable events and intents intentionally have no cleanup/delete path.
    await pool.end();
  }
});
