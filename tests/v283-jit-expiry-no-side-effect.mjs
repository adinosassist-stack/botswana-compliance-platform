import assert from "node:assert/strict";
import fs from "node:fs";
import {DatabaseSync} from "node:sqlite";

const source=fs.readFileSync(new URL("../cloudflare/src/agentic-task-execution.js",import.meta.url),"utf8");
const migration=fs.readFileSync(new URL("../cloudflare/migrations/064_v217_jit_execution_permits.sql",import.meta.url),"utf8");

const executeStart=source.indexOf("async function executeTask");
const executeEnd=source.indexOf("async function listTasks",executeStart);
assert.ok(executeStart>=0&&executeEnd>executeStart,"executeTask must remain present");
const executeBody=source.slice(executeStart,executeEnd);

const batchIndex=executeBody.indexOf("await env.DB.batch([");
const requestUpdateIndex=executeBody.indexOf("UPDATE agent_task_requests",batchIndex);
const taskInsertIndex=executeBody.indexOf("INSERT INTO agent_internal_tasks",batchIndex);
const receiptInsertIndex=executeBody.indexOf("INSERT INTO agent_execution_receipts",batchIndex);
const auditInsertIndex=executeBody.indexOf("'AGENT_TASK_EXECUTED'",batchIndex);
assert.ok(batchIndex>=0,"execution writes must stay inside one D1 batch");
assert.ok(requestUpdateIndex>batchIndex,"permit-guarded request transition must be the first execution write boundary");
assert.ok(taskInsertIndex>requestUpdateIndex,"task side effect must follow the permit-guarded request transition");
assert.ok(receiptInsertIndex>taskInsertIndex,"execution receipt must follow task creation");
assert.ok(auditInsertIndex>receiptInsertIndex,"execution audit must follow receipt creation");
assert.match(executeBody.slice(taskInsertIndex,receiptInsertIndex),/WHERE changes\(\)=1/,
  "task creation must be conditional on the guarded request transition changing exactly one row");
assert.match(executeBody.slice(receiptInsertIndex,auditInsertIndex),/WHERE changes\(\)=1/,
  "receipt creation must remain conditional on the preceding execution write");

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
`);
db.exec(migration);

db.prepare("INSERT INTO tenants(id) VALUES(?)").run("t1");
db.prepare("INSERT INTO users(id) VALUES(?)").run("owner1");
db.prepare("INSERT INTO agent_execution_grants(id,tenant_id,status) VALUES(?,?,?)").run("g1","t1","active");
db.prepare("INSERT INTO agent_action_intents(id,tenant_id,agent_key,action_key) VALUES(?,?,?,?)").run("i1","t1","thebe","task.create");
db.prepare(`INSERT INTO agent_task_requests(
  id,tenant_id,action_intent_id,execution_grant_id,payload_hash,status,approved_payload_hash,approved_by_user_id
) VALUES(?,?,?,?,?,'approved',?,?)`).run("q1","t1","i1","g1","hash-1","hash-1","owner1");

// Model a permit that was valid when issued but is expired by execution time.
// The table intentionally allows retaining expired rows for audit; execution must fail closed.
db.prepare(`INSERT INTO agent_jit_execution_permits(
  id,tenant_id,agent_id,human_user_id,task_request_id,execution_grant_id,action_key,payload_hash,expires_at,created_at
) VALUES(?,?,'THEBE-001',?,?,?,'task.create',?,datetime('now','-1 minute'),datetime('now','-2 minutes'))`)
  .run("p-expired","t1","owner1","q1","g1","hash-1");

assert.throws(
  ()=>db.prepare("UPDATE agent_task_requests SET status='executed',jit_permit_id=? WHERE id=?").run("p-expired","q1"),
  /agent_jit_permit_invalid_or_expired/,
  "an expired permit must fail at the database execution boundary"
);

let row=db.prepare("SELECT status,jit_permit_id FROM agent_task_requests WHERE id='q1'").get();
assert.equal(row.status,"approved","expired permit failure must not execute the request");
assert.equal(row.jit_permit_id,null,"expired permit failure must not attach a permit to the request");
row=db.prepare("SELECT status,use_count,consumed_at,consumed_by_user_id FROM agent_jit_execution_permits WHERE id='p-expired'").get();
assert.equal(row.status,"active","expired permit failure must not mutate permit status");
assert.equal(row.use_count,0,"expired permit failure must not consume a use");
assert.equal(row.consumed_at,null,"expired permit failure must not stamp a consumption time");
assert.equal(row.consumed_by_user_id,null,"expired permit failure must not stamp a consumer");

assert.throws(
  ()=>db.prepare("UPDATE agent_jit_execution_permits SET status='consumed',use_count=1,consumed_at=CURRENT_TIMESTAMP,consumed_by_user_id='owner1' WHERE id='p-expired'").run(),
  /agent_jit_permit_invalid_consume/,
  "an expired permit must not be manually consumable after expiry"
);
row=db.prepare("SELECT status,use_count FROM agent_jit_execution_permits WHERE id='p-expired'").get();
assert.equal(row.status,"active","failed consume must preserve active audit state");
assert.equal(row.use_count,0,"failed consume must preserve zero use count");

db.close();
console.log("v283 expired JIT permit no-side-effect gate passed");
