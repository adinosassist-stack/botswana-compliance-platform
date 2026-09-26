import assert from "node:assert/strict";import fs from "node:fs";import os from "node:os";import path from "node:path";import {execFileSync} from "node:child_process";
const files=["cloudflare/schema.sql","cloudflare/migrations/047_v81_delegated_authority.sql","cloudflare/migrations/048_v102_bounded_internal_task_execution.sql","cloudflare/migrations/049_v108_finance_receivables.sql","cloudflare/migrations/050_v115_manual_bank_subscriptions.sql","cloudflare/migrations/051_v117_persistent_agent_tasks.sql","cloudflare/migrations/052_v122_agent_observation_checkpoints.sql","cloudflare/migrations/053_v132_agent_observation_claims.sql","cloudflare/migrations/054_v134_agent_observation_identity.sql","cloudflare/migrations/055_v151_finance_watch_scheduler_isolation.sql"];
for(const file of files)assert.ok(fs.existsSync(file),`missing bootstrap file: ${file}`);
const db=path.join(os.tmpdir(),`thebe-bootstrap-${process.pid}.sqlite`);
try{
  for(const file of files)execFileSync("sqlite3",[db],{input:fs.readFileSync(file),stdio:["pipe","pipe","pipe"]});
  const q=sql=>execFileSync("sqlite3",[db,sql],{encoding:"utf8"}).trim();
  for(const table of ["agent_persistent_tasks","agent_persistent_task_events","agent_observation_checkpoints","agent_observation_claims","manual_payment_submissions","manual_payment_events","agent_registry","agent_authority_events","agent_authority_drift_findings"])assert.equal(q(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='${table}'`),"1",`missing table ${table}`);
  const cols=q("PRAGMA table_info(agent_observation_checkpoints)").split("\n");assert.ok(cols.some(x=>x.includes("|scheduled_for|")),"scheduled_for missing");
  assert.equal(q("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='uq_agent_observation_checkpoint_occurrence'"),"1");
  assert.equal(q("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='agent_persistent_tasks_scheduler_due'"),"1");
  assert.equal(q("SELECT authority_state||\":\"||execution_capable FROM agent_registry WHERE agent_id=\'THEBE-001\'"),"active:1");
  assert.equal(q("SELECT authority_state||\":\"||execution_capable FROM agent_registry WHERE agent_id=\'SYS-FIN-OBS-001\'"),"active:0");
  assert.equal(q("PRAGMA foreign_keys"),"0");
  console.log("v141 fresh bootstrap smoke passed");
}finally{try{fs.unlinkSync(db)}catch{}}
