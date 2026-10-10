import assert from "node:assert/strict";
import fs from "node:fs";
import {DatabaseSync} from "node:sqlite";

const source=fs.readFileSync("cloudflare/src/agentic-task-execution.js","utf8");
const migration=fs.readFileSync("cloudflare/migrations/064_v217_jit_execution_permits.sql","utf8");
const entry=fs.readFileSync("cloudflare/src/agentic-entry.js","utf8");
const profile=JSON.parse(fs.readFileSync("RELEASE_PROFILE.json","utf8"));
const runner=fs.readFileSync("scripts/migrate-production-v217-jit-execution-permits.mjs","utf8");
const workflow=fs.readFileSync(".github/workflows/migrate-production-v217-jit-execution-permits.yml","utf8");
const deploy=fs.readFileSync("cloudflare/deploy-free.sh","utf8");
const launch=fs.readFileSync("docs/LAUNCH.md","utf8");

assert.match(migration,/ALTER TABLE agent_task_requests ADD COLUMN jit_permit_id TEXT/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS agent_jit_execution_permits/);
assert.match(migration,/CHECK\(agent_id='THEBE-001'\)/);
assert.match(migration,/CHECK\(action_key='task\.create'\)/);
assert.match(migration,/CHECK\(max_uses=1\)/);
assert.match(migration,/CHECK\(datetime\(expires_at\)<=datetime\(created_at,'\+5 minutes'\)\)/);
assert.match(migration,/q\.approved_by_user_id=NEW\.human_user_id/);
assert.match(migration,/q\.approved_payload_hash=q\.payload_hash/);
assert.match(migration,/g\.status='active'/);
assert.match(migration,/CREATE TRIGGER IF NOT EXISTS agent_jit_execution_permits_consume_guard/);
assert.match(migration,/CREATE TRIGGER IF NOT EXISTS agent_task_requests_jit_execute_guard/);
assert.match(migration,/CREATE TRIGGER IF NOT EXISTS agent_task_requests_jit_consume/);
assert.match(migration,/agent_jit_permit_invalid_or_expired/);
assert.match(migration,/agent_jit_permit_consume_conflict/);

assert.match(source,/async function issueJitPermit/);
assert.match(source,/roleAllowed\(auth,"owner"\)/);
assert.match(source,/execution_session_disabled/);
assert.match(source,/same_owner_approval_required/);
assert.match(source,/Date\.now\(\)\+5\*60\*1000/);
assert.match(source,/jit_permit_already_issued/);
assert.match(source,/same_owner_execution_required/);
assert.match(source,/jit_permit_required/);
assert.match(source,/jit_permit_invalid_or_expired/);
assert.match(source,/String\(permit\.human_user_id\)!==String\(auth\.user_id\)/);
assert.match(source,/Number\(permit\.max_uses\)!==1/);
assert.match(source,/Number\(permit\.use_count\)!==0/);
assert.match(source,/SET status='executed',executed_at=CURRENT_TIMESTAMP,jit_permit_id=\?/);
assert.match(source,/jit-permit\$\/\)/);

