import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {Miniflare,convertV4MiniflareOptions} from "miniflare";
import {handleAgenticPersistentTaskRequest} from "../cloudflare/src/agentic-persistent-tasks.js";

// Actual local D1 binding, in memory; no production configuration or credentials.
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('local')}}",compatibilityDate:"2026-09-03",d1Databases:{DB:"synthetic-task-audit"}}));
try{
  const db=await mf.getD1Database("DB");
  for(const sql of [
    "CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,session_generation INTEGER DEFAULT 0)",
    "CREATE TABLE memberships(tenant_id TEXT,user_id TEXT,role TEXT,status TEXT)",
    "CREATE TABLE sessions(token_hash TEXT,user_id TEXT,tenant_id TEXT,csrf_token TEXT,session_generation INTEGER DEFAULT 0,expires_at TEXT)",
    "CREATE TABLE agent_persistent_tasks(id TEXT PRIMARY KEY,tenant_id TEXT,status TEXT,next_run_at TEXT,updated_at TEXT)",
    "CREATE TABLE agent_persistent_task_events(id TEXT,tenant_id TEXT,persistent_task_id TEXT,event_type TEXT,event_data TEXT)",
    "CREATE TABLE audit_events(tenant_id TEXT,actor_user_id TEXT,event_type TEXT,entity_type TEXT,entity_id TEXT,event_data TEXT)"
  ])await db.prepare(sql).run();
  const secret="d1-audit-test-secret",token="d1-audit-session",csrf="d1-audit-csrf";
  await db.batch([
    db.prepare("INSERT INTO users(id,email) VALUES('owner-a','d1@example.test')"),
    db.prepare("INSERT INTO memberships VALUES('tenant-a','owner-a','owner','active')"),
    db.prepare("INSERT INTO sessions(token_hash,user_id,tenant_id,csrf_token,expires_at) VALUES(?,'owner-a','tenant-a',?,datetime('now','+1 day'))").bind(createHmac("sha256",secret).update(token).digest("hex"),csrf),
    db.prepare("INSERT INTO agent_persistent_tasks(id,tenant_id,status) VALUES('task-a','tenant-a','active'),('task-b','tenant-b','active')")
  ]);
  const env={DB:db,SESSION_SECRET:secret,PUBLIC_ORIGIN:"https://app.example"};
  const path="/api/agentic/persistent-tasks/task-a/pause";
  async function call(environment=env){
    const request=new Request(env.PUBLIC_ORIGIN+path,{method:"POST",headers:{cookie:`__Host-bw_session=${token}`,"x-csrf-token":csrf,origin:env.PUBLIC_ORIGIN}});
    const r=await handleAgenticPersistentTaskRequest({request,logicalPath:path,env:environment});return {status:r.status,body:await r.json()};
  }
  const state=()=>db.prepare("SELECT status FROM agent_persistent_tasks WHERE id='task-a'").first();
  const counts=async()=>({event:(await db.prepare("SELECT COUNT(*) n FROM agent_persistent_task_events").first()).n,audit:(await db.prepare("SELECT COUNT(*) n FROM audit_events").first()).n});
  await db.prepare("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'synthetic_audit_unavailable'); END").run();
  await assert.rejects(()=>call(),/synthetic_audit_unavailable/);
  assert.equal((await state()).status,"active");assert.deepEqual(await counts(),{event:0,audit:0});
  await db.prepare("DROP TRIGGER fail_audit").run();
  assert.equal((await call()).status,200);assert.equal((await state()).status,"paused");assert.deepEqual(await counts(),{event:1,audit:1});
  assert.deepEqual(await db.prepare("SELECT tenant_id,actor_user_id,event_data FROM audit_events").first(),{tenant_id:"tenant-a",actor_user_id:"owner-a",event_data:JSON.stringify({from:"active",to:"paused"})});
  // Simulate a concurrent change after the authenticated SELECT but before D1 batch.
  const racedDB={prepare:sql=>db.prepare(sql),async batch(statements){await db.prepare("UPDATE agent_persistent_tasks SET status='active' WHERE id='task-a'").run();return db.batch(statements)}};
  const raced=await call({...env,DB:racedDB});assert.equal(raced.status,409);assert.equal(raced.body.error,"persistent_task_transition_conflict");
  assert.equal((await state()).status,"active");assert.deepEqual(await counts(),{event:1,audit:1});
  assert.equal((await db.prepare("SELECT status FROM agent_persistent_tasks WHERE id='task-b'").first()).status,"active");
  console.log("Local D1 actual handler: audit rollback, conditional receipts and stale-state conflict PASS");
}finally{await mf.dispose()}
