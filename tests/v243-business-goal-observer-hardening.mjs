import assert from "node:assert/strict";
import fs from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {BUSINESS_GOAL_OBSERVER_AGENT_ID,FINANCE_OBSERVER_AGENT_ID} from "../cloudflare/src/agent-control-plane.js";
import {__agentReadToolsTest} from "../cloudflare/src/agent-read-tools.js";

const migration=fs.readFileSync("cloudflare/migrations/065_v243_business_goal_observer.sql","utf8");
const loop=fs.readFileSync("cloudflare/src/business-goal-durable-loop.js","utf8");
const entry=fs.readFileSync("cloudflare/src/agentic-entry.js","utf8");
const engine=fs.readFileSync("cloudflare/src/agentic-persistent-tasks.js","utf8");
const runner=fs.readFileSync("scripts/migrate-production-v243-business-goal-observer.mjs","utf8");
const workflow=fs.readFileSync(".github/workflows/migrate-production-v243-business-goal-observer.yml","utf8");
const profile=JSON.parse(fs.readFileSync("RELEASE_PROFILE.json","utf8"));

assert.equal(BUSINESS_GOAL_OBSERVER_AGENT_ID,"SYS-BIZ-OBS-001");
assert.equal(FINANCE_OBSERVER_AGENT_ID,"SYS-FIN-OBS-001");

const {systemObserverIdentityAllowed}=__agentReadToolsTest;
const fin={role:"system_observer",systemActor:true,agentId:FINANCE_OBSERVER_AGENT_ID};
const biz={role:"system_observer",systemActor:true,agentId:BUSINESS_GOAL_OBSERVER_AGENT_ID};
assert.equal(systemObserverIdentityAllowed("financial_position.read",fin),true);
assert.equal(systemObserverIdentityAllowed("compliance_status.read",fin),false,
  "Finance observer must not silently widen into compliance observation");
assert.equal(systemObserverIdentityAllowed("daily_operations_summary.read",fin),false,
  "Finance observer must not silently widen into operations observation");
for(const action of [
  "business_health.read","financial_position.read","finance_data_quality.read",
  "finance_daily_inflows.read","receivables_summary.read","compliance_status.read","daily_operations_summary.read"
])assert.equal(systemObserverIdentityAllowed(action,biz),true,action+" must be available to the bounded business-goal observer");
assert.equal(systemObserverIdentityAllowed("receivables_customer.read",biz),false,
  "background observer must not perform parameterized customer lookup");
assert.equal(systemObserverIdentityAllowed("financial_position.read",{role:"system_observer",systemActor:true,agentId:"unknown"}),false);

assert.match(loop,/BUSINESS_GOAL_OBSERVER_AGENT_ID/);
assert.doesNotMatch(loop,/FINANCE_OBSERVER_AGENT_ID/);
assert.match(loop,/executionAllowed:false,externalActions:0/);
assert.match(entry,/065_v243_business_goal_observer\.sql/);
assert.match(entry,/agent_id='SYS-BIZ-OBS-001'/);
assert.match(entry,/execution_capable=0/);
assert.match(engine,/business_goal_duplicate_active/);

assert.match(migration,/'SYS-BIZ-OBS-001','business_goal_observer','system_observer'/);
assert.match(migration,/'low','active',0,'platform'/);
assert.match(migration,/trg_business_goal_no_duplicate_insert/);
assert.match(migration,/trg_business_goal_no_duplicate_update/);
assert.match(migration,/CASE WHEN json_valid\(NEW\.trigger_spec_json\) THEN NEW\.trigger_spec_json ELSE '\{\}' END/,
  "duplicate trigger must safely contain malformed legacy task JSON");
assert.match(migration,/CASE WHEN json_valid\(t\.trigger_spec_json\) THEN t\.trigger_spec_json ELSE '\{\}' END/,
  "duplicate lookup must safely contain malformed legacy stored JSON");
assert.doesNotMatch(migration,/execution_capable[^\n]*1/);

const db=new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE agent_registry(
    agent_id TEXT PRIMARY KEY,
    canonical_name TEXT NOT NULL UNIQUE,
    actor_type TEXT NOT NULL,
    purpose TEXT NOT NULL,
    risk_tier TEXT NOT NULL,
    authority_state TEXT NOT NULL,
    execution_capable INTEGER NOT NULL,
    owner_scope TEXT NOT NULL
  );
  CREATE TABLE agent_persistent_tasks(
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    status TEXT NOT NULL,
    trigger_kind TEXT NOT NULL,
    trigger_spec_json TEXT NOT NULL
  );
`);
db.exec(migration);
const observer=db.prepare("SELECT * FROM agent_registry WHERE agent_id=?").get("SYS-BIZ-OBS-001");
assert.equal(observer.canonical_name,"business_goal_observer");
assert.equal(observer.actor_type,"system_observer");
assert.equal(observer.authority_state,"active");
assert.equal(observer.execution_capable,0);

const insert=db.prepare("INSERT INTO agent_persistent_tasks(id,tenant_id,status,trigger_kind,trigger_spec_json) VALUES(?,?,?,?,?)");
insert.run("g1","tenant-a","active","scheduled",JSON.stringify({templateKey:"protect_cash"}));
assert.throws(()=>insert.run("g2","tenant-a","paused","scheduled",JSON.stringify({templateKey:"protect_cash"})),/duplicate_business_goal/);
insert.run("g3","tenant-b","active","scheduled",JSON.stringify({templateKey:"protect_cash"}));
insert.run("g4","tenant-a","cancelled","scheduled",JSON.stringify({templateKey:"protect_cash"}));
assert.throws(()=>db.prepare("UPDATE agent_persistent_tasks SET status='paused' WHERE id='g4'").run(),/duplicate_business_goal/);
insert.run("legacy-invalid","tenant-a","cancelled","scheduled","{not-json");
assert.doesNotThrow(()=>db.prepare("UPDATE agent_persistent_tasks SET status='paused' WHERE id='legacy-invalid'").run(),
  "duplicate guards must not turn malformed legacy JSON into a database-wide update failure");

assert.equal(profile.latest_cloudflare_migration,"065_v243_business_goal_observer.sql");
assert.equal(profile.business_goal_observer_v243,true);
assert.equal(profile.business_goal_observer_agent_id,"SYS-BIZ-OBS-001");
assert.equal(profile.business_goal_observer_execution_capable,false);
assert.equal(profile.business_goal_duplicate_guard_db_enforced,true);

assert.match(runner,/number:65/);
assert.match(runner,/065_v243_business_goal_observer\.sql/);
assert.match(runner,/blob:'df826bdf93143e52de4c12f1b90f2a9ef4dbbd35'/);
assert.match(runner,/verifyNoActiveGoalDuplicates/);
assert.match(runner,/HAVING COUNT\(\*\)>1/);
assert.match(runner,/existing active\/paused business-goal duplicates require reconciliation before migration/);
assert.match(runner,/time_travel\/bookmark/);
assert.match(runner,/SYS-BIZ-OBS-001/);
assert.match(workflow,/\[migrate-065\]/);
assert.match(workflow,/thebe\/production-d1-065/);
assert.match(workflow,/migration authority must be a two-parent merged PR commit/);

console.log("PASS: V243 gives business goals a dedicated canonical non-execution observer and database duplicate guards.");
