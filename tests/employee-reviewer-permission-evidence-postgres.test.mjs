import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";
import { createEmployeeDispatchPostgresTransactionStore } from "../server/employee-dispatch-postgres-transaction.js";
import { createEmployeeDispatchPostgresApprovalReader } from "../server/employee-dispatch-postgres-approval-reader.js";
import { createEmployeeReviewerPermissionEvidence } from "../server/employee-reviewer-permission-evidence.js";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.EMPLOYEE_DISPATCH_PG_TEST_ONLY !== "true" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.pathname !== "/employee_dispatch_ci") {
  throw new Error("refusing_non_ephemeral_postgres_database");
}

test("explicit approval-grant evidence is tenant-scoped, revocable and transaction-locked", async t => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const tenant = randomUUID(), otherTenant = randomUUID();
  const reviewer = randomUUID(), issuer = randomUUID();
  const proposal = "p-" + randomUUID(), review = "r-" + randomUUID();
  const store = createEmployeeDispatchPostgresTransactionStore(pool, client => ({
    ...createEmployeeDispatchPostgresApprovalReader(client),
    ...createEmployeeReviewerPermissionEvidence(client)
  }));
  const read = () => store.transaction(async tx => {
    assert.ok(await tx.getProposal(tenant, proposal));
    assert.equal(tx.isAuthorizedReviewer, undefined);
    return tx.hasExplicitApprovalGrant(tenant, reviewer, proposal, review);
  });
  try {
    await pool.query("insert into tenants(id,name) values ($1,'Test tenant'),($2,'Other tenant')",
      [tenant, otherTenant]);
    await pool.query("insert into users(id,email) values ($1,$2),($3,$4)",
      [reviewer,"reviewer-"+randomUUID()+"@example.invalid",issuer,"issuer-"+randomUUID()+"@example.invalid"]);
    await pool.query(
      `insert into memberships(tenant_id,user_id,role,status)
       values ($1,$2,'reviewer','active'),($1,$3,'owner','active'),($4,$2,'reviewer','active')`,
      [tenant,reviewer,issuer,otherTenant]);
    await pool.query(
      `insert into employee_dispatch_proposal_versions
       (tenant_id,proposal_id,revision,author_id,action,payload_digest)
       values ($1,$2,1,'original-author','internal.task.create',$3),
              ($1,$2,2,'original-author','internal.task.create',$4)`,
      [tenant,proposal,"a".repeat(64),"b".repeat(64)]);
    await pool.query(
      "insert into employee_dispatch_proposal_heads(tenant_id,proposal_id,current_revision) values ($1,$2,1)",
      [tenant,proposal]);
    await pool.query(
      `insert into employee_dispatch_proposal_reviews
       (tenant_id,review_id,proposal_id,proposal_revision,reviewer_id,decision)
       values ($1,$2,$3,1,$4,'approved')`,[tenant,review,proposal,reviewer]);
    await pool.query(
      `insert into employee_dispatch_reviewer_permission_grants
       (tenant_id,reviewer_user_id,permission,granted_by_user_id)
       values ($1,$2,'people.workflow.approve',$3)`,
      [tenant,reviewer,issuer]);

    await t.test("absent and disabled permissions deny even active reviewers",async () => {
      assert.equal(await read(),false);
      await pool.query(
        "update employee_dispatch_reviewer_permission_grants set enabled=true where tenant_id=$1 and reviewer_user_id=$2",
        [tenant,reviewer]);
      assert.equal(await read(),true);
    });

    await t.test("wrong tenant, wrong user, invalid IDs and unrelated review fail",async () => {
      await store.transaction(async tx => {
        assert.ok(await tx.getProposal(tenant,proposal));
        assert.equal(await tx.hasExplicitApprovalGrant(otherTenant,reviewer,proposal,review),false);
        assert.equal(await tx.hasExplicitApprovalGrant(tenant,issuer,proposal,review),false);
        assert.equal(await tx.hasExplicitApprovalGrant(tenant,reviewer,proposal,"missing"),false);
        assert.equal(await tx.hasExplicitApprovalGrant("bad-tenant",reviewer,proposal,review),false);
      });
    });

    await t.test("disabled grant and inactive membership deny reviewer evidence",async () => {
      await pool.query(
        "update employee_dispatch_reviewer_permission_grants set enabled=false where tenant_id=$1 and reviewer_user_id=$2",
        [tenant,reviewer]);
      assert.equal(await read(),false);
      await pool.query(
        "update employee_dispatch_reviewer_permission_grants set enabled=true where tenant_id=$1 and reviewer_user_id=$2",
        [tenant,reviewer]);
      await pool.query(
        "update memberships set status='inactive' where tenant_id=$1 and user_id=$2",
        [tenant,reviewer]);
      assert.equal(await read(),false);
      await pool.query(
        "update memberships set status='active',role='auditor' where tenant_id=$1 and user_id=$2",
        [tenant,reviewer]);
      assert.equal(await read(),false);
      await pool.query(
        "update memberships set role='reviewer' where tenant_id=$1 and user_id=$2",
        [tenant,reviewer]);
      assert.equal(await read(),true);
    });

    await t.test("shared permission lock blocks concurrent revocation until transaction ends",async () => {
      const holder=await pool.connect(),writer=await pool.connect();
      try {
        await holder.query("BEGIN");
        const reader=createEmployeeDispatchPostgresApprovalReader(holder);
        const evidence=createEmployeeReviewerPermissionEvidence(holder);
        assert.ok(await reader.getProposal(tenant,proposal));
        assert.equal(await evidence.hasExplicitApprovalGrant(tenant,reviewer,proposal,review),true);
        await writer.query("BEGIN");
        try {
          await writer.query("SET LOCAL lock_timeout='300ms'");
          await assert.rejects(
            writer.query(
              "update employee_dispatch_reviewer_permission_grants set enabled=false where tenant_id=$1 and reviewer_user_id=$2",
              [tenant,reviewer]
            ),e=>e.code==="55P03");
        } finally { await writer.query("ROLLBACK"); }
      } finally { await holder.query("ROLLBACK"); holder.release(); writer.release(); }
    });

    await t.test("revised or revoked proposal makes permission evidence insufficient",async () => {
      await pool.query(
        "update employee_dispatch_proposal_heads set current_revision=2 where tenant_id=$1 and proposal_id=$2",
        [tenant,proposal]);
      await store.transaction(async tx => {
        assert.ok(await tx.getProposal(tenant,proposal));
        assert.equal(await tx.hasExplicitApprovalGrant(tenant,reviewer,proposal,review),false);
      });
      await pool.query(
        "update employee_dispatch_proposal_heads set revoked=true where tenant_id=$1 and proposal_id=$2",
        [tenant,proposal]);
      await store.transaction(async tx => {
        assert.equal(await tx.getProposal(tenant,proposal),null);
        assert.equal(await tx.hasExplicitApprovalGrant(tenant,reviewer,proposal,review),false);
      });
    });
    await t.test("grant issuer is immutable and terminal revocation cannot be undone",async () => {
      await assert.rejects(
        pool.query(
          "update employee_dispatch_reviewer_permission_grants set granted_by_user_id=$3 where tenant_id=$1 and reviewer_user_id=$2",
          [tenant,reviewer,reviewer]
        ),
        e=>e.code==="23514"
      );
      await pool.query(
        "update employee_dispatch_reviewer_permission_grants set enabled=false,revoked_at=now() where tenant_id=$1 and reviewer_user_id=$2",
        [tenant,reviewer]
      );
      await assert.rejects(
        pool.query(
          "update employee_dispatch_reviewer_permission_grants set enabled=true,revoked_at=null where tenant_id=$1 and reviewer_user_id=$2",
          [tenant,reviewer]
        ),
        e=>e.code==="23514"
      );
      const record=await pool.query(
        "select enabled,revoked_at from employee_dispatch_reviewer_permission_grants where tenant_id=$1 and reviewer_user_id=$2",
        [tenant,reviewer]
      );
      assert.equal(record.rows[0].enabled,false);
      assert.ok(record.rows[0].revoked_at);
    });
  } finally {
    // The test database and draft records are disposable by design.
    await pool.end();
  }
});
