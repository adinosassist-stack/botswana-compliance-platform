import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {randomUUID} from "node:crypto";
import {registerPrivateAgentHistory} from "../server/agent-approval-history-private-host.js";

// Isolated CI schema mimics the session/membership contract used by server.js.
// No production credentials, routes or database are touched.
test("private host authorizes real DB-backed tenant membership and denies cross-tenant reads",{
 skip:!process.env.AGENT_HISTORY_TEST_DATABASE_URL
},async()=>{
 const pool=new pg.Pool({connectionString:process.env.AGENT_HISTORY_TEST_DATABASE_URL,max:8});
 const tenant="host-"+randomUUID(),other="host-"+randomUUID();
 const user="user-"+randomUUID(),session=randomUUID(),approval=randomUUID(),foreign=randomUUID();
 const routes=[];
 const invoke=async(auth,headers={origin:"https://thebedesk.com","sec-fetch-site":"same-origin"})=>{
  let output={};
  const res={status(v){output.status=v;return this},set(){return this},json(v){output.body=v;return this}};
  await routes[0][2]({method:"GET",auth,headers},res);return output;
 };
 try{
  await pool.query("create temporary table if not exists _agent_host_test_dummy (id text)");
  // Governance CI migrations supply approvals; these three auth tables are isolated
  // to this disposable CI database and must never be used in production.
  await pool.query("create table if not exists sessions (id uuid primary key,user_id text,tenant_id text,revoked_at timestamptz,expires_at timestamptz,session_generation integer)");
  await pool.query("create table if not exists users (id text primary key,session_generation integer)");
  await pool.query("create table if not exists memberships (user_id text,tenant_id text,status text)");
  await pool.query("create table if not exists audit_events (id bigserial primary key,tenant_id text,actor_user_id text,event_type text,entity_type text,entity_id_text text,request_id text,event_data jsonb)");
  await pool.query("insert into users(id,session_generation) values($1,1)",[user]);
  await pool.query("insert into memberships(user_id,tenant_id,status) values($1,$2,'active')",[user,tenant]);
  await pool.query("insert into sessions(id,user_id,tenant_id,expires_at,session_generation) values($1,$2,$3,now()+interval '1 hour',1)",[session,user,tenant]);
  const insert="insert into agent_action_approvals(id,tenant_id,actor_id,action,argument_digest,nonce,status,expires_at) values($1,$2,$3,'draft_internal_task',$4,$5,'pending',now()+interval '1 hour')";
  await pool.query(insert,[approval,tenant,user,"a".repeat(64),randomUUID()]);
  await pool.query(insert,[foreign,other,user,"b".repeat(64),randomUUID()]);
  assert.equal(registerPrivateAgentHistory({app:{get(...a){routes.push(a)}},enabled:true,killSwitch:false,
   sessionAuth:(_req,_res,next)=>next(),pool,publicOrigin:"https://thebedesk.com",
   requestOriginAllowed:(origin,expected)=>origin===expected}),true);
  const principal={id:session,tenant_id:tenant,user_id:user,role:"owner"};
  const ok=await invoke(principal);
  assert.equal(ok.status,200);
  assert.deepEqual(ok.body.items.map(x=>x.id),[approval]);
  const audit=await pool.query("select tenant_id,actor_user_id,event_type from audit_events where tenant_id=$1 and actor_user_id=$2 and event_type=$3",[tenant,user,"agent.approval_history.read"]);
  assert.equal(audit.rows.length,1,"successful read must persist an audit event");
  await pool.query("create or replace function agent_history_test_deny_audit() returns trigger language plpgsql as $ begin if new.event_type='agent.approval_history.read' then raise exception 'test_audit_write_blocked'; end if; return new; end $");
  await pool.query("create trigger agent_history_test_deny_audit before insert on audit_events for each row execute function agent_history_test_deny_audit()");
  const blocked=await invoke(principal);
  assert.equal(blocked.status,503,"audit write failure must fail closed");
  assert.equal(blocked.body.code,"agent_history_audit_failed");
  assert.deepEqual(blocked.body.items,[]);
  await pool.query("drop trigger agent_history_test_deny_audit on audit_events");
  await pool.query("drop function agent_history_test_deny_audit()");
  const denied=await invoke({...principal,tenant_id:other});
  assert.notEqual(denied.status,200);
  await pool.query("update memberships set status='inactive' where user_id=$1",[user]);
  const revoked=await invoke(principal);
  assert.notEqual(revoked.status,200);
 }finally{
  await pool.query("drop trigger if exists agent_history_test_deny_audit on audit_events").catch(()=>{});
  await pool.query("drop function if exists agent_history_test_deny_audit()").catch(()=>{});
  await pool.query("delete from audit_events where tenant_id=$1 and actor_user_id=$2 and event_type=$3",[tenant,user,"agent.approval_history.read"]).catch(()=>{});
  await pool.query("delete from agent_action_approvals where id in ($1,$2)",[approval,foreign]).catch(()=>{});
  await pool.query("delete from sessions where id=$1",[session]).catch(()=>{});
  await pool.query("delete from memberships where user_id=$1",[user]).catch(()=>{});
  await pool.query("delete from users where id=$1",[user]).catch(()=>{});
  await pool.end();
 }
});
