import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";
import { createEmployeeReviewerGrantIssuerDraft } from "../server/employee-reviewer-grant-issuer-draft.js";
import { createEmployeeReviewerGrantActivatorDraft } from "../server/employee-reviewer-grant-activator-draft.js";
import { createEmployeeReviewSessionWriterDraft } from "../server/employee-review-session-writer-draft.js";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.EMPLOYEE_DISPATCH_PG_TEST_ONLY !== "true" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.pathname !== "/employee_dispatch_ci") {
  throw new Error("refusing_non_ephemeral_postgres_database");
}

test("reviewer grants require two separately authenticated owners, atomic audit and terminal revocation", async t => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  const tenant = randomUUID(), otherTenant = randomUUID();
  const issuerId = randomUUID(), activatorId = randomUUID(), reviewerId = randomUUID();
  const issuerSession = randomUUID(), activatorSession = randomUUID(), reviewerSession = randomUUID();
  const resolver = (id, tenantId = tenant) => async () => ({ id, tenantId });
  const issuer = createEmployeeReviewerGrantIssuerDraft({
    pool, resolveAuthenticatedSession: resolver(issuerSession)
  });
  const activator = createEmployeeReviewerGrantActivatorDraft({
    pool, resolveAuthenticatedSession: resolver(activatorSession)
  });
  const reviewer = createEmployeeReviewSessionWriterDraft({
    pool, resolveAuthenticatedSession: resolver(reviewerSession)
  });
  const issue = id => issuer.issueDisabledGrant({ reviewerId: id });
  const activate = (service = activator, id = reviewerId) =>
    service.activateDisabledGrant({
      context: { body: { tenantId: otherTenant, role: "owner",
        issuerId: reviewerId, sessionId: issuerSession, enabled: true } },
      reviewerId: id
    });
  const addUser = async (id, role, session) => {
    await pool.query("insert into users(id,email) values ($1,$2)",
      [id, "draft-" + randomUUID() + "@example.invalid"]);
    await pool.query(
      "insert into memberships(tenant_id,user_id,role,status) values ($1,$2,$3,'active')",
      [tenant, id, role]);
    await pool.query(
      `insert into sessions(id,token_hash,user_id,tenant_id,csrf_token,expires_at,session_generation)
       values ($1,$2,$3,$4,'draft',now()+interval '1 day',0)`,
      [session,"draft-"+randomUUID(),id,tenant]);
  };
  try {
    await pool.query("insert into tenants(id,name) values ($1,'Batch tenant'),($2,'Other tenant')",
      [tenant, otherTenant]);
    await addUser(issuerId, "owner", issuerSession);
    await addUser(activatorId, "owner", activatorSession);
    await addUser(reviewerId, "reviewer", reviewerSession);

    await t.test("issue only disabled grant; raw unaudited activation fails COMMIT", async () => {
      assert.deepEqual(await issue(reviewerId), {
        issued: true, reason: "disabled_grant_created"
      });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `update employee_dispatch_reviewer_permission_grants
           set enabled=true where tenant_id=$1 and reviewer_user_id=$2`,
          [tenant,reviewerId]
        );
        await assert.rejects(client.query("COMMIT"), e=>e.code==="23514");
      } finally {
        await client.query("ROLLBACK").catch(()=>{});
        client.release();
      }
      const g = await pool.query(
        "select enabled from employee_dispatch_reviewer_permission_grants where tenant_id=$1 and reviewer_user_id=$2",
        [tenant,reviewerId]
      );
      assert.equal(g.rows[0].enabled,false);
    });

    await t.test("issuer, reviewer, wrong tenant and invalid session cannot activate", async () => {
      const sameOwner=createEmployeeReviewerGrantActivatorDraft({
        pool, resolveAuthenticatedSession: resolver(issuerSession)
      });
      const reviewerActor=createEmployeeReviewerGrantActivatorDraft({
        pool, resolveAuthenticatedSession: resolver(reviewerSession)
      });
      const otherTenantActor=createEmployeeReviewerGrantActivatorDraft({
        pool, resolveAuthenticatedSession: resolver(activatorSession, otherTenant)
      });
      const missing=createEmployeeReviewerGrantActivatorDraft({
        pool, resolveAuthenticatedSession: async () => null
      });
      assert.equal((await activate(sameOwner)).activated,false);
      assert.equal((await activate(reviewerActor)).activated,false);
      assert.equal((await activate(otherTenantActor)).activated,false);
      assert.equal((await activate(missing)).activated,false);
      assert.equal((await activate(activator,"malformed")).activated,false);
    });

    await t.test("revoked, expired or stale activator session and inactive owner deny", async () => {
      await pool.query("update sessions set revoked_at=now() where id=$1",[activatorSession]);
      assert.equal((await activate()).activated,false);
      await pool.query(
        "update sessions set revoked_at=null,expires_at=now()-interval '1 minute' where id=$1",
        [activatorSession]);
      assert.equal((await activate()).activated,false);
      await pool.query("update sessions set expires_at=now()+interval '1 day' where id=$1",
        [activatorSession]);
      await pool.query("update users set session_generation=1 where id=$1",[activatorId]);
      assert.equal((await activate()).activated,false);
      await pool.query("update sessions set session_generation=1 where id=$1",[activatorSession]);
      await pool.query("update memberships set role='manager' where tenant_id=$1 and user_id=$2",
        [tenant,activatorId]);
      assert.equal((await activate()).activated,false);
      await pool.query("update memberships set role='owner',status='active' where tenant_id=$1 and user_id=$2",
        [tenant,activatorId]);
    });

    await t.test("another active owner activates only with immutable session audit", async () => {
      assert.deepEqual(await activate(), { activated: true, reason: "grant_activated" });
      const rows=await pool.query(
        `select g.enabled,a.activated_by_user_id::text as actor,
          a.activation_session_id::text as session
         from employee_dispatch_reviewer_permission_grants g
         join employee_dispatch_grant_activation_audit a
           on a.tenant_id=g.tenant_id and a.reviewer_user_id=g.reviewer_user_id
          and a.permission=g.permission
         where g.tenant_id=$1 and g.reviewer_user_id=$2`,
        [tenant,reviewerId]
      );
      assert.deepEqual(rows.rows, [{enabled:true, actor:activatorId,session:activatorSession}]);
      assert.equal((await activate()).activated,false);
      await assert.rejects(
        pool.query("delete from employee_dispatch_grant_activation_audit where tenant_id=$1",
          [tenant]),
        e=>e.code==="23514"
      );
    });

    await t.test("approved review now has verified authenticated provenance", async () => {
      const proposalId="proposal-"+randomUUID();
      await pool.query(
        `insert into employee_dispatch_proposal_versions
         (tenant_id,proposal_id,revision,author_id,action,payload_digest)
         values ($1,$2,1,$3,'internal.task.create',$4)`,
        [tenant,proposalId,issuerId,"a".repeat(64)]);
      await pool.query(
        "insert into employee_dispatch_proposal_heads(tenant_id,proposal_id,current_revision) values ($1,$2,1)",
        [tenant,proposalId]
      );
      const result=await reviewer.recordReview({proposalId,decision:"approved"});
      assert.equal(result.recorded,true);
      const proof=await pool.query(
        `select p.session_id::text as session
         from employee_dispatch_review_session_provenance p
         where p.tenant_id=$1 and p.review_id=$2`,
        [tenant,result.reviewId]
      );
      assert.equal(proof.rows[0].session,reviewerSession);
    });

    await t.test("disable without revocation denied; revoked grant cannot be restored", async () => {
      await assert.rejects(
        pool.query("update employee_dispatch_reviewer_permission_grants set enabled=false where tenant_id=$1 and reviewer_user_id=$2",
          [tenant,reviewerId]),
        e=>e.code==="23514"
      );
      await pool.query(
        `update employee_dispatch_reviewer_permission_grants
         set enabled=false,revoked_at=now() where tenant_id=$1 and reviewer_user_id=$2`,
        [tenant,reviewerId]
      );
      assert.equal((await activate()).activated,false);
      await assert.rejects(
        pool.query(
          "update employee_dispatch_reviewer_permission_grants set enabled=true,revoked_at=null where tenant_id=$1 and reviewer_user_id=$2",
          [tenant,reviewerId]),
        e=>e.code==="23514"
      );
    });
  } finally {
    await pool.end();
  }
});
