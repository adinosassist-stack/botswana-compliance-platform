import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("public/js/owner-command-centre.js","utf8");

assert.match(source,/\/api\/agentic\/task-execution\/status/);
assert.match(source,/Bounded execution · unavailable/);
assert.match(source,/Bounded execution · kill switch/);
assert.match(source,/Bounded execution · ON/);
assert.match(source,/Bounded execution · OFF/);
assert.match(source,/activeExecutionGrants/);
assert.match(source,/activeGrants/);
assert.match(source,/openTasks/);
assert.match(source,/owner-approved grant/);
assert.match(source,/Runtime Guard/);
assert.match(source,/high-impact actions remain human-only/i);

// The control plane now supports the reviewed bounded task lifecycle.
assert.match(source,/\/api\/agentic\/authority\/delegations/);
assert.match(source,/\/api\/agentic\/task-execution\/grants/);
assert.match(source,/\/api\/agentic\/task-execution\/prepare/);
assert.match(source,/task-execution\/requests\/.*\/approve/);
assert.match(source,/task-execution\/requests\/.*\/cancel/);
assert.match(source,/task-execution\/requests\/.*\/execute/);

// Browser UI must never toggle the platform execution switch itself.
assert.doesNotMatch(source,/AGENT_BOUNDED_TASK_EXECUTION_ENABLED/);
assert.doesNotMatch(source,/globalExecutionEnabled\s*[:=]\s*true/);
assert.match(source,/if\(executionEnabled&&role\(\)==="owner"\)/);
assert.match(source,/platform execution switch is unchanged/i);
assert.match(source,/Execute control stays hidden until the platform switch is enabled/i);

console.log("v98 owner agent control-plane governed lifecycle: PASS");
