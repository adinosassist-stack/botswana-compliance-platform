import assert from "node:assert/strict";
import fs from "node:fs";
import {createHash} from "node:crypto";

const migrationPath="cloudflare/migrations/056_v154_agent_control_plane.sql";
const migration=fs.readFileSync(migrationPath,"utf8");
const runner=fs.readFileSync("scripts/migrate-production-v154-agent-control-plane.mjs","utf8");
const workflow=fs.readFileSync(".github/workflows/migrate-production-v154-agent-control-plane.yml","utf8");

const blobSha=createHash("sha1")
  .update("blob "+Buffer.byteLength(migration)+"\0")
  .update(migration)
  .digest("hex");

assert.equal(blobSha,"86d033543e5eb47ec2da3fd5e4e44e82e25ec5cd");
assert.match(runner,new RegExp("expectedGitBlobSha='"+blobSha+"'"));
assert.match(runner,/time_travel\/bookmark/);
assert.match(runner,/splitSqliteMigrationStatements/);
assert.match(runner,/PRAGMA foreign_key_check/);
assert.match(runner,/agent_persistent_tasks_scheduler_due/);
assert.match(runner,/uq_agent_observation_checkpoint_occurrence/);
for(const name of [
  "agent_registry","agent_authority_events","agent_authority_drift_findings",
  "idx_agent_authority_events_agent_created","idx_agent_authority_drift_agent_status","uq_agent_authority_drift_open",
  "trg_agent_registry_identity_immutable","trg_agent_registry_no_execution_escalation","trg_agent_registry_revoked_terminal",
  "THEBE-001","SYS-FIN-OBS-001"
])assert.ok(runner.includes(name),`runner missing ${name}`);
assert.match(runner,/OLD\\.execution_capable=0 AND NEW\\.execution_capable=1/);
assert.match(runner,/OLD\\.authority_state='revoked'/);
assert.doesNotMatch(runner,/UPDATE agent_registry SET authority_state='active'/);
assert.doesNotMatch(runner,/DELETE FROM agent_registry/);

assert.match(workflow,/contains\(github\.event\.head_commit\.message, '\[migrate-056\]'\)/);
assert.match(workflow,/environment: production/);
assert.match(workflow,/migrate-production-v154-agent-control-plane\.mjs/);
assert.match(workflow,/two-parent merged PR commit/);
assert.match(workflow,/current-main merged-PR authority/);
assert.match(workflow,/https:\/\/thebedesk\.com\/api\/ready/);
assert.doesNotMatch(workflow,/wrangler.*deploy/i);

console.log("v156 production migration 056 guard and rollback contract passed");
