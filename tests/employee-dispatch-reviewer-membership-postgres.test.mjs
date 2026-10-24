import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";
import { createEmployeeDispatchPostgresTransactionStore } from "../server/employee-dispatch-postgres-transaction.js";
import { createEmployeeDispatchPostgresApprovalReader } from "../server/employee-dispatch-postgres-approval-reader.js";
import { createEmployeeReviewerMembershipEvidence } from "../server/employee-reviewer-membership-evidence.js";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.EMPLOYEE_DISPATCH_PG_TEST_ONLY !== "true" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/employee_dispatch_ci") {
  throw new Error("refusing_non_ephemeral_postgres_database");
}

test("real PostgreSQL reviewer membership evidence is tenant-scoped and revocation-safe", async t => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const tenant = randomUUID(), otherTenant = randomUUID(), reviewer = randomUUID();
  const proposalId = "p-" + randomUUID(), reviewId = "r-" + randomUUID();
  const store = createEmployeeDispatchPostgresTransactionStore(pool, client => ({
    ...createEmployeeDispatchPostgresApprovalReader(client),
    ...createEmployeeReviewerMembershipEvidence(client)
  }));
  try {
    await pool.query("insert into tenants(id,name) values ($1,'Reviewer test'),($2,'Other tenant')",
      [tenant, otherTenant]);
    await pool.query("insert into users(id,email) values ($1,$2)",
      [reviewer, "reviewer-" + randomUUID() + "@test.invalid"]);
    await pool.query(
      "insert into memberships(tenant_id,user_id,role,status) values ($1,$2,'reviewer','active'),($3,$2,'reviewer','active')",
      [tenant, reviewer, otherTenant]);
    await pool.query(
      `insert into employee_dispatch_proposal_versions
       (tenant_id,proposal_id,revision,author_id,action,payload_digest)
       values ($1,$2,1,'author-1','internal.task.create',$3)`,
      [tenant, proposalId, "a".repeat(64)]);
    await pool.query("insert into employee_dispatch_proposal_heads(tenant_id,proposal_id,current_revision) values ($1,$2,1)",
      [tenant, proposalId]);
    await pool.query(
      `insert into employee_dispatch_proposal_reviews
       (tenant_id,review_id,proposal_id,proposal_revision,reviewer_id,decision)
       values ($1,$2,$3,1,$4,'approved')`,
      [tenant, reviewId, proposalId, reviewer]);

    await t.test("requires a current approved review AND active matching membership", async () => {
      await store.transaction(async tx => {
        assert.ok(await tx.getProposal(tenant, proposalId));
        assert.equal(await tx.hasCurrentReviewerMembership(tenant, reviewer, proposalId, reviewId), true);
        assert.equal(await tx.hasCurrentReviewerMembership(otherTenant, reviewer, proposalId, reviewId), false);
        assert.equal(await tx.hasCurrentReviewerMembership(tenant, randomUUID(), proposalId, reviewId), false);
        assert.equal(await tx.hasCurrentReviewerMembership(tenant, reviewer, proposalId, "missing"), false);
        assert.equal(await tx.hasCurrentReviewerMembership("not-a-uuid", reviewer, proposalId, reviewId), false);
        assert.equal(tx.isAuthorizedReviewer, undefined);
      });
    });

    await t.test("membership status cannot change while reviewer evidence is locked", async () => {
      const holder = await pool.connect();
      const revoker = await pool.connect();
      try {
        await holder.query("BEGIN");
        const reader = createEmployeeDispatchPostgresApprovalReader(holder);
        const evidence = createEmployeeReviewerMembershipEvidence(holder);
        assert.ok(await reader.getProposal(tenant, proposalId));
        assert.equal(await evidence.hasCurrentReviewerMembership(tenant, reviewer, proposalId, reviewId), true);
        await revoker.query("BEGIN");
        try {
          await revoker.query("SET LOCAL lock_timeout = '300ms'");
          await assert.rejects(
            revoker.query("update memberships set status='inactive' where tenant_id=$1 and user_id=$2",
              [tenant, reviewer]),
            e => e.code === "55P03"
          );
        } finally {
          await revoker.query("ROLLBACK");
        }
      } finally {
        await holder.query("ROLLBACK");
        holder.release();
        revoker.release();
      }
    });

    await t.test("inactive membership fails closed after status change", async () => {
      await pool.query("update memberships set status='inactive' where tenant_id=$1 and user_id=$2",
        [tenant, reviewer]);
      await store.transaction(async tx => {
        assert.ok(await tx.getProposal(tenant, proposalId));
        assert.equal(await tx.hasCurrentReviewerMembership(tenant, reviewer, proposalId, reviewId), false);
      });
    });

    await t.test("revocation of the proposal also invalidates membership evidence", async () => {
      await pool.query("update memberships set status='active' where tenant_id=$1 and user_id=$2",
        [tenant, reviewer]);
      await pool.query("update employee_dispatch_proposal_heads set revoked=true where tenant_id=$1 and proposal_id=$2",
        [tenant, proposalId]);
      await store.transaction(async tx => {
        assert.equal(await tx.getProposal(tenant, proposalId), null);
        assert.equal(await tx.hasCurrentReviewerMembership(tenant, reviewer, proposalId, reviewId), false);
      });
    });
  } finally {
    await pool.end();
  }
});
