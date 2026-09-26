import assert from "node:assert/strict";
import fs from "node:fs";
import {createHash} from "node:crypto";

const migrations=[
  ["cloudflare/migrations/051_v117_persistent_agent_tasks.sql","f05582d7dc9354710af43de2760e4786f8cab95c"],
  ["cloudflare/migrations/052_v122_agent_observation_checkpoints.sql","e1bfd2d73a372c880c905aabc77bd955198a12df"],
  ["cloudflare/migrations/053_v132_agent_observation_claims.sql","f88f71e3d49e54ceea5b4bdfd5278673c5e3c8ad"],
  ["cloudflare/migrations/054_v134_agent_observation_identity.sql","0d7cb2f2e4a90ea570d5dc5193c0507efbf00ab4"],
  ["cloudflare/migrations/055_v151_finance_watch_scheduler_isolation.sql","0b5ea933afa9299d535a50b99c1e4fb9041aa674"],
  ["cloudflare/migrations/056_v154_agent_control_plane.sql","86d033543e5eb47ec2da3fd5e4e44e82e25ec5cd"]
];
const runner=fs.readFileSync("scripts/migrate-production-v154-agent-control-plane.mjs","utf8");
const workflow=fs.readFileSync(".github/workflows/migrate-production-v154-agent-control-plane.yml","utf8");

for(const [path,expected] of migrations){
  const sql=fs.readFileSync(path,"utf8");
  const blob=createHash("sha1").update("blob "+Buffer.byteLength(sql)+"\0").update(sql).digest("hex");
  assert.equal(blob,expected,`reviewed migration blob mismatch for ${path}`);
  assert.ok(runner.includes(path),`runner missing ${path}`);
  assert.ok(runner.includes(expected),`runner missing blob pin for ${path}`);
}

assert.match(runner,/time_travel\/bookmark/);
assert.doesNotMatch(runner,/splitSqliteMigrationStatements|extractReviewedStatements/);
assert.match(runner,/spawnSync\(wrangler/);
assert.match(runner,/d1\W+execute\W+DB\W+--remote\W+--file\W+spec\.path/);
assert.match(runner,/expectedWranglerVersion='4\.135\.0'/);
assert.match(runner,/createWranglerContext/);
assert.match(runner,/database_id =/);
assert.match(runner,/PRAGMA foreign_key_check/);
assert.match(runner,/Migration 54 scheduled_for column already exists; skipping non-idempotent ALTER TABLE/);
assert.match(runner,/ALTER TABLE agent_observation_checkpoints ADD COLUMN scheduled_for TEXT/);
assert.match(runner,/CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_observation_checkpoint_occurrence/);
assert.match(runner,/for\(const \[spec,sql\] of loaded\)await applyStage\(spec,sql\)/);

for(const name of [
  "agent_persistent_tasks","agent_persistent_task_events",
  "agent_observation_checkpoints","agent_observation_claims",
  "uq_agent_observation_checkpoint_occurrence","agent_persistent_tasks_scheduler_due",
  "agent_registry","agent_authority_events","agent_authority_drift_findings",
  "trg_agent_registry_identity_immutable","trg_agent_registry_no_execution_escalation","trg_agent_registry_revoked_terminal",
  "THEBE-001","SYS-FIN-OBS-001"
])assert.ok(runner.includes(name),`runner missing ${name}`);
assert.doesNotMatch(runner,/UPDATE agent_registry SET authority_state='active'/);
assert.doesNotMatch(runner,/DELETE FROM agent_registry/);

assert.match(workflow,/contains\(github\.event\.head_commit\.message, '\[migrate-056\]'\)/);
assert.match(workflow,/environment: production/);
assert.match(workflow,/ordered catch-up migrations 051-056/);
assert.match(workflow,/Install exact migration toolchain/);
assert.match(workflow,/npm ci --ignore-scripts --no-audit --no-fund/);
assert.match(workflow,/wrangler --version \| grep -F '4\.135\.0'/);
assert.match(workflow,/migrate-production-v154-agent-control-plane\.mjs/);
assert.match(workflow,/two-parent merged PR commit/);
assert.match(workflow,/current-main merged-PR authority/);
assert.match(workflow,/https:\/\/thebedesk\.com\/api\/ready/);
assert.doesNotMatch(workflow,/wrangler.*deploy/i);

console.log("v156 production migrations 051-056 catch-up guard and rollback contract passed");
