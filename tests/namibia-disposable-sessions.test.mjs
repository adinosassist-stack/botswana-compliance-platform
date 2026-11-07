import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import test from "node:test";
const schema=readFileSync(new URL("../proposals/namibia/003_disposable_sessions_candidate.sql",import.meta.url),"utf8");
function db(){const d=new DatabaseSync(":memory:");d.exec("PRAGMA foreign_keys=ON");d.exec(schema);return d}
const sampleHash="a".repeat(64);
test("synthetic session matches existing authentication SQL and invalidates suspended members",()=>{
 const d=db();
 try{
  d.prepare("INSERT INTO users(id,email,session_generation) VALUES(?,?,?)").run("synthetic-user-1","user@example.test",1);
  d.prepare("INSERT INTO memberships(user_id,tenant_id,role,status) VALUES(?,?,?,?)").run("synthetic-user-1","synthetic-tenant-A","owner","active");
  d.prepare("INSERT INTO sessions(token_hash,user_id,tenant_id,csrf_token,session_generation,expires_at) VALUES(?,?,?,?,?,?)")
    .run(sampleHash,"synthetic-user-1","synthetic-tenant-A","synthetic-csrf-value",1,"2099-01-01 00:00:00");
  const authSql="SELECT s.user_id,s.tenant_id,s.csrf_token,s.token_hash,m.role,u.email FROM sessions s JOIN users u ON u.id=s.user_id JOIN memberships m ON m.user_id=s.user_id AND m.tenant_id=s.tenant_id AND m.status='active' WHERE s.token_hash=? AND s.session_generation=u.session_generation AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1";
  const row=d.prepare(authSql).get(sampleHash);
  assert.equal(row.user_id,"synthetic-user-1");
  assert.equal(row.role,"owner");
  assert.equal(d.prepare(authSql).get("b".repeat(64)),undefined);
  d.prepare("UPDATE memberships SET status='suspended' WHERE user_id=?").run("synthetic-user-1");
  assert.equal(d.prepare(authSql).get(sampleHash),undefined);
  d.prepare("UPDATE memberships SET status='active' WHERE user_id=?").run("synthetic-user-1");
  d.prepare("UPDATE users SET session_generation=2 WHERE id=?").run("synthetic-user-1");
  assert.equal(d.prepare(authSql).get(sampleHash),undefined);
 }finally{d.close()}
});
test("synthetic-only constraints reject real identities, tenants and malformed hashes",()=>{
 const d=db();
 try{
  assert.throws(()=>d.prepare("INSERT INTO users(id,email) VALUES(?,?)").run("actual-user","someone@example.test"),/CHECK/);
  assert.throws(()=>d.prepare("INSERT INTO users(id,email) VALUES(?,?)").run("synthetic-user-2","someone@public.com"),/CHECK/);
  d.prepare("INSERT INTO users(id,email) VALUES(?,?)").run("synthetic-user-1","user@example.test");
  assert.throws(()=>d.prepare("INSERT INTO memberships(user_id,tenant_id,role,status) VALUES(?,?,?,?)").run("synthetic-user-1","customer-123","owner","active"),/CHECK/);
  d.prepare("INSERT INTO memberships(user_id,tenant_id,role,status) VALUES(?,?,?,?)").run("synthetic-user-1","synthetic-tenant-A","owner","active");
  assert.throws(()=>d.prepare("INSERT INTO sessions(token_hash,user_id,tenant_id,csrf_token,session_generation,expires_at) VALUES(?,?,?,?,?,?)")
     .run("short","synthetic-user-1","synthetic-tenant-A","synthetic-csrf-value",1,"2099-01-01 00:00:00"),/CHECK/);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sessions").get().n,0);
 }finally{d.close()}
});
test("disposable session schema is never routed into live Worker",()=>{
 const worker=readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
 assert.doesNotMatch(worker,/na-sessions-disposable-20261107/);
 assert.doesNotMatch(worker,/namibia-isolation-preflight/);
});
