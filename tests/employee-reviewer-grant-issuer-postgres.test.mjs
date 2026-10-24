import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";
import { createEmployeeReviewerGrantIssuerDraft } from "../server/employee-reviewer-grant-issuer-draft.js";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.EMPLOYEE_DISPATCH_PG_TEST_ONLY !== "true" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/employee_dispatch_ci") {
  throw new Error("refusing_non_ephemeral_postgres_database");
}

test("a session-bound owner can only issue an audited, disabled reviewer grant", async t => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const tenant = randomUUID(), otherTenant = randomUUID();
  const owner = randomUUID(), reviewer = randomUUID();
  const sessionId = randomUUID();
  const trusted = { id: sessionId, tenantId: tenant };
  const issuer = createEmployeeReviewerGrantIssuerDraft({
    pool, resolveAuthenticatedSession: async () => trusted
  });

  const newUser = async id => {
    await pool.query(
      "insert into users(id,email) values ($1,$2)",
      [id, "test-" + randomUUID() + "@example.invalid"]
    );
  };
  const addReviewer = async () => {
    const id = randomUUID();
    await newUser(id);
    await pool.query(
      "insert into memberships(tenant_id,user_id,role,status) values ($1,$2,'reviewer','active')",
      [tenant,id]
    );
    return id;
  };

  try {
    await pool.query("insert into tenants(id,name) values ($1,'Issuance tenant'),($2,'Other')",
      [tenant,otherTenant]);
    await newUser(owner);
    await newUser(reviewer);
    await pool.query(
      `insert into memberships(tenant_id,user_id,role,status)
       values ($1,$2,'owner','active'),($1,$3,'reviewer','active')`,
      [tenant,owner,reviewer]
    );
    await pool.query(
      `insert into sessions
         (id,token_hash,user_id,tenant_id,csrf_token,expires_at,session_generation)
       values ($1,$2,$3,$4,'test-csrf',now()+interval '1 day',0)`,
      [sessionId,"test-"+randomUUID(),owner,tenant]
    );

    await t.test("issuer identity is DB-derived, not taken from request JSON",async () => {
      const result = await issuer.issueDisabledGrant({
        context: { body: { tenantId: otherTenant, issuerUserId: reviewer,
          role: "owner", enabled: true } }, reviewerId: reviewer
      });
      assert.deepEqual(result,{ issued:true,reason:"disabled_grant_created" });
      const row=await pool.query(
        `select g.enabled,g.granted_by_user_id::text as issuer,
          a.issuer_session_id::text as session_id,a.issuer_user_id::text as audit_issuer
         from employee_dispatch_reviewer_permission_grants g
         join employee_dispatch_grant_issuance_audit a
           on a.tenant_id=g.tenant_id
          and a.reviewer_user_id=g.reviewer_user_id and a.permission=g.permission
         where g.tenant_id=$1 and g.reviewer_user_id=$2`,
        [tenant,reviewer]
      );
      assert.equal(row.rowCount,1);
      assert.deepEqual(row.rows[0],{
        enabled:false,issuer:owner,session_id:sessionId,audit_issuer:owner
      });
    });

    await t.test("self-issuance and duplicate issuance deny with no second audit",async () => {
      assert.deepEqual(await issuer.issueDisabledGrant({reviewerId:owner}),
        { issued:false,reason:"forbidden" });
      const repeated=await issuer.issueDisabledGrant({reviewerId:reviewer});
      assert.equal(repeated.issued,false);
      const count=await pool.query(
        "select count(*)::int as n from employee_dispatch_grant_issuance_audit where tenant_id=$1",
        [tenant]
      );
      assert.equal(count.rows[0].n,1);
    });

    await t.test("invalid/missing trusted session fails closed",async () => {
      const target = await addReviewer();
      const unauthenticated=createEmployeeReviewerGrantIssuerDraft({
        pool,resolveAuthenticatedSession:async () => null
      });
      const invalid=createEmployeeReviewerGrantIssuerDraft({
        pool,resolveAuthenticatedSession:async () => ({id:"spoofed",tenantId:tenant})
      });
      assert.deepEqual(await unauthenticated.issueDisabledGrant({reviewerId:target}),
        {issued:false,reason:"unauthenticated"});
      assert.deepEqual(await invalid.issueDisabledGrant({reviewerId:target}),
        {issued:false,reason:"unauthenticated"});
      assert.equal((await issuer.issueDisabledGrant({reviewerId:"invalid-id"})).issued,false);
      const count=await pool.query(
        "select count(*)::int as n from employee_dispatch_reviewer_permission_grants where tenant_id=$1 and reviewer_user_id=$2",
        [tenant,target]
      );
      assert.equal(count.rows[0].n,0);
    });

    await t.test("cross-tenant session scope and expired session are denied",async () => {
      const target=await addReviewer();
      const wrong=createEmployeeReviewerGrantIssuerDraft({
        pool,resolveAuthenticatedSession:async () => ({id:sessionId,tenantId:otherTenant})
      });
      assert.equal((await wrong.issueDisabledGrant({reviewerId:target})).issued,false);
      await pool.query("update sessions set expires_at=now()-interval '1 minute' where id=$1",
        [sessionId]);
      assert.equal((await issuer.issueDisabledGrant({reviewerId:target})).issued,false);
      await pool.query("update sessions set expires_at=now()+interval '1 day' where id=$1",
        [sessionId]);
    });

    await t.test("revoked session, generation mismatch, and owner downgrade deny",async () => {
      const target=await addReviewer();
      await pool.query("update sessions set revoked_at=now() where id=$1",[sessionId]);
      assert.equal((await issuer.issueDisabledGrant({reviewerId:target})).issued,false);
      await pool.query("update sessions set revoked_at=null where id=$1",[sessionId]);
      await pool.query("update users set session_generation=session_generation+1 where id=$1",[owner]);
      assert.equal((await issuer.issueDisabledGrant({reviewerId:target})).issued,false);
      await pool.query("update sessions set session_generation=1 where id=$1",[sessionId]);
      await pool.query("update memberships set role='manager' where tenant_id=$1 and user_id=$2",
        [tenant,owner]);
      assert.equal((await issuer.issueDisabledGrant({reviewerId:target})).issued,false);
      await pool.query("update memberships set role='owner' where tenant_id=$1 and user_id=$2",
        [tenant,owner]);
    });

    await t.test("failure to append audit rolls back disabled grant creation",async () => {
      const target=await addReviewer();
      await pool.query(
        `create function employee_dispatch_test_reject_audit() returns trigger
         language plpgsql as $audit_test$
         begin raise exception 'simulated_audit_failure' using errcode='23514'; end;
         $audit_test$`
      );
      await pool.query(
        `create trigger employee_dispatch_test_audit_failure
         before insert on employee_dispatch_grant_issuance_audit
         for each row execute function employee_dispatch_test_reject_audit()`
      );
      try {
        const result=await issuer.issueDisabledGrant({reviewerId:target});
        assert.deepEqual(result,{issued:false,reason:"governance_unavailable"});
        const check=await pool.query(
          "select 1 from employee_dispatch_reviewer_permission_grants where tenant_id=$1 and reviewer_user_id=$2",
          [tenant,target]
        );
        assert.equal(check.rowCount,0);
      } finally {
        await pool.query("drop trigger employee_dispatch_test_audit_failure on employee_dispatch_grant_issuance_audit");
        await pool.query("drop function employee_dispatch_test_reject_audit()");
      }
    });

    await t.test("issuance audit cannot be edited or deleted",async () => {
      await assert.rejects(
        pool.query("delete from employee_dispatch_grant_issuance_audit where tenant_id=$1",[tenant]),
        e=>e.code==="23514"
      );
      await assert.rejects(
        pool.query(
          "update employee_dispatch_grant_issuance_audit set event_type=event_type where tenant_id=$1",
          [tenant]
        ),
        e=>e.code==="23514"
      );
    });
  } finally {
    await pool.end();
  }
});
