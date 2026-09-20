import assert from "node:assert/strict";
import fs from "node:fs";

const ui=fs.readFileSync("public/js/owner-command-centre.js","utf8");
const backend=fs.readFileSync("cloudflare/src/agentic-task-execution.js","utf8");

assert.match(ui,/maxAutonomyLevel:3/);
assert.match(ui,/maxDailyActions:5/);
assert.match(ui,/maxAmountMinor:0/);
assert.match(ui,/externalSideEffects:false/);
assert.match(ui,/Date\.now\(\)\+30\*86400000/);
assert.match(ui,/Approve separate execution grant/);
assert.match(ui,/Prepare task for exact approval/);
assert.match(ui,/Payload hash:/);
assert.match(ui,/Approve exact task/);
assert.match(ui,/Cancel/);
assert.match(ui,/idempotencyKey:newId\("task_prepare"\)/);
assert.match(ui,/Use as internal task draft/);
assert.match(ui,/request\("\/api\/agentic\/task-execution\/requests"\)/);
assert.match(ui,/request\("\/api\/agentic\/task-execution\/tasks"\)/);
assert.match(ui,/if\(executionEnabled&&role\(\)==="owner"\)/);
assert.match(ui,/Execute control stays hidden until the platform switch is enabled/);
assert.doesNotMatch(ui,/AGENT_BOUNDED_TASK_EXECUTION_ENABLED/);
assert.doesNotMatch(ui,/payment\.execute/);
assert.doesNotMatch(ui,/government_filing\.submit/);

assert.match(backend,/async function listTaskRequests/);
assert.match(backend,/async function cancelTask/);
assert.match(backend,/AGENT_TASK_CANCELLED/);
assert.match(backend,/task_request_already_executed/);
assert.match(backend,/status IN \('prepared','approved'\)/);
assert.match(backend,/activeGrants/);
assert.match(backend,/runtimeKillSwitch/);
assert.match(backend,/globalExecutionEnabled/);
assert.match(backend,/evaluateAgentRuntimeGuard\(\{/);
assert.match(backend,/approvalPayloadHash:String\(row\.approved_payload_hash/);
assert.match(backend,/actionPayloadHash:String\(row\.payload_hash/);
assert.match(backend,/task_execution_verification_failed/);

console.log("v99 owner-approved bounded task UX: PASS");
