import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";
import { createEmployeeReviewSessionWriterDraft } from "../server/employee-review-session-writer-draft.js";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.EMPLOYEE_DISPATCH_PG_TEST_ONLY !== "true" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/employee_dispatch_ci") {
  throw new Error("refusing_non_ephemeral_postgres_database");
}

test("draft review session provenance is atomic, tenant-bound and current", async t => {
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:4});
  const tenant=randomUUID(),otherTenant=randomUUID();
  const reviewer=randomUUID(),owner=randomUUID(),sessionId=randomUUID();
  const proposalId="proposal-"+randomUUID();
  const auth={id:sessionId,tenantId:tenant};
  const writer=createEmployeeReviewSessionWriterDraft({
    pool,resolveAuthenticatedSession:async () => auth
  });
  const source=(id)=>"person-"+id+"@example.invalid";
  try {
    await pool.query("insert into tenants(id,name) values ($1,'Review tenant'),($2,'Other tenant')",
      [tenant,otherTenant]);
    await pool.query("insert into users(id,email) values ($1,$2),($3,$4)",
      [reviewer,source(reviewer),owner,source(owner)]);
    await pool.query(
      `insert into memberships(tenant_id,user_id,role,status)
       values ($1,$2,'reviewer','active'),($1,$3,'owner','active')`,
      [tenant,reviewer,owner]);
    await pool.query(
      `insert into sessions(id,token_hash,user_id,tenant_id,csrf_token,expires_at,session_generation)
       values ($1,$2,$3,$4,'test-csrf',now()+interval '1 day',0)`,
      [sessionId,"test-"+randomUUID(),reviewer,tenant]);
    await pool.query(
      `insert into employee_dispatch_reviewer_permission_grants
        (tenant_id,reviewer_user_id,permission,granted_by_user_id)
       values ($1,$2,'people.workflow.approve',$3)`,[tenant,reviewer,owner]);
    await pool.query(
      "update employee_dispatch_reviewer_permission_grants set enabled=true where tenant_id=$1 and reviewer_user_id=$2",
      [tenant,reviewer]);
    await pool.query(
      `insert into employee_dispatch_proposal_versions
        (tenant_id,proposal_id,revision,author_id,action,payload_digest)
       values ($1,$2,1,'original-author','internal.task.create',$3)`,
      [tenant,proposalId,"a".repeat(64)]);
    await pool.query(
      "insert into employee_dispatch_proposal_heads(tenant_id,proposal_id,current_revision) values ($1,$2,1)",
      [tenant,proposalId]);

    await t.test("verified server session writes immutable review and provenance together",async () => {
      const result=await writer.recordReview({
        context:{body:{tenantId:otherTenant,actorId:owner,reviewerId:owner,permission:"people.workflow.approve"}},
        proposalId,decision:"approved"
      });
      assert.equal(result.recorded,true);
      assert.match(result.reviewId,/^[0-9a-f-]{36}$/);
      const rows=await pool.query(
        `select r.reviewer_id,r.decision,r.review_sequence::text as seq,
                p.session_id::text as session_id,p.reviewer_user_id::text as auth_reviewer
         from employee_dispatch_proposal_reviews r
         join employee_dispatch_review_session_provenance p
           on p.tenant_id=r.tenant_id and p.review_id=r.review_id
         where r.tenant_id=$1 and r.review_id=$2`,
        [tenant,result.reviewId]
      );
      assert.deepEqual(rows.rows,[{
        reviewer_id:reviewer,decision:"approved",seq:"1",
        session_id:sessionId,auth_reviewer:reviewer
      }]);
      await assert.rejects(
        pool.query("update employee_dispatch_review_session_provenance set session_id=$2 where review_id=$1",
          [result.reviewId,sessionId]),e=>e.code==="23514");
    });

    await t.test("direct SQL review without provenance is rejected at commit",async () => {
      const client=await pool.connect();
      const unverified="unverified-"+randomUUID();
      try {
        await client.query("BEGIN");
        await client.query(
          `insert into employee_dispatch_proposal_reviews
            (tenant_id,review_id,proposal_id,proposal_revision,reviewer_id,decision)
           values ($1,$2,$3,1,$4,'approved')`,
          [tenant,unverified,proposalId,reviewer]);
        await assert.rejects(client.query("COMMIT"),e=>e.code==="23514");
      } finally {await client.query("ROLLBACK").catch(()=>{});client.release();}
      const check=await pool.query(
        "select 1 from employee_dispatch_proposal_reviews where tenant_id=$1 and review_id=$2",
        [tenant,unverified]);
      assert.equal(check.rowCount,0);
    });

    await t.test("missing session, wrong tenant, expired or revoked session deny review",async () => {
      const wrong=createEmployeeReviewSessionWriterDraft({
        pool,resolveAuthenticatedSession:async () => ({id:sessionId,tenantId:otherTenant})
      });
      assert.equal((await wrong.recordReview({proposalId,decision:"approved"})).recorded,false);
      const unauthenticated=createEmployeeReviewSessionWriterDraft({
        pool,resolveAuthenticatedSession:async () => null
      });
      assert.equal((await unauthenticated.recordReview({proposalId,decision:"approved"})).recorded,false);
      await pool.query("update sessions set expires_at=now()-interval '1 minute' where id=$1",
        [sessionId]);
      assert.equal((await writer.recordReview({proposalId,decision:"approved"})).recorded,false);
      await pool.query("update sessions set expires_at=now()+interval '1 day',revoked_at=now() where id=$1",
        [sessionId]);
      assert.equal((await writer.recordReview({proposalId,decision:"approved"})).recorded,false);
      await pool.query("update sessions set revoked_at=null where id=$1",[sessionId]);
    });

    await t.test("inactive membership, revoked permission and stale session generation deny",async () => {
      await pool.query("update memberships set status='inactive' where tenant_id=$1 and user_id=$2",
        [tenant,reviewer]);
      assert.equal((await writer.recordReview({proposalId,decision:"rejected"})).recorded,false);
      await pool.query("update memberships set status='active' where tenant_id=$1 and user_id=$2",
        [tenant,reviewer]);
      await pool.query("update employee_dispatch_reviewer_permission_grants set enabled=false where tenant_id=$1 and reviewer_user_id=$2",
        [tenant,reviewer]);
      assert.equal((await writer.recordReview({proposalId,decision:"rejected"})).recorded,false);
      await pool.query("update employee_dispatch_reviewer_permission_grants set enabled=true where tenant_id=$1 and reviewer_user_id=$2",
        [tenant,reviewer]);
      await pool.query("update users set session_generation=session_generation+1 where id=$1",
        [reviewer]);
      assert.equal((await writer.recordReview({proposalId,decision:"rejected"})).recorded,false);
      await pool.query("update sessions set session_generation=1 where id=$1",[sessionId]);
    });

    await t.test("proposal author and revoked proposal cannot be approved",async () => {
      const selfProposal="self-"+randomUUID();
      await pool.query(
        `insert into employee_dispatch_proposal_versions
          (tenant_id,proposal_id,revision,author_id,action,payload_digest)
         values ($1,$2,1,$3,'internal.task.create',$4)`,
        [tenant,selfProposal,reviewer,"b".repeat(64)]);
      await pool.query(
        "insert into employee_dispatch_proposal_heads(tenant_id,proposal_id,current_revision) values ($1,$2,1)",
        [tenant,selfProposal]);
      assert.equal((await writer.recordReview({proposalId:selfProposal,decision:"approved"})).recorded,false);
      await pool.query(
        "update employee_dispatch_proposal_heads set revoked=true where tenant_id=$1 and proposal_id=$2",
        [tenant,proposalId]);
      assert.equal((await writer.recordReview({proposalId,decision:"approved"})).recorded,false);
    });

    await t.test("failing provenance insert rolls back decision and review sequence",async () => {
      const rollbackProposal="rollback-"+randomUUID();
      await pool.query(
        `insert into employee_dispatch_proposal_versions
          (tenant_id,proposal_id,revision,author_id,action,payload_digest)
         values ($1,$2,1,'original-author','internal.task.create',$3)`,
        [tenant,rollbackProposal,"c".repeat(64)]);
      await pool.query(
        "insert into employee_dispatch_proposal_heads(tenant_id,proposal_id,current_revision) values ($1,$2,1)",
        [tenant,rollbackProposal]);
      await pool.query(
        `create function employee_dispatch_test_fail_provenance()
         returns trigger language plpgsql as $test$
         begin raise exception 'provenance_unavailable' using errcode='23514'; end;
         $test$`);
      await pool.query(
        `create trigger employee_dispatch_test_fail_provenance_insert
         before insert on employee_dispatch_review_session_provenance
         for each row execute function employee_dispatch_test_fail_provenance()`);
      try {
        assert.equal((await writer.recordReview({proposalId:rollbackProposal,decision:"approved"})).recorded,false);
        const heads=await pool.query(
          "select last_review_sequence::text as seq from employee_dispatch_proposal_heads where tenant_id=$1 and proposal_id=$2",
          [tenant,rollbackProposal]);
        assert.equal(heads.rows[0].seq,"0");
      } finally {
        await pool.query(
          "drop trigger employee_dispatch_test_fail_provenance_insert on employee_dispatch_review_session_provenance");
        await pool.query("drop function employee_dispatch_test_fail_provenance()");
      }
    });
  } finally {await pool.end();}
});
