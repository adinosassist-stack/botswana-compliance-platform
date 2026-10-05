import assert from "node:assert/strict";
import fs from "node:fs";
import {DatabaseSync} from "node:sqlite";

const source=fs.readFileSync(new URL("../cloudflare/src/agentic-task-execution.js",import.meta.url),"utf8");
const migration=fs.readFileSync(new URL("../cloudflare/migrations/064_v217_jit_execution_permits.sql",import.meta.url),"utf8");

const cancelStart=source.indexOf("async function cancelTask");
const permitStart=source.indexOf("async function issueJitPermit",cancelStart);
const executeStart=source.indexOf("async function executeTask");
const executeEnd=source.indexOf("async function listTasks",executeStart);
assert.ok(cancelStart>=0&&permitStart>cancelStart,"cancelTask must remain present");
assert.ok(executeStart>=0&&executeEnd>executeStart,"executeTask must remain present");
const cancelBody=source.slice(cancelStart,permitStart);
const executeBody=source.slice(executeStart,executeEnd);

assert.match(cancelBody,/status IN \('prepared','approved'\)/,
  "cancellation must atomically require a still-cancellable task request");
assert.match(executeBody,/status='approved' AND approved_payload_hash=payload_hash AND approved_by_user_id=\? AND jit_permit_id IS NULL/,
  "execution must re-check approved state and exact owner approval in the write predicate");
assert.match(executeBody,/INSERT INTO agent_internal_tasks[\s\S]*?WHERE changes\(\)=1/,
  "task creation must remain conditional on the guarded execution transition");
assert.match(executeBody,/INSERT INTO agent_execution_receipts[\s\S]*?WHERE changes\(\)=1/,
  "receipt creation must remain conditional on a successful task side effect");
assert.match(executeBody,/AGENT_TASK_EXECUTED[\s\S]*?WHERE changes\(\)=1/,
  "execution audit must remain conditional on the successful write chain");

const db=new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys=ON");
db.exec(`
  CREATE TABLE tenants(id TEXT PRIMARY KEY);
  CREATE TABLE users(id TEXT PRIMARY KEY);
  CREATE TABLE agent_action_intents(
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    agent_key TEXT NOT NULL,
    action_key TEXT NOT NULL
  );
  CREATE TABLE agent_execution_grants(
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    status TEXT NOT NULL
  );
  CREATE TABLE agent_task_requests(
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    action_intent_id TEXT NOT NULL,
    execution_grant_id TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    approved_payload_hash TEXT,
    approved_by_user_id TEXT
  );
  CREATE TABLE synthetic_internal_tasks(id TEXT PRIMARY KEY);
  CREATE TABLE synthetic_execution_receipts(id TEXT PRIMARY KEY);
  CREATE TABLE synthetic_execution_audit(id TEXT PRIMARY KEY);
`);
db.exec(migration);

db.prepare("INSERT INTO tenants(id) VALUES(?)").run("t1");
db.prepare("INSERT INTO users(id) VALUES(?)").run("owner1");
db.prepare("INSERT INTO agent_execution_grants(id,tenant_id,status) VALUES(?,?,?)").run("g1","t1","active");
db.prepare("INSERT INTO agent_action_intents(id,tenant_id,agent_key,action_key) VALUES(?,?,?,?)").run("i1","t1","thebe","task.create");
db.prepare(`INSERT INTO agent_task_requests(
  id,tenant_id,action_intent_id,execution_grant_id,payload_hash,status,approved_payload_hash,approved_by_user_id
) VALUES(?,?,?,?,?,'approved',?,?)`).run("q1","t1","i1","g1","hash-1","hash-1","owner1");
db.prepare(`INSERT INTO agent_jit_execution_permits(
  id,tenant_id,agent_id,human_user_id,task_request_id,execution_grant_id,action_key,payload_hash,expires_at
) VALUES(?,?,'THEBE-001',?,?,?,'task.create',?,datetime('now','+4 minutes'))`)
  .run("p1","t1","owner1","q1","g1","hash-1");

const cancelled=db.prepare("UPDATE agent_task_requests SET status='cancelled' WHERE id=? AND tenant_id=? AND status IN ('prepared','approved')")
  .run("q1","t1");
assert.equal(Number(cancelled.changes),1,"owner cancellation must win exactly once");

let row=db.prepare("SELECT status,jit_permit_id FROM agent_task_requests WHERE id='q1'").get();
assert.equal(row.status,"cancelled");
assert.equal(row.jit_permit_id,null);
row=db.prepare("SELECT status,use_count FROM agent_jit_execution_permits WHERE id='p1'").get();
assert.equal(row.status,"active","cancellation may leave the short-lived permit for audit until expiry");
assert.equal(row.use_count,0,"cancellation must not consume the permit");

// Model executeTask losing a race after its read checks but before its guarded write.
const executeAfterCancel=db.prepare(`UPDATE agent_task_requests
  SET status='executed',jit_permit_id=?
  WHERE id=? AND tenant_id=? AND status='approved'
    AND approved_payload_hash=payload_hash AND approved_by_user_id=? AND jit_permit_id IS NULL`)
  .run("p1","q1","t1","owner1");
assert.equal(Number(executeAfterCancel.changes),0,
  "a late execute write must lose after cancellation instead of reviving the request");

// Mirror the production changes() chain: no guarded transition means no downstream writes.
db.prepare("INSERT INTO synthetic_internal_tasks(id) SELECT ? WHERE changes()=1").run("task-1");
db.prepare("INSERT INTO synthetic_execution_receipts(id) SELECT ? WHERE changes()=1").run("receipt-1");
db.prepare("INSERT INTO synthetic_execution_audit(id) SELECT ? WHERE changes()=1").run("audit-1");
assert.equal(db.prepare("SELECT COUNT(*) count FROM synthetic_internal_tasks").get().count,0,
  "late cancellation must suppress task creation");
assert.equal(db.prepare("SELECT COUNT(*) count FROM synthetic_execution_receipts").get().count,0,
  "late cancellation must suppress execution receipts");
assert.equal(db.prepare("SELECT COUNT(*) count FROM synthetic_execution_audit").get().count,0,
  "late cancellation must suppress execution audit side effects");

// Even a caller bypassing the application write predicate cannot move a cancelled request to executed.
assert.throws(
  ()=>db.prepare("UPDATE agent_task_requests SET status='executed',jit_permit_id=? WHERE id=?").run("p1","q1"),
  /agent_jit_permit_invalid_or_expired/,
  "the database boundary must independently reject cancelled-request execution"
);
row=db.prepare("SELECT status,jit_permit_id FROM agent_task_requests WHERE id='q1'").get();
assert.equal(row.status,"cancelled");
assert.equal(row.jit_permit_id,null);
row=db.prepare("SELECT status,use_count FROM agent_jit_execution_permits WHERE id='p1'").get();
assert.equal(row.status,"active");
assert.equal(row.use_count,0);

db.close();
console.log("v284 cancelled JIT request no-side-effect gate passed");
