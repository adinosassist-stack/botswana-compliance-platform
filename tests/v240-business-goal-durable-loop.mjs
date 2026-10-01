import assert from "node:assert/strict";
import fs from "node:fs";
import {buildBusinessGoalTask,BUSINESS_GOAL_TEMPLATES} from "../cloudflare/src/business-goals.js";
import {__businessGoalDurableLoopTest} from "../cloudflare/src/business-goal-durable-loop.js";

const {BUSINESS_GOAL_KEYS,validateBusinessGoalTask,nextBusinessGoalRunAt,buildBusinessGoalDueQuery}=__businessGoalDurableLoopTest;
assert.deepEqual([...BUSINESS_GOAL_KEYS],Object.keys(BUSINESS_GOAL_TEMPLATES));

for(const key of BUSINESS_GOAL_KEYS){
  const built=buildBusinessGoalTask({templateKey:key,cadence:"daily",maxToolCallsPerRun:4});
  assert.ok(!built.error,key+" must build");
  const task={
    id:"task-"+key,
    tenant_id:"tenant-a",
    status:"active",
    next_run_at:"2026-10-01T08:00:00.000Z",
    trigger_spec_json:JSON.stringify({...built.payload.triggerSpec,templateKey:key,label:built.payload.label}),
    allowed_tools_json:JSON.stringify(built.payload.allowedTools),
    budget_json:JSON.stringify(built.payload.budget)
  };
  const validated=validateBusinessGoalTask(task);
  assert.equal(validated.valid,true,key+" must match its pinned read-tool contract");
  const next=nextBusinessGoalRunAt(task,task.next_run_at,{now:new Date("2026-10-01T08:30:00.000Z")});
  assert.equal(next.nextRunAt,"2026-10-02T08:00:00.000Z");
  assert.equal(next.skippedOccurrences,0);
}
assert.equal(buildBusinessGoalTask({templateKey:"protect_cash",cadence:"hourly"}).error,"invalid_business_goal_cadence");
assert.ok(!BUSINESS_GOAL_TEMPLATES.grow_sales.allowedTools.includes("receivables_customer.read"),
  "background sales goal must not invoke a parameterized customer lookup without a customer");

const due=buildBusinessGoalDueQuery(25);
assert.equal(due.bindings.at(-1),25);
assert.match(due.sql,/next_run_at IS NOT NULL/);
assert.match(due.sql,/json_extract\(CASE WHEN json_valid\(trigger_spec_json\) THEN trigger_spec_json ELSE '\{\}' END,'\$\.templateKey'\)/);

const runner=fs.readFileSync("cloudflare/src/business-goal-durable-loop.js","utf8");
const engine=fs.readFileSync("cloudflare/src/agentic-persistent-tasks.js","utf8");
const finance=fs.readFileSync("cloudflare/src/finance-watch-contract.js","utf8");
const worker=fs.readFileSync("cloudflare/src/worker.js","utf8");
const ui=fs.readFileSync("public/js/owner-command-centre.js","utf8");

assert.match(runner,/loadCanonicalAgentAuthority\(env,BUSINESS_GOAL_OBSERVER_AGENT_ID\)/,
  "background goals must use their dedicated canonical non-execution observer identity");
assert.doesNotMatch(runner,/FINANCE_OBSERVER_AGENT_ID/,
  "business goals must not borrow the canonical Finance observer identity");
assert.match(runner,/observerAuthority\.executionCapable!==false/,
  "background goal observer must fail closed if execution capable");
assert.doesNotMatch(runner,/\bfetch\s*\(/,
  "background goal loop must not perform network actions");
assert.match(runner,/executionAllowed:false,externalActions:0/,
  "background goal loop must keep zero execution authority");
assert.match(runner,/BUSINESS_GOAL_OBSERVATION_VERIFIED/,
  "successful scheduled checks must leave durable observation evidence");
assert.match(runner,/OWNER_ATTENTION_REQUIRED/,
  "repeated failed checks must pause rather than spin forever");
assert.match(runner,/next_run_at=strftime/,
  "legacy V239 goals with null schedules must be repaired by the durable loop");

assert.match(engine,/const nextRunAt=new Date\(\)\.toISOString\(\)/,
  "new business goals must receive an initial schedule");
assert.match(engine,/WHERE NOT EXISTS \([\s\S]*templateKey/,
  "duplicate active or paused business goals must be server-guarded");
assert.match(engine,/parseJson\(r\.trigger_spec_json,\{\}\)/,
  "task listing must tolerate malformed historical JSON without crashing the whole panel");
assert.match(engine,/next_run_at=CASE WHEN \?='active' AND next_run_at IS NULL/,
  "resume must repair a missing schedule");
assert.match(finance,/safeTriggerJson/,
  "Finance Watch must parse historical trigger JSON through a malformed-JSON-safe boundary");
assert.match(finance,/templateKey'\),'\)' NOT IN|templateKey/,
  "Finance Watch must exclude business-goal tasks so one occurrence has one scheduler owner");
assert.match(worker,/summary\.businessGoals=await runDueBusinessGoalTasks\(env,\{limit:25\}\)/,
  "platform cron must actually execute due business goals");
assert.doesNotMatch(ui,/Watch quotations/,
  "UI must not claim quotation monitoring when no quotation read tool is in the goal contract");
assert.match(ui,/checks bounded business signals on schedule/,
  "UI must describe the real scheduled behavior rather than generic background work");
assert.match(ui,/raw\.replace\(" ","T"\)\+"Z"/,
  "D1 UTC timestamps without a timezone suffix must be normalized before Gaborone display");

console.log("PASS: V240 repairs the V239 business-goal scheduler, duplicate, parsing and truthfulness gaps.");
