import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";
import { createEmployeeDispatchPostgresApprovalReader } from "../server/employee-dispatch-postgres-approval-reader.js";
import { createEmployeeDispatchPostgresTransactionStore } from "../server/employee-dispatch-postgres-transaction.js";

// This suite applies only to a disposable CI PostgreSQL database. Never use
// a production DB URL or a shared development database for this design draft.
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.EMPLOYEE_DISPATCH_PG_TEST_ONLY !== "true" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/employee_dispatch_ci") {
  throw new Error("refusing_non_ephemeral_postgres_database");
}

test("draft employee proposal schema: real PostgreSQL isolation, revision and row locks", async t => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const store = createEmployeeDispatchPostgresTransactionStore(
    pool, client => createEmployeeDispatchPostgresApprovalReader(client)
  );
  const tenant = "tenant-" + randomUUID();
  const otherTenant = "tenant-" + randomUUID();
  const proposalId = "proposal-" + randomUUID();
  const reviewId = "review-" + randomUUID();
  const secondReviewId = "review-" + randomUUID();
  try {
    await pool.query(
      "insert into employee_dispatch_proposal_versions (tenant_id,proposal_id,revision,author_id,action,payload_digest) values ($1,$2,1,'author-1','internal.task.create',$3),($1,$2,2,'author-1','internal.task.create',$4)",
      [tenant, proposalId, "a".repeat(64), "b".repeat(64)]
    );
    await pool.query(
      "insert into employee_dispatch_proposal_versions (tenant_id,proposal_id,revision,author_id,action,payload_digest) values ($1,$2,1,'author-other','internal.report.draft',$3)",
      [otherTenant, proposalId, "c".repeat(64)]
    );
    await pool.query(
      "insert into employee_dispatch_proposal_heads (tenant_id,proposal_id,current_revision) values ($1,$3,1),($2,$3,1)",
      [tenant, otherTenant, proposalId]
    );
    await pool.query(
      "insert into employee_dispatch_proposal_reviews (tenant_id,review_id,proposal_id,proposal_revision,reviewer_id,decision) values ($1,$2,$3,1,'reviewer-1','approved')",
      [tenant, reviewId, proposalId]
    );

    await t.test("tenant-scoped approved review and proposal are read under the head lock", async () => {
      await store.transaction(async reader => {
        assert.deepEqual(await reader.getProposal(tenant, proposalId), {
          id: proposalId, tenantId: tenant,
          authorId: "author-1", action: "internal.task.create"
        });
        assert.equal((await reader.getLatestReview(tenant, proposalId))?.id, reviewId);
        assert.equal(await reader.isCurrentApprovedReview(tenant, proposalId, reviewId), true);
        assert.equal(await reader.isCurrentProposalRevision(tenant, proposalId, reviewId), true);
      });
    });

    await t.test("one tenant cannot read another tenant's review", async () => {
      await store.transaction(async reader => {
        assert.equal((await reader.getProposal(otherTenant, proposalId))?.authorId, "author-other");
        assert.equal(await reader.getLatestReview(otherTenant, proposalId), null);
      });
      const absent = await store.transaction(reader => reader.getProposal("absent-tenant", proposalId));
      assert.equal(absent, null);
    });

    await t.test("database rejects cross-tenant proposal foreign keys", async () => {
      await assert.rejects(
        pool.query(
          "insert into employee_dispatch_proposal_reviews (tenant_id,review_id,proposal_id,proposal_revision,reviewer_id,decision) values ($1,$2,$3,2,'reviewer-other','approved')",
          [otherTenant, "forged-" + randomUUID(), proposalId]
        ),
        error => error.code === "23503"
      );
    });

    await t.test("locked current head prevents racing revision update", async () => {
      const holder = await pool.connect();
      const writer = await pool.connect();
      try {
        await holder.query("BEGIN");
        const reader = createEmployeeDispatchPostgresApprovalReader(holder);
        assert.ok(await reader.getProposal(tenant, proposalId));
        await writer.query("BEGIN");
        try {
          await writer.query("SET LOCAL lock_timeout = '300ms'");
          await assert.rejects(
            writer.query("update employee_dispatch_proposal_heads set current_revision=2 where tenant_id=$1 and proposal_id=$2", [tenant, proposalId]),
            error => error.code === "55P03"
          );
        } finally {
          await writer.query("ROLLBACK");
        }
      } finally {
        await holder.query("ROLLBACK");
        holder.release();
        writer.release();
      }
    });

    await t.test("equal-timestamp revocation cannot be displaced by approval ID sorting", async () => {
      const tiedRevocationId = "a-revoked-" + randomUUID();
      await pool.query(
        `insert into employee_dispatch_proposal_reviews
          (tenant_id,review_id,proposal_id,proposal_revision,reviewer_id,decision,reviewed_at)
         select tenant_id,$2,proposal_id,proposal_revision,'reviewer-2','revoked',reviewed_at
         from employee_dispatch_proposal_reviews
         where tenant_id=$1 and review_id=$3`,
        [tenant, tiedRevocationId, reviewId]
      );
      try {
        await store.transaction(async reader => {
          assert.ok(await reader.getProposal(tenant, proposalId));
          assert.equal(await reader.getLatestReview(tenant, proposalId), null);
          assert.equal(await reader.isCurrentApprovedReview(tenant, proposalId, reviewId), false);
          assert.equal(await reader.isCurrentProposalRevision(tenant, proposalId, reviewId), true);
        });
      } finally {
        await pool.query(
          "delete from employee_dispatch_proposal_reviews where tenant_id=$1 and review_id=$2",
          [tenant, tiedRevocationId]
        );
      }
      await store.transaction(async reader => {
        assert.ok(await reader.getProposal(tenant, proposalId));
        assert.equal((await reader.getLatestReview(tenant, proposalId))?.id, reviewId);
        assert.equal(await reader.isCurrentApprovedReview(tenant, proposalId, reviewId), true);
      });
    });

    await t.test("revision change makes previously approved review stale", async () => {
      await pool.query(
        "update employee_dispatch_proposal_heads set current_revision=2 where tenant_id=$1 and proposal_id=$2",
        [tenant, proposalId]
      );
      await store.transaction(async reader => {
        assert.ok(await reader.getProposal(tenant, proposalId));
        assert.equal(await reader.getLatestReview(tenant, proposalId), null);
        assert.equal(await reader.isCurrentApprovedReview(tenant, proposalId, reviewId), false);
        assert.equal(await reader.isCurrentProposalRevision(tenant, proposalId, reviewId), false);
      });
    });

    await t.test("new review matches new current revision; revoked proposal is denied", async () => {
      await pool.query(
        "insert into employee_dispatch_proposal_reviews (tenant_id,review_id,proposal_id,proposal_revision,reviewer_id,decision) values ($1,$2,$3,2,'reviewer-2','approved')",
        [tenant, secondReviewId, proposalId]
      );
      await store.transaction(async reader => {
        assert.ok(await reader.getProposal(tenant, proposalId));
        assert.equal((await reader.getLatestReview(tenant, proposalId))?.id, secondReviewId);
        assert.equal(await reader.isCurrentApprovedReview(tenant, proposalId, secondReviewId), true);
      });
      await pool.query(
        "update employee_dispatch_proposal_heads set revoked=true where tenant_id=$1 and proposal_id=$2",
        [tenant, proposalId]
      );
      assert.equal(await store.transaction(reader => reader.getProposal(tenant, proposalId)), null);
    });
  } finally {
    await pool.query(
      "delete from employee_dispatch_proposal_reviews where tenant_id=$1 or tenant_id=$2",
      [tenant, otherTenant]
    ).catch(() => {});
    await pool.query(
      "delete from employee_dispatch_proposal_heads where tenant_id=$1 or tenant_id=$2",
      [tenant, otherTenant]
    ).catch(() => {});
    await pool.query(
      "delete from employee_dispatch_proposal_versions where tenant_id=$1 or tenant_id=$2",
      [tenant, otherTenant]
    ).catch(() => {});
    await pool.end();
  }
});
