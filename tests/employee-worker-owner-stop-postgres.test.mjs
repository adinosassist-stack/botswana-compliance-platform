import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {test} from "node:test";
import pg from "pg";
import {createEmployeeWorkerOwnerStopDraft} from "../server/employee-worker-owner-stop-draft.js";

const url=new URL(process.env.DATABASE_URL??"postgresql://invalid/invalid");
if(process.env.EMPLOYEE_DISPATCH_PG_TEST_ONLY!=="true"||
  !['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=="/employee_dispatch_ci"){
  throw new Error("refusing_non_ephemeral_postgres_database");
}

test("owner stop remains internal, authenticated, revision-bound and atomic",async t=>{
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:6});
  const tenant=randomUUID(),otherTenant=randomUUID();
  const owner=randomUUID(),manager=randomUUID(),reviewer=randomUUID();
  const sessionId=randomUUID();
  const flags={draftOnly:true,stopWritingEnabled:true};
  const writer=(session={id:sessionId,tenantId:tenant},options=flags)=>
    createEmployeeWorkerOwnerStopDraft({pool,resolveAuthenticatedSession:async()=>session,...options});
  const state=async (id=tenant)=>(await pool.query(
    "select revision,feature_enabled,kill_switch,operator_stop from employee_dispatch_worker_controls where tenant_id=$1",[id])).rows[0];
  const enable=()=>pool.query(`update employee_dispatch_worker_controls
    set feature_enabled=true,kill_switch=false,operator_stop=false where tenant_id=$1`,[tenant]);
  const audits=async()=>(await pool.query(
    "select count(*)::int as n from employee_dispatch_worker_owner_stops where tenant_id=$1",[tenant])).rows[0].n;
  const makeSession=async(person,extra={})=>{
    const id=extra.id??randomUUID();
    await pool.query(`insert into sessions
      (id,token_hash,user_id,tenant_id,csrf_token,expires_at,revoked_at,session_generation)
      values ($1,$2,$3,$4,'stop-test',$5,$6,$7)`,
      [id,"stop-"+randomUUID(),person,tenant,
        extra.expires??new Date(Date.now()+86400000),extra.revoked??null,extra.generation??0]);
    return {id,tenantId:tenant};
  };
  try{
    await pool.query("insert into tenants(id,name) values ($1,'Owner stop'),($2,'Other stop tenant')",[tenant,otherTenant]);
    for(const [id,role] of [[owner,'owner'],[manager,'manager'],[reviewer,'reviewer']]){
      await pool.query("insert into users(id,email) values ($1,$2)",[id,"owner-stop-"+randomUUID()+"@example.invalid"]);
      await pool.query("insert into memberships(tenant_id,user_id,role,status) values ($1,$2,$3,'active')",[tenant,id,role]);
    }
    await makeSession(owner,{id:sessionId});
    await pool.query("insert into employee_dispatch_worker_controls(tenant_id) values ($1),($2)",[tenant,otherTenant]);
    await enable();

    await t.test("default-off rejects before resolver or database access",async()=>{
      let called=0;
      for(const options of [{},{draftOnly:true},{stopWritingEnabled:true},
        {draftOnly:true,stopWritingEnabled:'true'}]){
        const disabled=createEmployeeWorkerOwnerStopDraft({
          pool:{connect(){called++;throw Error('must not connect')}},
          resolveAuthenticatedSession:async()=>{called++;throw Error('must not resolve')},...options});
        assert.deepEqual(await disabled.stopWorker({expectedRevision:'1',...flags}),{ok:false,reason:'not_enabled'});
      }
      assert.equal(called,0);
    });

    await t.test("invalid and missing session authority cannot write",async()=>{
      const before=await state();
      assert.deepEqual(await writer(null).stopWorker({expectedRevision:before.revision}),{ok:false,reason:'unauthenticated'});
      assert.deepEqual(await writer({id:randomUUID(),tenantId:tenant}).stopWorker({expectedRevision:before.revision}),{ok:false,reason:'forbidden'});
      assert.deepEqual(await state(),before);
    });

    await t.test("manager and reviewer sessions cannot stop the worker",async()=>{
      const before=await state();
      for(const person of [manager,reviewer]){
        const session=await makeSession(person);
        assert.deepEqual(await writer(session).stopWorker({expectedRevision:before.revision,role:'owner',actorId:owner}),
          {ok:false,reason:'forbidden'});
      }
      assert.deepEqual(await state(),before);
    });

    await t.test("revoked, expired and stale-generation owner sessions deny",async()=>{
      const before=await state();
      for(const extra of [{revoked:new Date()},{expires:new Date(Date.now()-1000)},{generation:1}]){
        const session=await makeSession(owner,extra);
        assert.deepEqual(await writer(session).stopWorker({expectedRevision:before.revision}),{ok:false,reason:'forbidden'});
      }
      assert.deepEqual(await state(),before);
    });

    await t.test("inactive owner membership and tenant/session mismatch deny",async()=>{
      const before=await state();
      try{
        await pool.query("update memberships set status='suspended' where tenant_id=$1 and user_id=$2",[tenant,owner]);
        assert.deepEqual(await writer().stopWorker({expectedRevision:before.revision}),{ok:false,reason:'forbidden'});
      }finally{
        await pool.query("update memberships set status='active' where tenant_id=$1 and user_id=$2",[tenant,owner]);
      }
      assert.deepEqual(await writer({id:sessionId,tenantId:otherTenant}).stopWorker({expectedRevision:'1'}),{ok:false,reason:'forbidden'});
      assert.deepEqual(await state(),before);
    });

    await t.test("trusted owner stop ignores forged tenant and actor fields",async()=>{
      const before=await state(),otherBefore=await state(otherTenant);
      const result=await writer().stopWorker({expectedRevision:before.revision,
        tenantId:otherTenant,actorId:reviewer,role:'owner',feature_enabled:true,operator_stop:false});
      assert.equal(result.ok,true);assert.equal(result.changed,true);assert.equal(result.reason,'worker_stopped');
      const after=await state();
      assert.deepEqual({...after,revision:undefined},{revision:undefined,feature_enabled:false,kill_switch:true,operator_stop:true});
      assert.equal(BigInt(after.revision),BigInt(before.revision)+1n);
      assert.deepEqual(await state(otherTenant),otherBefore);
      const audit=await pool.query("select actor_user_id::text,session_id::text from employee_dispatch_worker_owner_stops where tenant_id=$1 and revision=$2",[tenant,result.revision]);
      assert.deepEqual(audit.rows,[{actor_user_id:owner,session_id:sessionId}]);
      assert(!JSON.stringify(result).includes(sessionId));assert(!JSON.stringify(result).includes(owner));
      const count=await audits();
      assert.deepEqual(await writer().stopWorker({expectedRevision:result.revision}),
        {ok:true,stopped:true,changed:false,reason:'already_stopped',revision:result.revision});
      assert.equal(await audits(),count,'replay does not duplicate owner audit');
      await enable();
    });

    await t.test("invalid/stale revisions and concurrent owners cannot overwrite state",async()=>{
      const before=await state();
      for(const value of [null,0,-1,'01',1.2,Number.MAX_SAFE_INTEGER+1,'9223372036854775808']){
        assert.deepEqual(await writer().stopWorker({expectedRevision:value}),{ok:false,reason:'invalid_request'});
      }
      assert.deepEqual(await writer().stopWorker({expectedRevision:'1'}),{ok:false,reason:'revision_conflict'});
      const count=await audits();
      const outcomes=await Promise.all([writer().stopWorker({expectedRevision:before.revision}),
        writer().stopWorker({expectedRevision:before.revision})]);
      assert.equal(outcomes.filter(x=>x.ok&&x.changed).length,1);
      assert.equal(outcomes.filter(x=>x.reason==='revision_conflict').length,1);
      assert.equal(await audits(),count+1);
      await enable();
    });

    await t.test("owner audit failure rolls back state, revision and state audit",async()=>{
      const before=await state(),count=await audits();
      await pool.query(`create function employee_dispatch_test_owner_stop_error()
        returns trigger language plpgsql as $error$
        begin raise exception 'owner_audit_failed' using errcode='23514';end;$error$`);
      await pool.query(`create trigger employee_dispatch_test_owner_stop_failure
        before insert on employee_dispatch_worker_owner_stops
        for each row execute function employee_dispatch_test_owner_stop_error()`);
      try{
        assert.deepEqual(await writer().stopWorker({expectedRevision:before.revision}),{ok:false,reason:'governance_unavailable'});
        assert.deepEqual(await state(),before);assert.equal(await audits(),count);
        assert.equal((await pool.query("select 1 from employee_dispatch_worker_control_events where tenant_id=$1 and revision>$2",[tenant,before.revision])).rowCount,0);
      }finally{
        await pool.query("drop trigger employee_dispatch_test_owner_stop_failure on employee_dispatch_worker_owner_stops");
        await pool.query("drop function employee_dispatch_test_owner_stop_error()");
      }
    });

    await t.test("provenance audit is immutable and preview roles cannot read it",async()=>{
      await assert.rejects(pool.query("delete from employee_dispatch_worker_owner_stops where tenant_id=$1",[tenant]),e=>e.code==='23514');
      await assert.rejects(pool.query("update employee_dispatch_worker_owner_stops set actor_user_id=$2 where tenant_id=$1",[tenant,reviewer]),e=>e.code==='23514');
      const client=await pool.connect();
      try{
        await client.query("BEGIN");await client.query("SET LOCAL ROLE employee_dispatch_preview_reader");
        await assert.rejects(client.query("select * from employee_dispatch_worker_owner_stops"),e=>e.code==='42501');
      }finally{await client.query("ROLLBACK");client.release();}
    });
  }finally{await pool.end();}
});
