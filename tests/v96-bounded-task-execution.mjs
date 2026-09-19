import assert from "node:assert/strict";
import fs from "node:fs";
import {AGENT_ACTION_CATALOG,evaluateAgentAction} from "../cloudflare/src/agent-policy.js";
import {evaluateAgentRuntimeGuard} from "../cloudflare/src/agent-runtime-guard.js";
import {__agenticTaskExecutionTest} from "../cloudflare/src/agentic-task-execution.js";

const task=AGENT_ACTION_CATALOG["task.create"];
assert.equal(task.phase1Enabled,false);
assert.equal(task.boundedExecutionEnabled,true);
assert.equal(task.externalSideEffect,false);

let policy=evaluateAgentAction({
  agentKey:"thebe",actionKey:"task.create",actorRole:"owner",tenantScoped:true,phase:"phase1"
});
assert.equal(policy.allowed,false);
assert.equal(policy.code,"action_not_enabled");

policy=evaluateAgentAction({
  agentKey:"thebe",actionKey:"task.create",actorRole:"owner",tenantScoped:true,phase:"bounded_v1"
});
assert.equal(policy.allowed,true);
assert.equal(policy.decision,"controlled_execute");
assert.equal(policy.code,"bounded_execution_policy");

const grant={
  id:"delegation-A",
  tenantId:"tenant-A",
  agentKey:"thebe",
  actionKey:"task.create",
  status:"active",
  maxAutonomyLevel:3,
  externalSideEffects:false,
  strongAuthRequired:false,
  humanConfirmationRequired:true,
  maxDailyActions:3,
  maxAmountMinor:null,
  shadowOnly:false
};
const base={
  agentKey:"thebe",
  actionKey:"task.create",
  actorRole:"owner",
  tenantScoped:true,
  tenantId:"tenant-A",
  actorTenantId:"tenant-A",
  targetTenantId:"tenant-A",
  agentStatus:"enabled",
  killSwitchActive:false,
  budgetStatus:"within_limit",
  approvalState:"approved",
  approvalPayloadHash:"same",
  actionPayloadHash:"same",
  delegation:grant,
  mode:"execute",
  amountMinor:0,
  dailyActionCount:0,
  phase:"bounded_v1"
};

let decision=evaluateAgentRuntimeGuard({...base,globalExecutionEnabled:false});
assert.equal(decision.allowed,false);
assert.equal(decision.executionAllowed,false);
assert.equal(decision.code,"execution_globally_disabled");

decision=evaluateAgentRuntimeGuard({...base,globalExecutionEnabled:true});
assert.equal(decision.allowed,true);
assert.equal(decision.executionAllowed,true);
assert.equal(decision.code,"runtime_execution_allowed");

decision=evaluateAgentRuntimeGuard({...base,globalExecutionEnabled:true,approvalPayloadHash:"old",actionPayloadHash:"new"});
assert.equal(decision.allowed,false);
assert.equal(decision.code,"stale_approval_payload");

decision=evaluateAgentRuntimeGuard({...base,globalExecutionEnabled:true,targetTenantId:"tenant-B"});
assert.equal(decision.allowed,false);
assert.equal(decision.code,"cross_tenant_forbidden");

decision=evaluateAgentRuntimeGuard({...base,globalExecutionEnabled:true,killSwitchActive:true});
assert.equal(decision.allowed,false);
assert.equal(decision.code,"runtime_kill_switch_active");

decision=evaluateAgentRuntimeGuard({...base,globalExecutionEnabled:true,dailyActionCount:3});
assert.equal(decision.allowed,false);
assert.equal(decision.code,"daily_action_limit_reached");

decision=evaluateAgentRuntimeGuard({...base,globalExecutionEnabled:true,delegation:{...grant,status:"revoked"}});
assert.equal(decision.allowed,false);
assert.equal(decision.code,"delegation_inactive");

decision=evaluateAgentRuntimeGuard({...base,globalExecutionEnabled:true,delegation:{...grant,shadowOnly:true}});
assert.equal(decision.allowed,false);
assert.equal(decision.code,"shadow_only_grant");

const normalized=__agenticTaskExecutionTest.normalizeTaskPayload({
  title:"  Follow up BURS filing  ",
  description:"Confirm supporting evidence.",
  priority:1,
  dueAt:"2026-09-30T10:00:00+02:00"
});
assert.equal(normalized.error,undefined);
assert.equal(normalized.payload.title,"Follow up BURS filing");
assert.equal(normalized.payload.priority,1);
assert.ok(normalized.payload.dueAt.endsWith("Z"));

