import assert from "node:assert/strict";
import fs from "node:fs";

const migration=fs.readFileSync("cloudflare/migrations/055_v149_agent_control_plane.sql","utf8");

for(const required of [
  "CREATE TABLE IF NOT EXISTS agent_registry",
  "CREATE TABLE IF NOT EXISTS agent_authority_events",
  "CREATE TABLE IF NOT EXISTS agent_authority_drift_findings",
  "'THEBE-001','thebe','agent'",
  "'SYS-FIN-OBS-001','system_observer','system_observer'",
  "CHECK(authority_state IN ('active','restricted','suspended','revoked'))",
  "trg_agent_registry_no_execution_escalation",
  "trg_agent_registry_revoked_terminal"
]) assert.ok(migration.includes(required),`missing control-plane contract: ${required}`);

assert.match(migration,/THEBE-001[\s\S]*?'restricted',0,'platform'/);
assert.match(migration,/SYS-FIN-OBS-001[\s\S]*?'restricted',0,'platform'/);
assert.doesNotMatch(migration,/payment\.execute|journal\.post|filing\.submit|employment\.terminate/);


const execution=fs.readFileSync("cloudflare/src/agentic-task-execution.js","utf8");
for(const required of [
  "canonicalAgentAuthority",
  "authorityPermitsExecution",
  "agent_authority_contained",
  "AGENT_EXECUTION_CONTAINED",
  'state==="active"',
  "executionCapable===true"
]) assert.ok(execution.includes(required),`missing runtime containment contract: ${required}`);
assert.match(execution,/sessionExecutionEnabled\(env,auth\)&&authorityPermitsExecution\(canonicalAuthority\)/);
assert.match(execution,/if\(!authorityPermitsExecution\(canonicalAuthority\)\)/);

console.log("v149 agent control-plane schema + runtime containment contract passed");
