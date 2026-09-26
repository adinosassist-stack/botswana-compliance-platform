import assert from "node:assert/strict";
import {buildReadOnlyFinanceWatchTask,planSuperAgentWork} from "../cloudflare/src/super-agent-planner.js";
import {validatePersistentTaskAllowedTools} from "../cloudflare/src/agent-tool-trust-registry.js";

const task=buildReadOnlyFinanceWatchTask({nextRunAt:"2026-09-26T06:00:00.000Z"});
assert.equal(task.executionAllowed,false);
assert.equal(task.riskPolicy.sideEffects,false);
assert.equal(task.budget.maxExternalActions,0);
assert.equal(task.triggerSpec.timezone,"Africa/Gaborone");
assert.equal(validatePersistentTaskAllowedTools(task.allowedTools).valid,true);

const plan=planSuperAgentWork({
  goal:"Watch cash certainty and overdue receivables.",
  persistentTask:{id:"finance-watch-1",allowedTools:[...task.allowedTools,"payment.execute","unknown.tool"]},
  observation:{finance:{reconciliationExceptions:2,latestReconciliationAt:null}}
});
assert.equal(plan.agentKey,"thebe");
assert.equal(plan.executionAllowed,false);
assert.equal(plan.authority,"none");
assert.equal(plan.checkpointRequired,true);
assert.equal(plan.verificationRequired,true);
assert.equal(plan.toolPlan.length,4);
assert.equal(plan.toolPlan.some(x=>x.actionKey==="payment.execute"),false);
assert.equal(plan.toolPlan.some(x=>x.actionKey==="unknown.tool"),false);
assert.equal(plan.toolPlan.every(x=>x.mode==="observe"&&x.externalSideEffect===false&&x.executionAllowed===false),true);
assert.equal(plan.orchestration.architecture,"single_agent");

console.log("v119 super agent finance watcher adversarial checks passed");
