import assert from "node:assert/strict";
import {BUSINESS_GOAL_TEMPLATES,businessGoalTemplate,buildBusinessGoalTask} from "../cloudflare/src/business-goals.js";

assert.deepEqual(Object.keys(BUSINESS_GOAL_TEMPLATES),["protect_cash","grow_sales","stay_compliant","watch_operations","protect_property","morning_brief"]);
assert.equal(businessGoalTemplate("unknown"),null);

for(const key of Object.keys(BUSINESS_GOAL_TEMPLATES)){
  const built=buildBusinessGoalTask({templateKey:key,cadence:"daily",maxToolCallsPerRun:999});
  assert.ok(!built.error,key+" must normalize");
  assert.equal(built.payload.executionAllowed,false);
  assert.equal(built.payload.riskPolicy.externalActions,false);
  assert.equal(built.payload.riskPolicy.highImpactActions,"human_only");
  assert.equal(built.payload.approvalPolicy.consequentialActions,"owner_required");
  assert.equal(built.payload.budget.maxExternalActions,0);
  assert.equal(built.payload.budget.maxToolCallsPerRun,8);
  assert.ok(built.payload.allowedTools.length>0);
}
const custom=buildBusinessGoalTask({templateKey:"protect_cash",objective:"  Keep cash above the owner buffer.  ",maxToolCallsPerRun:-2});
assert.equal(custom.payload.objective,"Keep cash above the owner buffer.");
assert.equal(custom.payload.budget.maxToolCallsPerRun,1);
assert.equal(buildBusinessGoalTask({templateKey:"browser_everything"}).error,"invalid_business_goal_template");
console.log("V235_BUSINESS_GOALS_PASS");
