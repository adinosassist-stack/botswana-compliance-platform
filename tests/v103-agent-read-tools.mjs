import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {
  AGENT_READ_TOOLS_VERSION,
  buildAgentReadToolContext,
  executeAgentReadTool,
  __agentReadToolsTest
} from "../cloudflare/src/agent-read-tools.js";
import {
  buildSingleAgentOrchestration,
  verifyOrchestratedProposals
} from "../cloudflare/src/agent-orchestration.js";

assert.equal(AGENT_READ_TOOLS_VERSION,"2026-09-20.read-tools-v1");
assert.deepEqual(__agentReadToolsTest.TOOL_ACTIONS,[
  "business_health.read",
  "financial_position.read",
  "finance_data_quality.read",
  "compliance_status.read",
  "daily_operations_summary.read"
]);

const calls=[];
const DB={
  prepare(sql){
    return {
      bind(...bindings){
        calls.push({sql,bindings});
        return {
          async first(){
            if(sql.includes("FROM finance_accounts"))return {cash_position_minor:125000,account_count:2};
            if(sql.includes("FROM finance_reconciliation_runs")&&sql.includes("reconciliation_count"))return {reconciliation_count:3,exception_count:1,exception_exposure_minor:5000,latest_reconciliation_at:"2026-09-20T09:00:00Z"};
            if(sql.includes("FROM finance_reconciliation_runs")&&sql.includes("run_count"))return {run_count:3,reconciled_count:2,exception_count:1,latest_run_at:"2026-09-20T09:00:00Z"};
            if(sql.includes("FROM finance_import_batches"))return {import_batch_count:4,completed_batch_count:4,failed_batch_count:0,imported_row_count:20,duplicate_row_count:2,latest_completed_at:"2026-09-20T08:00:00Z"};
            if(sql.includes("FROM finance_transactions")&&sql.includes("transaction_count"))return {transaction_count:20,missing_fingerprint_count:0,latest_transaction_at:"2026-09-20T08:00:00Z"};
            if(sql.includes("FROM performance_insights"))return {open_count:2,critical_count:1,warning_count:1,latest_signal_at:"2026-09-20T07:00:00Z"};
            if(sql.includes("FROM workflow_jobs"))return {pending_count:3,failed_count:1,next_due_at:"2026-09-21T09:00:00Z"};
            if(sql.includes("FROM compliance_obligations"))return {total_count:5,open_count:2,overdue_count:1,due_14d_count:1,next_due_at:"2026-09-22T09:00:00Z"};
            if(sql.includes("FROM daily_operations_summaries"))return {summary_date:"2026-09-20",generation_mode:"deterministic",metrics_json:JSON.stringify({coverage:0.9,revenue:10000,secretNarrative:"do not expose"}),created_at:"2026-09-20T08:00:00Z"};
            return {};
          },
          async all(){
            if(sql.includes("SELECT id,title,due_at,status FROM compliance_obligations"))return {results:[
              {id:"ob-1",title:"Renew licence",due_at:"2026-09-22T09:00:00Z",status:"open"}
            ]};
            return {results:[]};
          }
        };
      }
    };
  }
};

const owner={tenant_id:"tenant-a",role:"owner"};
const reviewer={tenant_id:"tenant-a",role:"reviewer"};

const ownerContext=await buildAgentReadToolContext({env:{DB},auth:owner});
assert.equal(ownerContext.readOnly,true);
assert.equal(ownerContext.mutationAllowed,false);
assert.equal(ownerContext.toolCount,5);
assert.equal(ownerContext.tools.every(item=>item.readOnly===true),true);
assert.equal(ownerContext.tools.every(item=>item.mutationAllowed===false),true);
assert.ok(ownerContext.sourceRefs.includes("tool:financial_position"));
assert.ok(ownerContext.sourceRefs.includes("tool:daily_operations_summary"));

const reviewerContext=await buildAgentReadToolContext({env:{DB},auth:reviewer});
assert.equal(reviewerContext.toolCount,3);
const reviewerBusiness=reviewerContext.tools.find(item=>item.actionKey==="business_health.read");
const reviewerOps=reviewerContext.tools.find(item=>item.actionKey==="daily_operations_summary.read");
assert.equal(reviewerBusiness.allowed,false);
assert.equal(reviewerBusiness.error,"role_forbidden");
assert.equal(reviewerOps.allowed,false);
assert.equal(reviewerOps.error,"role_forbidden");
assert.equal(reviewerContext.sourceRefs.includes("tool:business_health"),false);
assert.equal(reviewerContext.sourceRefs.includes("tool:daily_operations_summary"),false);
assert.equal(reviewerContext.sourceRefs.includes("tool:financial_position"),true);
assert.equal(reviewerContext.sourceRefs.includes("tool:compliance_status"),true);

