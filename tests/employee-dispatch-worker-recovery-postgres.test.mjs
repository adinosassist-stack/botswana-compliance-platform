import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";
import { createEmployeeReviewerGrantActivatorDraft } from "../server/employee-reviewer-grant-activator-draft.js";
import { createEmployeeReviewSessionWriterDraft } from "../server/employee-review-session-writer-draft.js";
import { createEmployeeDispatchPostgresTransactionStore } from "../server/employee-dispatch-postgres-transaction.js";
import { createEmployeeDispatchPostgresOutboxWriter } from "../server/employee-dispatch-postgres-outbox-writer.js";
import { createEmployeeDispatchWorkerRecoveryDraft } from "../server/employee-dispatch-worker-recovery-draft.js";

const url=new URL(process.env.DATABASE_URL??"postgresql://invalid/invalid");
if(process.env.EMPLOYEE_DISPATCH_PG_TEST_ONLY!=="true"||
   !["127.0.0.1","localhost"].includes(url.hostname)||
   url.pathname!=="/employee_dispatch_ci"){
  throw new Error("refusing_non_ephemeral_postgres_database");
}
const allow={featureEnabled:true,killSwitch:false,auditAvailable:true,
  operatorStop:false,simulationOnly:true};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test("PostgreSQL worker recovery is lease-fenced, audited, bounded and simulation-only",async t=>{
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:8});
  const tenant=randomUUID(),otherTenant=randomUUID();
  const issuer=randomUUID(),approver=randomUUID(),reviewer=randomUUID();
  const approverSession=randomUUID(),reviewerSession=randomUUID();
  const proposal="worker-proposal-"+randomUUID();
  const store=createEmployeeDispatchPostgresTransactionStore(
    pool,client=>createEmployeeDispatchPostgresOutboxWriter(client)
  );
  const worker=createEmployeeDispatchWorkerRecoveryDraft(pool);
  const activation=createEmployeeReviewerGrantActivatorDraft({
    pool,resolveAuthenticatedSession:async()=>({id:approverSession,tenantId:tenant})
  });
  const reviewWriter=createEmployeeReviewSessionWriterDraft({
    pool,resolveAuthenticatedSession:async()=>({id:reviewerSession,tenantId:tenant})
  });
  let reviewId=null;
  const insertIntent=async key=>store.transaction(async tx=>{
    assert.equal(await tx.lockDispatchKey(tenant,key),true);
    const result=await tx.insertIntentOnce({
      tenantId:tenant,proposalId:proposal,reviewId,action:"internal.task.create",
      intentType:"task",idempotencyKey:key
    });
    assert.equal(result.status,"created");
    assert.equal(await tx.appendAudit({
      type:"employee.dispatch.admitted",tenantId:tenant,actorId:issuer,
      proposalId:proposal,reviewId,action:"internal.task.create",
      idempotencyKey:key,created:true
    }),true);
    return key;
  });
  const byKey=async key=>{
    const r=await pool.query(
      `select i.id::text as id,w.state,w.attempts,w.lease_token::text as token
       from employee_dispatch_intents i
       join employee_dispatch_worker_claims w
         on w.tenant_id=i.tenant_id and w.intent_id=i.id
       where i.tenant_id=$1 and i.idempotency_key=$2`,[tenant,key]
    );
    assert.equal(r.rowCount,1);
    return r.rows[0];
  };
  const claim=(params={})=>worker.claimNext({
    tenantId:tenant,leaseSeconds:30,...allow,...params
  });
  const resolve=(lease,transition,params={})=>worker.resolveLease({
    tenantId:tenant,intentId:lease.intentId,leaseToken:lease.leaseToken,
    transition,...allow,...params
  });
  try{
    await pool.query("insert into tenants(id,name) values ($1,'Worker tenant'),($2,'Other tenant')",
      [tenant,otherTenant]);
    for(const id of [issuer,approver,reviewer]){
      await pool.query("insert into users(id,email) values ($1,$2)",
        [id,"recovery-"+randomUUID()+"@example.invalid"]);
    }
    await pool.query(
      `insert into memberships(tenant_id,user_id,role,status)
       values ($1,$2,'owner','active'),($1,$3,'owner','active'),
              ($1,$4,'reviewer','active')`,
      [tenant,issuer,approver,reviewer]);
    for(const [id,person] of [[approverSession,approver],[reviewerSession,reviewer]]){
      await pool.query(
        `insert into sessions
         (id,token_hash,user_id,tenant_id,csrf_token,expires_at,session_generation)
         values ($1,$2,$3,$4,'worker-test',now()+interval '1 day',0)`,
        [id,"worker-"+randomUUID(),person,tenant]);
    }
    await pool.query(
      `insert into employee_dispatch_reviewer_permission_grants
        (tenant_id,reviewer_user_id,permission,granted_by_user_id)
       values ($1,$2,'people.workflow.approve',$3)`,
      [tenant,reviewer,issuer]);
    assert.equal((await activation.activateDisabledGrant({reviewerId:reviewer})).activated,true);
    await pool.query(
      `insert into employee_dispatch_proposal_versions
       (tenant_id,proposal_id,revision,author_id,action,payload_digest)
       values ($1,$2,1,$3,'internal.task.create',$4)`,
      [tenant,proposal,issuer,"a".repeat(64)]);
    await pool.query(
      "insert into employee_dispatch_proposal_heads(tenant_id,proposal_id,current_revision) values ($1,$2,1)",
      [tenant,proposal]);
    const review=await reviewWriter.recordReview({proposalId:proposal,decision:"approved"});
    assert.equal(review.recorded,true);
    reviewId=review.reviewId;

    await t.test("default-off and operator-stop controls never claim an intent",async()=>{
      const key="gated-"+randomUUID();
      await insertIntent(key);
      for(const config of [
        {},{...allow,featureEnabled:"true"},
        {...allow,killSwitch:true},{...allow,auditAvailable:false},
        {...allow,operatorStop:true},{...allow,simulationOnly:false},
        {...allow,featureEnabled:1}
      ]){
        const result=await worker.claimNext({tenantId:tenant,...config});
        assert.equal(result.ok,false);
      }
      assert.equal((await byKey(key)).attempts,0);
      const lease=await claim();
      assert.equal(lease.ok,true);
      assert.equal(lease.attempt,1);
      assert.equal(lease.action,"internal.task.create");
      assert.deepEqual(await resolve(lease,"qualify"),
        {ok:true,reason:"simulated_preflight_only"});
      assert.equal((await byKey(key)).state,"qualified");
    });

    await t.test("two simultaneous workers cannot claim the same work",async()=>{
      const key="concurrent-"+randomUUID();
      await insertIntent(key);
      const both=await Promise.all([claim(),claim()]);
      assert.deepEqual(both.map(x=>x.ok).sort(),[false,true]);
      const lease=both.find(x=>x.ok);
      assert.equal((await byKey(key)).attempts,1);
      assert.equal((await resolve(lease,"qualify")).ok,true);
      const audit=await pool.query(
        `select event_type from employee_dispatch_worker_events
         where tenant_id=$1 and intent_id=$2::uuid`,[tenant,lease.intentId]);
      assert.deepEqual(audit.rows.map(x=>x.event_type).sort(),["claimed","qualified"]);
    });

    await t.test("retry rotates token; old token cannot qualify or retry",async()=>{
      const key="retry-"+randomUUID();
      await insertIntent(key);
      const first=await claim();
      assert.equal(first.ok,true);
      assert.deepEqual(await resolve(first,"retry",{retryDelaySeconds:0}),
        {ok:true,reason:"pending"});
      const second=await claim();
      assert.equal(second.ok,true);
      assert.notEqual(first.leaseToken,second.leaseToken);
      assert.equal(second.attempt,2);
      assert.equal((await resolve(first,"qualify")).ok,false);
      assert.equal((await resolve(first,"retry")).ok,false);
      assert.equal((await resolve(second,"qualify")).ok,true);
    });

    await t.test("bounded attempts dead-letter and cannot be claimed again",async()=>{
      const key="exhaust-"+randomUUID();
      await insertIntent(key);
      for(let count=1;count<=3;count++){
        const lease=await claim();
        assert.equal(lease.ok,true);
        assert.equal(lease.attempt,count);
        const finished=await resolve(lease,"retry");
        assert.equal(finished.reason,count===3?"dead_letter":"pending");
      }
      const row=await byKey(key);
      assert.deepEqual({state:row.state,attempts:row.attempts},
        {state:"dead_letter",attempts:3});
      const noMore=await claim();
      assert.equal(noMore.ok,false);
      await assert.rejects(
        pool.query(
          "update employee_dispatch_worker_claims set state='pending',attempts=0 where tenant_id=$1 and intent_id=$2",
          [tenant,row.id]),
        e=>e.code==="23514"
      );
    });

    await t.test("expired leases can be reclaimed but old token stays fenced",async()=>{
      const key="expired-"+randomUUID();
      await insertIntent(key);
      const first=await claim({leaseSeconds:1});
      assert.equal(first.ok,true);
      await sleep(1250);
      assert.equal((await resolve(first,"qualify")).ok,false);
      const second=await claim({leaseSeconds:30});
      assert.equal(second.ok,true);
      assert.equal(second.attempt,2);
      assert.notEqual(second.leaseToken,first.leaseToken);
      assert.equal((await resolve(first,"qualify")).ok,false);
      assert.equal((await resolve(second,"qualify")).ok,true);
    });

    await t.test("lease expiring during a row-lock wait cannot qualify",async()=>{
      const key="lock-expiry-"+randomUUID();
      await insertIntent(key);
      const first=await claim({leaseSeconds:2});
      assert.equal(first.ok,true);
      const blocker=await pool.connect();
      let completion;
      try{
        await blocker.query("BEGIN");
        await blocker.query(
          "select 1 from employee_dispatch_worker_claims where tenant_id=$1 and intent_id=$2 for update",
          [tenant,first.intentId]);
        completion=resolve(first,"qualify");
        let blocked=false;
        const deadline=Date.now()+1500;
        while(Date.now()<deadline){
          const waiting=await pool.query(
            `select 1 from pg_stat_activity where datname=current_database()
             and pid<>pg_backend_pid() and wait_event_type='Lock'
             and query like '%select state,attempts,max_attempts,lease_token%'`);
          if(waiting.rowCount){blocked=true;break;}
          await sleep(10);
        }
        assert.equal(blocked,true,"completion actually waits behind another transaction");
        await sleep(2100);
        await blocker.query("COMMIT");
        assert.deepEqual(await completion,{ok:false,reason:"stale_or_expired_lease"});
        assert.equal((await byKey(key)).state,"leased","expired completion cannot qualify work");
      }finally{
        await blocker.query("ROLLBACK").catch(()=>{});blocker.release();
        if(completion)await completion;
      }
      const second=await claim();
      assert.equal(second.ok,true);
      assert.equal(second.attempt,2);
      assert.notEqual(second.leaseToken,first.leaseToken);
      assert.equal((await resolve(second,"qualify")).ok,true);
    });

    await t.test("unaudited direct SQL claim cannot commit",async()=>{
      const key="bare-"+randomUUID();
      await insertIntent(key);
      const row=await byKey(key);
      const client=await pool.connect();
      try{
        await client.query("BEGIN");
        await client.query(
          `update employee_dispatch_worker_claims
           set state='leased',attempts=attempts+1,lease_token=$3::uuid,
               lease_expires_at=now()+interval '30 seconds'
           where tenant_id=$1 and intent_id=$2`,
          [tenant,row.id,randomUUID()]);
        await assert.rejects(client.query("COMMIT"),e=>e.code==="23514");
      }finally{await client.query("ROLLBACK").catch(()=>{});client.release();}
      assert.equal((await byKey(key)).attempts,0);
      const good=await claim();
      assert.equal(good.ok,true);
      assert.equal((await resolve(good,"qualify")).ok,true);
    });

    await t.test("audit failure rolls back claim, token and attempt counter",async()=>{
      const key="auditfail-"+randomUUID();
      await insertIntent(key);
      await pool.query(
        `create function employee_dispatch_test_worker_audit_error()
         returns trigger language plpgsql as $test$
         begin raise exception 'audit_unavailable' using errcode='23514';end;
         $test$`);
      await pool.query(
        `create trigger employee_dispatch_test_worker_audit_failure
         before insert on employee_dispatch_worker_events
         for each row execute function employee_dispatch_test_worker_audit_error()`);
      try{
        const bad=await claim();
        assert.deepEqual(bad,{ok:false,reason:"governance_unavailable"});
        const check=await byKey(key);
        assert.equal(check.state,"pending");
        assert.equal(check.attempts,0);
      }finally{
        await pool.query(
          "drop trigger employee_dispatch_test_worker_audit_failure on employee_dispatch_worker_events");
        await pool.query("drop function employee_dispatch_test_worker_audit_error()");
      }
      const lease=await claim();
      assert.equal(lease.ok,true);
      assert.equal((await resolve(lease,"qualify")).ok,true);
    });

    await t.test("revoked reviewer permission blocks revalidation, no side effects",async()=>{
      const key="revoke-"+randomUUID();
      await insertIntent(key);
      const lease=await claim();
      assert.equal(lease.ok,true);
      await pool.query(
        `update employee_dispatch_reviewer_permission_grants
         set enabled=false,revoked_at=now()
         where tenant_id=$1 and reviewer_user_id=$2`,
        [tenant,reviewer]);
      assert.deepEqual(await resolve(lease,"qualify"),
        {ok:false,reason:"approval_required"});
      assert.equal((await byKey(key)).state,"leased");
      assert.equal((await claim({tenantId:otherTenant})).ok,false);
      const effects=await pool.query(
        "select count(*)::int as n from employee_dispatch_worker_events where event_type='qualified' and intent_id=$1",
        [lease.intentId]);
      assert.equal(effects.rows[0].n,0);
    });

    await t.test("tenant preview and CI read roles get no worker table access",async()=>{
      const client=await pool.connect();
      try{
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE employee_dispatch_preview_reader");
        for(const table of ["employee_dispatch_worker_claims","employee_dispatch_worker_events"]){
          await client.query("SAVEPOINT denied");
          await assert.rejects(client.query("select * from "+table),
            e=>e.code==="42501");
          await client.query("ROLLBACK TO SAVEPOINT denied");
        }
      }finally{await client.query("ROLLBACK");client.release();}
    });
  }finally{
    await pool.end();
  }
});
