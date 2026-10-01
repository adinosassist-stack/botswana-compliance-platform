import assert from "node:assert/strict";
import fs from "node:fs";
import {buildBusinessGoalTask,BUSINESS_GOAL_TEMPLATES} from "../cloudflare/src/business-goals.js";
import {__businessGoalDurableLoopTest} from "../cloudflare/src/business-goal-durable-loop.js";

const {validateBusinessGoalTask}=__businessGoalDurableLoopTest;

const morning=buildBusinessGoalTask({templateKey:"morning_brief",cadence:"daily"});
assert.ok(!morning.error,"morning brief must build");
assert.equal(morning.payload.allowedTools.length,BUSINESS_GOAL_TEMPLATES.morning_brief.allowedTools.length);
assert.equal(morning.payload.budget.maxToolCallsPerRun,morning.payload.allowedTools.length,
  "normal goal creation must size its default read budget to the pinned tool contract");
assert.equal(morning.payload.budget.maxExternalActions,0);

const explicit=buildBusinessGoalTask({templateKey:"protect_cash",maxToolCallsPerRun:1});
assert.equal(explicit.payload.budget.maxToolCallsPerRun,1,
  "explicit bounded budgets must preserve the historical V235 normalization contract");

const baseTask={
  id:"task-morning",
  tenant_id:"tenant-a",
  status:"active",
  next_run_at:"2026-10-01T08:00:00.000Z",
  trigger_spec_json:JSON.stringify({...morning.payload.triggerSpec,templateKey:"morning_brief",label:morning.payload.label}),
  allowed_tools_json:JSON.stringify(morning.payload.allowedTools)
};

const aligned=validateBusinessGoalTask({...baseTask,budget_json:JSON.stringify(morning.payload.budget)});
assert.equal(aligned.valid,true,"aligned budget must validate");
assert.equal(aligned.budgetAdjusted,false);

const legacy=validateBusinessGoalTask({...baseTask,budget_json:JSON.stringify({maxToolCallsPerRun:4,maxExternalActions:0})});
assert.equal(legacy.valid,true,"legacy undersized read budgets must remain recoverable");
assert.equal(legacy.budgetAdjusted,true);
assert.equal(legacy.budget.maxToolCallsPerRun,morning.payload.allowedTools.length);

const external=validateBusinessGoalTask({...baseTask,budget_json:JSON.stringify({maxToolCallsPerRun:8,maxExternalActions:1})});
assert.equal(external.code,"business_goal_external_action_budget_forbidden",
  "background business goals must never acquire an external-action budget");

const runner=fs.readFileSync("cloudflare/src/business-goal-durable-loop.js","utf8");
const ui=fs.readFileSync("public/js/owner-command-centre.js","utf8");
const pkgText=fs.readFileSync("package.json","utf8");

assert.match(runner,/budgetAdjusted/,"durable runtime must detect legacy read-budget drift");
assert.match(runner,/UPDATE agent_persistent_tasks SET budget_json=\?/,
  "legacy read-budget repair must persist before goal reads execute");
assert.match(runner,/checkpoint_json=\?/,
  "owner-attention pauses must persist into the durable task checkpoint");
assert.match(runner,/ownerAttention:true,errorCode/,
  "attention checkpoint must carry a bounded failure reason");
assert.match(runner,/ownerAttention:false,errorCode:null/,
  "a verified retry must clear stale attention state while preserving normal goal outcomes");
assert.match(runner,/baselineEstablished,changed,signal/,
  "V242 must preserve the V241 compact governed outcome checkpoint");

assert.match(ui,/businessGoalAttentionCopy/,"goal failures must be translated into bounded owner-facing copy");
assert.match(ui,/state:"Needs attention"/,"auto-paused failures must become an explicit governed outcome");
assert.match(ui,/Resume & retry/,"owners need an explicit recovery action");
assert.doesNotMatch(ui,/body:JSON\.stringify\(\{templateKey,cadence:"daily",maxToolCallsPerRun:4\}\)/,
  "normal Owner Command Centre goal creation must not force the obsolete four-call default");
assert.match(ui,/Authority boundary · Observe → reason → recommend/,
  "the single global authority boundary must remain visible");
assert.doesNotMatch(ui,/Thebe remains observe-and-recommend only/,
  "V242 must not reintroduce per-card authority copy removed by the compact outcome design");
assert.match(pkgText,/v241-goal-outcomes\.mjs && node tests\/v242-goal-attention-budget\.mjs/,
  "V242 must run after V241 goal outcome coverage in the protected release chain");

console.log("PASS: V242 reconciles goal budgets and owner-attention recovery with compact governed outcomes.");