const finance=await executeAgentReadTool("financial_position.read",{env:{DB},auth:reviewer});
assert.equal(finance.allowed,true);
assert.equal(finance.data.currency,"BWP");
assert.equal(finance.data.cashPositionMinor,125000);
assert.equal(finance.data.reconciliationExceptionCount,1);

const ops=await executeAgentReadTool("daily_operations_summary.read",{env:{DB},auth:owner});
assert.equal(ops.allowed,true);
assert.equal(ops.data.narrativeExcluded,true);
assert.equal(ops.data.metrics.coverage,0.9);
assert.equal("secretNarrative" in ops.data.metrics,false);

const unsupported=await executeAgentReadTool("payment.execute",{env:{DB},auth:owner});
assert.equal(unsupported.allowed,false);
assert.equal(unsupported.error,"unsupported_read_tool");

assert.ok(calls.length>0);
assert.ok(calls.every(call=>call.bindings.includes("tenant-a")));
assert.ok(calls.every(call=>/^SELECT\b/i.test(call.sql.trim())),"read tools must issue SELECT statements only");

const orchestration=buildSingleAgentOrchestration({
  goal:"Review finance certainty",
  observation:{
    finance:{reconciliationExceptions:1,latestReconciliationAt:"2026-09-20T09:00:00Z"},
    operations:{},
    compliance:{},
    performance:{}
  },
  additionalSourceRefs:ownerContext.sourceRefs
});
assert.ok(orchestration.allowedSourceRefs.includes("tool:financial_position"));
assert.ok(orchestration.allowedSourceRefs.includes("tool:finance_data_quality"));
const verified=verifyOrchestratedProposals([{
  ordinal:1,title:"Review finance quality",reason:"One exception remains.",priority:"high",
  risk:"low",authority:"recommendation_only",executionPolicy:"not_executable_stage_1",
  sourceRefs:["tool:financial_position","invented:source"]
}],orchestration);
assert.deepEqual(verified.proposals[0].sourceRefs,["tool:financial_position"]);
assert.equal(verified.proposals[0].verification.grounded,true);
assert.equal(verified.proposals[0].verification.droppedSourceRefCount,1);

const moduleSource=fs.readFileSync("cloudflare/src/agent-read-tools.js","utf8");
const coreSource=fs.readFileSync("cloudflare/src/agentic-core.js","utf8");
for(const path of ["cloudflare/src/agent-read-tools.js","cloudflare/src/agentic-core.js","cloudflare/src/agent-orchestration.js"]){
  execFileSync(process.execPath,["--check",path],{stdio:"pipe"});
}
assert.doesNotMatch(moduleSource,/\b(INSERT|UPDATE|DELETE|REPLACE)\s+(INTO|FROM|\w+)/i,"read-tool module must not contain mutating SQL");
assert.doesNotMatch(moduleSource,/\bfetch\s*\(/,"read tools must not call the network");
assert.match(moduleSource,/evaluateAgentAction/);
assert.match(moduleSource,/phase:"phase1"/);
assert.match(moduleSource,/narrativeExcluded:true/);
assert.match(moduleSource,/substr\(id,1,2\)<>'__'/);

assert.match(coreSource,/observeWorkspace\(env,tenantId,actorRole\)/);
assert.match(coreSource,/operationsAllowed\?safeFirst/);
assert.match(coreSource,/businessHealthAllowed\?safeFirst/);
assert.doesNotMatch(coreSource,/SELECT summary_date,generation_mode,metrics_json,narrative_json/,"planning observation must not read operations narrative");
assert.match(coreSource,/buildAgentReadToolContext\(\{env,auth\}\)/);
assert.match(coreSource,/additionalSourceRefs:readTools\.sourceRefs/);
assert.match(coreSource,/READ_TOOLS/);
assert.match(coreSource,/\/api\/agentic\/tools\/read\//);
assert.match(coreSource,/readTools:\{enabled:true,readOnly:true,mutationAllowed:false,policyBound:true,roleScoped:true\}/);

console.log("v103 policy-bound agent read tools: PASS");
