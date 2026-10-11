import assert from "node:assert/strict";
import {__businessContextTest,BUSINESS_CONTEXT_VERSION} from "../cloudflare/src/business-context.js";

function envWith({workflow={pending_count:0,failed_count:0,next_due_at:null},summary=null,performance={open_count:0,critical_count:0,warning_count:0,latest_signal_at:null},fail=[]}={}){
  return {
    DB:{
      prepare(sql){
        const source=String(sql).includes("FROM workflow_jobs")?"workflow":String(sql).includes("FROM daily_operations_summaries")?"summary":String(sql).includes("FROM performance_insights")?"performance":"other";
        return {
          bind(){return this},
          async first(){
            if(fail.includes(source))throw new Error(`${source}_unavailable`);
            if(source==="workflow")return workflow;
            if(source==="summary")return summary;
            if(source==="performance")return performance;
            return null;
          }
        };
      }
    }
  };
}

assert.equal(BUSINESS_CONTEXT_VERSION,"2026-10-11.v324");

const empty=await __businessContextTest.operationsContext(envWith(),"tenant-1");
assert.equal(empty.available,true,"successful empty operational reads must remain available");
assert.equal(empty.pendingWorkflowCount,0);
assert.equal(empty.failedWorkflowCount,0);
assert.equal(empty.openPerformanceSignals,0);
assert.equal(empty.criticalPerformanceSignals,0);
assert.equal(empty.sourceStatus.dailyOperations.available,true);
assert.equal(empty.sourceStatus.dailyOperations.recordPresent,false,"no daily summary is different from a failed summary read");

const workflowFailure=await __businessContextTest.operationsContext(envWith({fail:["workflow"]}),"tenant-1");
assert.equal(workflowFailure.available,false);
assert.equal(workflowFailure.sourceStatus.workflowJobs.available,false);
assert.equal(workflowFailure.pendingWorkflowCount,null,"failed workflow read must be unknown, not zero");
assert.equal(workflowFailure.failedWorkflowCount,null,"failed workflow read must be unknown, not zero");
assert.equal(workflowFailure.criticalPerformanceSignals,0,"other successful sources remain usable");

const performanceFailure=await __businessContextTest.operationsContext(envWith({fail:["performance"]}),"tenant-1");
assert.equal(performanceFailure.available,false);
assert.equal(performanceFailure.sourceStatus.performanceInsights.available,false);
assert.equal(performanceFailure.openPerformanceSignals,null);
assert.equal(performanceFailure.criticalPerformanceSignals,null,"failed signal read must be unknown, not zero");

const unavailableContext={
  market:{code:"BW",currency:"BWP"},
  finance:{cashPositionMinor:0,receivables:{outstandingMinor:0},payables:{},reconciliation:{},today:{}},
  compliance:{ruleCoverageStatus:"unknown",overdueCount:0,dueWithin14Days:0},
  operations:workflowFailure,
  sales:{dormantQuotationCount:0,dormantQuotationValueBwp:0},
  moneyIntelligence:{},
  durableMemory:{items:[]},
  businessDate:"2026-10-11"
};
const priorities=__businessContextTest.deriveBusinessPriorities(unavailableContext);
assert.ok(priorities.some(item=>item.key==="operations_data_unavailable"),"unavailable operational sources must produce a review priority rather than an all-clear");
const headline=__businessContextTest.briefHeadline({finance:unavailableContext.finance,receivables:unavailableContext.finance.receivables,compliance:unavailableContext.compliance,ops:workflowFailure,language:{render:"english"},marketCode:"BW"});
assert.match(headline,/Operations status unavailable/);
assert.doesNotMatch(headline,/0 failed workflow/);

const brief=__businessContextTest.buildDailyBusinessBrief(unavailableContext);
assert.equal(brief.metrics.operationsAvailable,false);
assert.equal(brief.metrics.pendingWorkflowCount,null);
assert.equal(brief.metrics.failedWorkflowCount,null);
assert.equal(brief.metrics.operationsSourceStatus.workflowJobs.available,false);

console.log("v324 business context source availability: PASS");
