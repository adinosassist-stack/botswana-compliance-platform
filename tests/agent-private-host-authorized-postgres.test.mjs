import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import express from "express";
import {randomUUID,createHmac} from "node:crypto";
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
 const cookieSecret="isolated-agent-ci-cookie-secret-not-production";
 const cookieToken=randomUUID();
 const cookieHash=createHmac("sha256",cookieSecret).update(cookieToken).digest("hex");
 const httpApp=express();
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
  await pool.query("alter table sessions add column if not exists token_hash text");
  await pool.query("insert into users(id,session_generation) values($1,1)",[user]);
  await pool.query("insert into memberships(user_id,tenant_id,status) values($1,$2,'active')",[user,tenant]);
  await pool.query("insert into sessions(id,user_id,tenant_id,expires_at,session_generation,token_hash) values($1,$2,$3,now()+interval '1 hour',1,$4)",[session,user,tenant,cookieHash]);
  const insert="insert into agent_action_approvals(id,tenant_id,actor_id,action,argument_digest,nonce,status,expires_at) values($1,$2,$3,'draft_internal_task',$4,$5,'pending',now()+interval '1 hour')";
  await pool.query(insert,[approval,tenant,user,"a".repeat(64),randomUUID()]);
  await pool.query(insert,[foreign,other,user,"b".repeat(64),randomUUID()]);
  assert.equal(registerPrivateAgentHistory({app:{get(...a){routes.push(a);httpApp.get(...a)}},enabled:true,killSwitch:false,
   sessionAuth:async(req,res,next)=>{
    if(req.auth)return next();
    try{
     const raw=(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("bwcos_session="));
     if(!raw)return res.status(401).set({"Cache-Control":"no-store"}).json({error:"unauthenticated"});
     const token=decodeURIComponent(raw.slice("bwcos_session=".length));
     const hash=createHmac("sha256",cookieSecret).update(token).digest("hex");
     const q=await pool.query("select s.id,s.user_id,s.tenant_id,m.status,'owner'::text as role,u.session_generation from sessions s join users u on u.id=s.user_id join memberships m on m.user_id=s.user_id and m.tenant_id=s.tenant_id where s.token_hash=$1 and s.revoked_at is null and s.expires_at>now() and s.session_generation=u.session_generation and m.status='active'",[hash]);
     if(q.rows.length!==1)return res.status(401).set({"Cache-Control":"no-store"}).json({error:"unauthenticated"});
     req.auth=q.rows[0];next();
    }catch(e){next(e)}
   },pool,publicOrigin:"https://thebedesk.com",
   requestOriginAllowed:(origin,expected)=>origin===expected}),true);
  // Real loopback HTTP request exercises Express routing and response headers.
  // Uses an isolated test-only cookie/HMAC middleware mirroring server.js; not the production server.js instance.
  const httpServer=httpApp.listen(0,"127.0.0.1");
  try{
   await new Promise(resolve=>httpServer.once("listening",resolve));
   const address=httpServer.address();
   const response=await fetch("http://127.0.0.1:"+address.port+"/api/agent/approval-history",{
    headers:{origin:"https://thebedesk.com","sec-fetch-site":"same-origin"}
   });
   assert.equal(response.status,401,"HTTP request without a verified session must return unauthorized");
   const authorized=await fetch("http://127.0.0.1:"+address.port+"/api/agent/approval-history",{
    headers:{origin:"https://thebedesk.com","sec-fetch-site":"same-origin",cookie:"bwcos_session="+encodeURIComponent(cookieToken)}
   });
   assert.equal(authorized.status,200,"valid hashed session cookie must authorize isolated HTTP history read");
   const authorizedBody=await authorized.json();
   assert.deepEqual(authorizedBody.items.map(x=>x.id),[approval]);
   await pool.query("update sessions set revoked_at=now() where id=$1",[session]);
   const deniedRevoked=await fetch("http://127.0.0.1:"+address.port+"/api/agent/approval-history",{
    headers:{origin:"https://thebedesk.com","sec-fetch-site":"same-origin",cookie:"bwcos_session="+encodeURIComponent(cookieToken)}
   });
   assert.equal(deniedRevoked.status,401,"revoked cookie must be rejected at HTTP session boundary");
   await pool.query("update sessions set revoked_at=null where id=$1",[session]);
   assert.equal(response.headers.get("cache-control"),"no-store");
   const body=await response.json();
   assert.equal(body.error,"unauthenticated");
  }finally{await new Promise((resolve,reject)=>httpServer.close(err=>err?reject(err):resolve()))}
  const principal={id:session,tenant_id:tenant,user_id:user,role:"owner"};
  const ok=await invoke(principal);
  assert.equal(ok.status,200);
  assert.deepEqual(ok.body.items.map(x=>x.id),[approval]);
  const audit=await pool.query("select tenant_id,actor_user_id,event_type from audit_events where tenant_id=$1 and actor_user_id=$2 and event_type=$3",[tenant,user,"agent.approval_history.read"]);
  assert.equal(audit.rows.length,1,"successful read must persist an audit event");
  await pool.query("create or replace function agent_history_test_deny_audit() returns trigger language plpgsql as $audit$ begin if new.event_type='agent.approval_history.read' then raise exception 'test_audit_write_blocked'; end if; return new; end $audit$");
  await pool.query("create trigger agent_history_test_deny_audit before insert on audit_events for each row execute function agent_history_test_deny_audit()");
  const blocked=await invoke(principal);
  assert.equal(blocked.status,503,"audit write failure must fail closed");
  assert.equal(blocked.body.code,"agent_history_audit_failed");
  assert.deepEqual(blocked.body.items,[]);
  await pool.query("drop trigger agent_history_test_deny_audit on audit_events");
  await pool.query("drop function agent_history_test_deny_audit()");
  // Session lifecycle regressions: all deny access before any further audit writes.
  const beforeDenials=await pool.query("select count(*)::int as n from audit_events where tenant_id=$1 and event_type=$2",[tenant,"agent.approval_history.read"]);
  await pool.query("update sessions set revoked_at=now() where id=$1",[session]);
  assert.notEqual((await invoke(principal)).status,200,"revoked session must not read history");
  await pool.query("update sessions set revoked_at=null,expires_at=now()-interval '1 minute' where id=$1",[session]);
  assert.notEqual((await invoke(principal)).status,200,"expired session must not read history");
  await pool.query("update sessions set expires_at=now()+interval '1 hour',session_generation=0 where id=$1",[session]);
  assert.notEqual((await invoke(principal)).status,200,"stale session generation must not read history");
  await pool.query("update sessions set session_generation=1 where id=$1",[session]);
  const afterDenials=await pool.query("select count(*)::int as n from audit_events where tenant_id=$1 and event_type=$2",[tenant,"agent.approval_history.read"]);
  assert.equal(afterDenials.rows[0].n,beforeDenials.rows[0].n,"denied sessions must not emit successful-read audit events");
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
