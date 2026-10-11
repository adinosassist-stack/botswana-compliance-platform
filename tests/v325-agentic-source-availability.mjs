import assert from "node:assert/strict";
import {__agenticFoundationTest as agentic} from "../cloudflare/src/agentic-core.js";

function baseContext(operations){
  return {
    version:"2026-09-27.v175",
    observedAt:"2026-10-11T07:30:00.000Z",
    businessDate:"2026-10-11",
    market:{code:"BW",currency:"BWP"},
    roleScope:{managementContext:true},
    identity:{tenantName:"Test"},
    finance:{
      cashPositionMinor:100000,
      accounts:[{id:"cash"}],
      reconciliation:{unresolvedCount:0,unresolvedExposureMinor:0,lastRun:{created_at:"2026-10-11T07:00:00.000Z"}},
      receivables:{outstandingMinor:0,overdueMinor:0,overdueCustomerCount:0},
      today:{positiveInflowMinor:0,customerCollectionMinor:0}
    },
    compliance:{overdueCount:0,dueWithin14Days:0,nextDueAt:null},
    operations,
    memory:{},sales:{},moneyIntelligence:{},provenance:{availability:{operations:operations.sourceStatus||null}}
  };
}

const healthy=agentic.workspaceObservationFromContext(baseContext({
  available:true,
  sourceStatus:{
    workflowJobs:{available:true,observedAt:"2026-10-11T07:30:00.000Z"},
    dailyOperations:{available:true,observedAt:"2026-10-11T07:30:00.000Z",recordPresent:false},
    performanceInsights:{available:true,observedAt:"2026-10-11T07:30:00.000Z"}
  },
  pendingWorkflowCount:0,
  failedWorkflowCount:0,
  nextWorkflowDueAt:null,
  latestSummaryDate:null,
  latestSummaryMode:null,
  latestCoverage:null,
  openPerformanceSignals:0,
  criticalPerformanceSignals:0,
  warningPerformanceSignals:0,
  latestPerformanceSignalAt:null
}),"owner");

assert.equal(healthy.operations.available,true);
assert.equal(healthy.performance.available,true);
assert.equal(healthy.operations.pendingWorkflowCount,0);
assert.equal(healthy.performance.criticalSignals,0);
assert.equal(healthy.roleScope.operationsDataAvailable,true);
const healthySimulation=agentic.deterministicSimulation(healthy);
assert.equal(healthySimulation.operatingLoad.available,true);
assert.equal(healthySimulation.pressureScore,0);

const workflowUnavailable=agentic.workspaceObservationFromContext(baseContext({
  available:false,
  sourceStatus:{
    workflowJobs:{available:false,observedAt:"2026-10-11T07:30:00.000Z"},
    dailyOperations:{available:true,observedAt:"2026-10-11T07:30:00.000Z",recordPresent:true},
    performanceInsights:{available:true,observedAt:"2026-10-11T07:30:00.000Z"}
  },
  pendingWorkflowCount:null,
  failedWorkflowCount:null,
  latestSummaryDate:"2026-10-11",
  latestSummaryMode:"scheduled",
  latestCoverage:0.9,
  openPerformanceSignals:0,
  criticalPerformanceSignals:0,
  warningPerformanceSignals:0
}),"owner");

assert.equal(workflowUnavailable.operations.available,false);
assert.equal(workflowUnavailable.operations.unavailable,true);
assert.equal(workflowUnavailable.operations.pendingWorkflowCount,null);
assert.equal(workflowUnavailable.operations.failedWorkflowCount,null);
assert.equal(workflowUnavailable.operations.latestSummaryDate,"2026-10-11","healthy summary evidence remains available when workflow reads fail");
assert.equal(workflowUnavailable.performance.available,true,"healthy performance evidence must remain usable");
assert.equal(workflowUnavailable.roleScope.operationsDataAvailable,false);
const unavailableSimulation=agentic.deterministicSimulation(workflowUnavailable);
assert.equal(unavailableSimulation.operatingLoad.available,false);
assert.equal(unavailableSimulation.operatingLoad.pendingWorkflowCount,null);
assert.equal(unavailableSimulation.pressureScore,null,"pressure score must be withheld rather than calculated from false zeroes");
assert.ok(unavailableSimulation.assumptions.some(item=>/unknown.*zeroes/i.test(item)));

const unavailableFallback=agentic.deterministicFallback(workflowUnavailable);
assert.equal(unavailableFallback.confidence,"low");
assert.ok(unavailableFallback.actions.some(item=>item.title==="Verify operational data availability"));
assert.ok(unavailableFallback.actions.some(item=>item.sourceRefs.includes("workflow_jobs")));
assert.ok(!unavailableFallback.actions.some(item=>/No deterministic exception crossed/i.test(item.reason)),"unavailable source state must not produce an all-clear fallback");

const performanceUnavailable=agentic.workspaceObservationFromContext(baseContext({
  available:false,
  sourceStatus:{
    workflowJobs:{available:true},
    dailyOperations:{available:true,recordPresent:true},
    performanceInsights:{available:false}
  },
  pendingWorkflowCount:0,
  failedWorkflowCount:0,
  latestSummaryDate:"2026-10-11",
  openPerformanceSignals:null,
  criticalPerformanceSignals:null,
  warningPerformanceSignals:null
}),"owner");
assert.equal(performanceUnavailable.operations.available,true);
assert.equal(performanceUnavailable.performance.available,false);
assert.equal(performanceUnavailable.performance.criticalSignals,null);
assert.equal(agentic.deterministicSimulation(performanceUnavailable).pressureScore,null);
assert.ok(agentic.deterministicFallback(performanceUnavailable).actions.some(item=>item.title==="Verify operational data availability"));

console.log("v325 agentic source availability propagation: PASS");
