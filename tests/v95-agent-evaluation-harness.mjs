import assert from "node:assert/strict";
import fs from "node:fs";
import {AGENT_EVALUATION_SCENARIOS,AGENT_EVALUATION_SUITE_VERSION,runAgentEvaluationSuite} from "../cloudflare/src/agent-evaluation.js";

assert.match(AGENT_EVALUATION_SUITE_VERSION,/^2026-09-20\./);
assert.ok(AGENT_EVALUATION_SCENARIOS.length>=15,"evaluation suite must retain broad safety coverage");
assert.ok(AGENT_EVALUATION_SCENARIOS.some(item=>item.id.includes("prompt_injection")),"prompt-injection authority regression must be represented");
assert.ok(AGENT_EVALUATION_SCENARIOS.some(item=>item.id.includes("cross_tenant")),"cross-tenant authority regression must be represented");
assert.ok(AGENT_EVALUATION_SCENARIOS.some(item=>item.id.includes("stale_approval")),"stale approval regression must be represented");

const report=runAgentEvaluationSuite();
if(!report.pass){
  console.error(JSON.stringify(report.results.filter(item=>!item.pass),null,2));
}
assert.equal(report.pass,true);
assert.equal(report.failed,0);
assert.equal(report.falseAllows,0);
assert.equal(report.executionEscapes,0);
assert.equal(report.passed,report.total);

const guardSource=fs.readFileSync("cloudflare/src/agent-runtime-guard.js","utf8");
assert.doesNotMatch(guardSource,/\bfetch\s*\(/,"runtime guard must not depend on network calls");
assert.match(guardSource,/cross_tenant_forbidden/);
assert.match(guardSource,/runtime_kill_switch_active/);
assert.match(guardSource,/stale_approval_payload/);
assert.match(guardSource,/agent_budget_exceeded/);
assert.match(guardSource,/isNeverAutonomousAction/);

console.log(`v95 agent evaluation harness: ${report.passed}/${report.total} scenarios PASS`);