assert.equal(__agenticTaskExecutionTest.normalizeTaskPayload({title:""}).error,"task_title_required");
assert.equal(__agenticTaskExecutionTest.normalizeTaskPayload({title:"x",priority:9}).error,"invalid_task_priority");
assert.equal(__agenticTaskExecutionTest.normalizeTaskPayload({title:"x",dueAt:"not-a-date"}).error,"invalid_task_due_at");
assert.equal(__agenticTaskExecutionTest.globalExecutionEnabled({}),false);
assert.equal(__agenticTaskExecutionTest.globalExecutionEnabled({AGENT_BOUNDED_TASK_EXECUTION_ENABLED:"1"}),true);
assert.equal(__agenticTaskExecutionTest.runtimeKillSwitch({AGENT_RUNTIME_KILL_SWITCH:"true"}),true);

const canonical=__agenticTaskExecutionTest.canonicalIntentPayload({
  payload:{title:"Task",description:null,priority:2,dueAt:null},
  runId:"run-1",proposalId:"proposal-1",humanConfirmed:false
});
assert.equal(canonical,JSON.stringify({
  agentKey:"thebe",actionKey:"task.create",amountMinor:0,humanConfirmed:false,
  runId:"run-1",proposalId:"proposal-1",
  metadata:{title:"Task",description:null,priority:2,dueAt:null}
}));

const migration=fs.readFileSync("cloudflare/migrations/048_v102_bounded_internal_task_execution.sql","utf8");
for(const table of ["agent_execution_grants","agent_task_requests","agent_internal_tasks","agent_execution_receipts"]){
  assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`),table);
}
assert.match(migration,/CHECK\(action_key='task\.create'\)/);
assert.match(migration,/agent_execution_grants_delegation_guard/);
assert.match(migration,/agent_task_requests_intent_guard/);
assert.match(migration,/agent_execution_receipts_tenant_guard/);
assert.doesNotMatch(migration,/payment\.execute/);
assert.doesNotMatch(migration,/government_filing\.submit/);
assert.match(migration,/d\.expires_at IS NULL OR d\.expires_at>CURRENT_TIMESTAMP/);
assert.match(migration,/t\.tenant_id=NEW\.tenant_id/);

const migrationRunner=fs.readFileSync("scripts/migrate-production-v102-bounded-task-execution.mjs","utf8");
assert.match(migrationRunner,/expectedGitBlobSha='c716b937a63e91a127bda5b3425cbd0b1e17c969'/);
assert.match(migrationRunner,/time_travel\/bookmark/);
assert.match(migrationRunner,/PRAGMA foreign_key_check/);

const migrationWorkflow=fs.readFileSync(".github/workflows/migrate-production-v102-bounded-task-execution.yml","utf8");
assert.match(migrationWorkflow,/contains\(github\.event\.head_commit\.message, '\[migrate-048\]'\)/);
assert.match(migrationWorkflow,/environment: production/);
assert.match(migrationWorkflow,/migrate-production-v102-bounded-task-execution\.mjs/);

const source=fs.readFileSync("cloudflare/src/agentic-task-execution.js","utf8");
assert.match(source,/AGENT_BOUNDED_TASK_EXECUTION_ENABLED/);
assert.match(source,/evaluateAgentRuntimeGuard\(\{/);
assert.match(source,/phase:"bounded_v1"/);
assert.match(source,/approvalPayloadHash:String\(row\.approved_payload_hash/);
assert.match(source,/actionPayloadHash:String\(row\.payload_hash/);
assert.match(source,/AGENT_TASK_EXECUTED/);
assert.match(source,/agent_execution_receipts/);
assert.match(source,/WHERE id=\? AND tenant_id=\?/);
assert.doesNotMatch(source,/payment\.execute/);
assert.doesNotMatch(source,/government_filing\.submit/);

const entry=fs.readFileSync("cloudflare/src/agentic-entry.js","utf8");
assert.match(entry,/handleAgenticTaskExecutionRequest/);
assert.match(entry,/048_v102_bounded_internal_task_execution\.sql/);
assert.match(entry,/agent_execution_receipts/);

console.log("v96 bounded internal task execution guard: PASS");
