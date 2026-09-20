import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("public/js/owner-command-centre.js","utf8");

assert.match(source,/\/api\/agentic\/task-execution\/status/);
assert.match(source,/Bounded execution · unavailable/);
assert.match(source,/Bounded execution · kill switch/);
assert.match(source,/Bounded execution · ON/);
assert.match(source,/Bounded execution · OFF/);
assert.match(source,/activeExecutionGrants/);
assert.match(source,/openTasks/);
assert.match(source,/owner-approved grant/);
assert.match(source,/Runtime Guard/);
assert.match(source,/high-impact actions remain human-only/i);

// This surface is observability-only. Activation and mutation controls must not
// be introduced into the Owner Command Centre implicitly.
assert.doesNotMatch(source,/\/api\/agentic\/task-execution\/grants["`]/);
assert.doesNotMatch(source,/\/api\/agentic\/task-execution\/prepare["`]/);
assert.doesNotMatch(source,/task-execution\/requests\/.*\/approve/);
assert.doesNotMatch(source,/task-execution\/requests\/.*\/execute/);

console.log("v98 owner agent control-plane observability: PASS");
