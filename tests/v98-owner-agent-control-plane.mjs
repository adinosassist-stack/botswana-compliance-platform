import assert from "node:assert/strict";
import fs from "node:fs";
import {loadTenantOperatorTelemetry} from "../cloudflare/src/agentic-control-plane.js";

const source=fs.readFileSync("public/js/owner-command-centre.js","utf8");
const controlPlaneSource=fs.readFileSync("cloudflare/src/agentic-control-plane.js","utf8");

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
assert.match(source,/Execute control stays hidden until a reviewed platform execution mode permits it/i);

// V261: operator telemetry is a tenant-scoped read surface, not a new authority path.
assert.match(controlPlaneSource,/\/api\/agentic\/control-plane\/operator-telemetry/);
assert.match(controlPlaneSource,/provider_cost_not_metered/);
assert.match(controlPlaneSource,/telemetryCanMutate:false/);
assert.match(controlPlaneSource,/telemetryCanGrantAuthority:false/);
assert.match(controlPlaneSource,/BUSINESS_GOAL_OBSERVER_AGENT_ID/);
const telemetrySection=controlPlaneSource.slice(
  controlPlaneSource.indexOf("export async function loadTenantOperatorTelemetry"),
  controlPlaneSource.indexOf("async function operatorTelemetry")
);
assert.ok(telemetrySection.length>500,"operator telemetry implementation should be present");
assert.doesNotMatch(telemetrySection,/\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i,"operator telemetry must stay read-only");

const calls=[];
const tenant="tenant-v261";
const fakeDB={
  prepare(sql){
    const normalized=String(sql).replace(/\s+/g," ").trim();
    return {
      bind(...bindings){
        calls.push({sql:normalized,bindings});
        assert.ok(bindings.length>=1,"telemetry query should bind tenant scope");
        for(const value of bindings)assert.equal(value,tenant,"telemetry query escaped tenant scope");
        const first=async()=>{
          if(normalized.startsWith("SELECT MAX(activity_at)"))return {last_activity_at:"2026-10-02 18:00:00"};
          if(normalized.includes("FROM agent_observation_claims")&&normalized.includes("COUNT(*) total"))return {total:10,completed:9,failed:1,running:0,attempts:11};
          if(normalized.includes("FROM agentic_runs")&&normalized.includes("COUNT(*) total"))return {total:4,completed:4,failed:0,governed_ai:3,deterministic_fallback:1};
          if(normalized.includes("FROM agent_task_requests"))return {prepared:2,approved:1,executed:7};
          if(normalized.includes("FROM agent_execution_receipts"))return {succeeded:6};
          if(normalized.includes("FROM agent_execution_grants"))return {active:1};
          if(normalized.includes("FROM agent_persistent_tasks")&&normalized.includes("COUNT(*) total"))return {total:5,active:3,paused:1,completed:1};
          throw new Error(`Unexpected first() telemetry query: ${normalized}`);
        };
        const all=async()=>{
          if(normalized.includes("SELECT budget_json,risk_policy_json")&&normalized.includes("FROM agent_persistent_tasks")){
            return {results:[
              {budget_json:JSON.stringify({maxToolCallsPerRun:3,maxExternalActions:0}),risk_policy_json:JSON.stringify({externalActions:false})},
              {budget_json:JSON.stringify({maxToolCallsPerRun:2,maxExternalActions:0}),risk_policy_json:JSON.stringify({externalActions:false})},
              {budget_json:JSON.stringify({maxToolCallsPerRun:1,maxExternalActions:0}),risk_policy_json:JSON.stringify({externalActions:false})}
            ]};
          }
          throw new Error(`Unexpected all() telemetry query: ${normalized}`);
        };
        return {first,all};
      }
    };
  }
};

const telemetry=await loadTenantOperatorTelemetry({DB:fakeDB},tenant);
assert.equal(telemetry.available,true);
assert.deepEqual(telemetry.windows,{activityDays:7,verifiedExecutionDays:30});
assert.equal(telemetry.persistentObjectives.active,3);
assert.equal(telemetry.persistentObjectives.configuredReadCeilingPerRun,6);
assert.equal(telemetry.observations.total7d,10);
assert.equal(telemetry.observations.successRatePct,90);
assert.equal(telemetry.planning.runs7d,4);
assert.equal(telemetry.planning.governedAiRuns7d,3);
assert.equal(telemetry.approvals.prepared,2);
assert.equal(telemetry.approvals.approvedAwaitingExecution,1);
assert.equal(telemetry.execution.activeGrants,1);
assert.equal(telemetry.execution.verifiedSucceeded30d,6);
assert.equal(telemetry.authorityBoundary.externalActionBudgetViolations,0);
assert.equal(telemetry.authorityBoundary.telemetryCanMutate,false);
assert.equal(telemetry.authorityBoundary.telemetryCanGrantAuthority,false);
assert.equal(telemetry.providerSpend.metered,false);
assert.equal(telemetry.providerSpend.amountMinor,null);
assert.equal(telemetry.providerSpend.reason,"provider_cost_not_metered");
assert.equal(telemetry.lastActivityAt,"2026-10-02 18:00:00");
assert.ok(calls.length>=8,"operator telemetry should read the expected governed sources");

const unavailable=await loadTenantOperatorTelemetry({},tenant);
assert.deepEqual(unavailable,{available:false,reason:"operator_telemetry_unavailable"});

console.log("v98 owner agent control-plane governed lifecycle + V261 operator telemetry: PASS");