const executeBody=source.slice(source.indexOf("async function executeTask"),source.indexOf("async function listTasks"));
assert.doesNotMatch(executeBody,/return json\(\{ok:true,replayed:true/,"consumed JIT permit retries must not become replay success");
assert.doesNotMatch(executeBody,/UPDATE agent_jit_execution_permits\s+SET\s+status='consumed'/i,"permit consumption must remain database-triggered and transaction-bound");
assert.match(executeBody,/jit_permit_already_consumed/);
assert.match(executeBody,/approved_by_user_id=\?/);

assert.match(profile.latest_cloudflare_migration,/^(?:065_v243_business_goal_observer|066_v285_agent_responsibilities|067_v286_customer_relationships|068_agent_cost_accounting)\.sql$/,"release tip must retain migration 065 or a reviewed successor through 067");
assert.equal(profile.jit_execution_permits_v217,true);
assert.equal(profile.jit_execution_permit_single_use,true);
assert.equal(profile.jit_execution_permit_same_owner_bound,true);
assert.equal(profile.jit_execution_permit_ttl_seconds,300);
assert.match(entry,/068_agent_cost_accounting\.sql/);
assert.match(entry,/agent_jit_execution_permits/);

assert.match(runner,/number:64/);
assert.match(runner,/064_v217_jit_execution_permits\.sql/);
assert.match(runner,/blob:'6d107f1d224aae9b3a7f4c24aec3bcf4940fa2e0'/);
assert.match(runner,/time_travel\/bookmark/);
assert.match(runner,/agent_task_requests_jit_execute_guard/);
assert.match(runner,/agent_task_requests_jit_consume/);
assert.match(runner,/foreign_key_check/);

assert.match(workflow,/\[migrate-064\]/);
assert.match(workflow,/thebe\/production-d1-064/);
assert.match(workflow,/migration authority must be a two-parent merged PR commit/);
assert.match(workflow,/migrate-production-v217-jit-execution-permits\.mjs/);

const step063=deploy.indexOf("migrations/063_v179_property_valuer_credential_binding.sql");
const step064=deploy.indexOf("migrations/064_v217_jit_execution_permits.sql");
assert.ok(step063>=0&&step064>step063,"fresh D1 deploy sequence must preserve migration 063 before migration 064");
assert.match(deploy,/Current reviewed schema delta: 068_agent_cost_accounting\.sql/);
assert.match(launch,/`065_v243_business_goal_observer\.sql`/,"launch chain must retain migration 065");
assert.match(launch,/`066_v285_agent_responsibilities\.sql`/,"launch chain must retain migration 066");
assert.match(launch,/through `068_agent_cost_accounting\.sql`/,"launch release tip must advance to migration 067");
assert.match(launch,/\[migrate-064\]/);

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

const insTenant=db.prepare("INSERT INTO tenants(id) VALUES(?)");
const insUser=db.prepare("INSERT INTO users(id) VALUES(?)");
insTenant.run("t1");
insUser.run("owner1");
insUser.run("owner2");
db.prepare("INSERT INTO agent_action_intents(id,tenant_id,agent_key,action_key) VALUES(?,?,?,?)").run("i1","t1","thebe","task.create");
db.prepare("INSERT INTO agent_execution_grants(id,tenant_id,status) VALUES(?,?,?)").run("g1","t1","active");

const insertRequest=db.prepare(`INSERT INTO agent_task_requests(
  id,tenant_id,action_intent_id,execution_grant_id,payload_hash,status,approved_payload_hash,approved_by_user_id
) VALUES(?,?,?,?,?,'approved',?,?)`);
const insertPermit=db.prepare(`INSERT INTO agent_jit_execution_permits(
  id,tenant_id,agent_id,human_user_id,task_request_id,execution_grant_id,action_key,payload_hash,expires_at
) VALUES(?,?,'THEBE-001',?,?,?,'task.create',?,datetime('now','+4 minutes'))`);

insertRequest.run("q1","t1","i1","g1","hash-1","hash-1","owner1");
insertPermit.run("p1","t1","owner1","q1","g1","hash-1");
db.prepare("UPDATE agent_task_requests SET status='executed',jit_permit_id=? WHERE id=?").run("p1","q1");

let row=db.prepare("SELECT status,jit_permit_id FROM agent_task_requests WHERE id='q1'").get();
assert.equal(row.status,"executed");
assert.equal(row.jit_permit_id,"p1");
row=db.prepare("SELECT status,use_count,consumed_by_user_id FROM agent_jit_execution_permits WHERE id='p1'").get();
assert.equal(row.status,"consumed");
assert.equal(row.use_count,1);
assert.equal(row.consumed_by_user_id,"owner1");

// A consumed single-use permit cannot execute a second request or replay its own.
assert.throws(
  ()=>db.prepare("UPDATE agent_task_requests SET status='executed',jit_permit_id=? WHERE id=?").run("p1","q1"),
  /agent_jit_permit_invalid_or_expired/
);
assert.equal(db.prepare("SELECT use_count FROM agent_jit_execution_permits WHERE id='p1'").get().use_count,1);

db.prepare("INSERT INTO agent_action_intents(id,tenant_id,agent_key,action_key) VALUES(?,?,?,?)").run("i2","t1","thebe","task.create");
insertRequest.run("q2","t1","i2","g1","hash-2","hash-2","owner1");
assert.throws(
  ()=>insertPermit.run("p2-wrong-owner","t1","owner2","q2","g1","hash-2"),
  /agent_jit_permit_request_mismatch/
);
assert.equal(db.prepare("SELECT COUNT(*) count FROM agent_jit_execution_permits WHERE task_request_id='q2'").get().count,0);

insertPermit.run("p2","t1","owner1","q2","g1","hash-2");
db.prepare("UPDATE agent_execution_grants SET status='revoked' WHERE id='g1'").run();
assert.throws(
  ()=>db.prepare("UPDATE agent_task_requests SET status='executed',jit_permit_id=? WHERE id=?").run("p2","q2"),
  /agent_jit_permit_invalid_or_expired/
);
row=db.prepare("SELECT status,jit_permit_id FROM agent_task_requests WHERE id='q2'").get();
assert.equal(row.status,"approved");
assert.equal(row.jit_permit_id,null);
row=db.prepare("SELECT status,use_count FROM agent_jit_execution_permits WHERE id='p2'").get();
assert.equal(row.status,"active");
assert.equal(row.use_count,0);

assert.throws(
  ()=>db.prepare("UPDATE agent_jit_execution_permits SET status='consumed',use_count=1,consumed_at=CURRENT_TIMESTAMP,consumed_by_user_id='owner2' WHERE id='p2'").run(),
  /agent_jit_permit_invalid_consume/
);
row=db.prepare("SELECT status,use_count FROM agent_jit_execution_permits WHERE id='p2'").get();
assert.equal(row.status,"active");
assert.equal(row.use_count,0);

// A consumed permit cannot be reassigned to a different approved request.
db.prepare("UPDATE agent_execution_grants SET status='active' WHERE id='g1'").run();
db.prepare("INSERT INTO agent_action_intents(id,tenant_id,agent_key,action_key) VALUES(?,?,?,?)").run("i3","t1","thebe","task.create");
insertRequest.run("q3","t1","i3","g1","hash-3","hash-3","owner1");
assert.throws(
  ()=>db.prepare("UPDATE agent_task_requests SET status='executed',jit_permit_id=? WHERE id=?").run("p1","q3"),
  /agent_jit_permit_invalid_or_expired/
);
assert.equal(db.prepare("SELECT status,jit_permit_id FROM agent_task_requests WHERE id='q3'").get().status,"approved");
assert.equal(db.prepare("SELECT jit_permit_id FROM agent_task_requests WHERE id='q3'").get().jit_permit_id,null);
assert.equal(db.prepare("SELECT use_count FROM agent_jit_execution_permits WHERE id='p1'").get().use_count,1);

// Atomicity: a batch execution must not consume a valid permit if another
// request in the same statement has a revoked grant.
db.prepare("INSERT INTO agent_execution_grants(id,tenant_id,status) VALUES(?,?,?)").run("g2","t1","active");
for(const [id,intent,hash] of [["q4","i4","hash-4"],["q5","i5","hash-5"]]){
  db.prepare("INSERT INTO agent_action_intents(id,tenant_id,agent_key,action_key) VALUES(?,?,?,?)").run(intent,"t1","thebe","task.create");
  insertRequest.run(id,"t1",intent,"g2",hash,hash,"owner1");
  insertPermit.run("p"+id.slice(1),"t1","owner1",id,"g2",hash);
}
db.prepare("UPDATE agent_execution_grants SET status='revoked' WHERE id='g2'").run();
assert.throws(
  ()=>db.prepare("UPDATE agent_task_requests SET status='executed',jit_permit_id=CASE id WHEN 'q4' THEN 'p4' ELSE 'p5' END WHERE id IN ('q4','q5')").run(),
  /agent_jit_permit_invalid_or_expired/
);
for(const id of ["4","5"]){
  const request=db.prepare("SELECT status,jit_permit_id FROM agent_task_requests WHERE id=?").get("q"+id);
  const permit=db.prepare("SELECT status,use_count FROM agent_jit_execution_permits WHERE id=?").get("p"+id);
  assert.equal(request.status,"approved");
  assert.equal(request.jit_permit_id,null);
  assert.equal(permit.status,"active");
  assert.equal(permit.use_count,0);
}

// An approval cannot be reused after its request payload changes.
db.prepare("INSERT INTO agent_action_intents(id,tenant_id,agent_key,action_key) VALUES(?,?,?,?)").run("i6","t1","thebe","task.create");
insertRequest.run("q6","t1","i6","g1","hash-6","hash-6","owner1");
insertPermit.run("p6","t1","owner1","q6","g1","hash-6");
db.prepare("UPDATE agent_task_requests SET payload_hash='tampered-6' WHERE id='q6'").run();
assert.throws(
  ()=>db.prepare("UPDATE agent_task_requests SET status='executed',jit_permit_id='p6' WHERE id='q6'").run(),
  /agent_jit_permit_invalid_or_expired/
);
assert.equal(db.prepare("SELECT status FROM agent_task_requests WHERE id='q6'").get().status,"approved");
assert.equal(db.prepare("SELECT use_count FROM agent_jit_execution_permits WHERE id='p6'").get().use_count,0);

db.close();
console.log("v217 JIT execution permit adversarial gate passed");
