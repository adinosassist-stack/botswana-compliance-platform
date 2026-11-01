import test from "node:test";
import assert from "node:assert/strict";
import {buildAgentDockTasks,buildOwnerAgentMetrics} from "../server/agentic/ui-view-model.mjs";
const summary={readOnly:true,counts:{active:1,pendingApproval:1,completed:0,failed:0},workflows:[{id:"w1",objective:"Reconcile",state:"awaiting_approval",version:2,requiresApproval:true}]};
test("dock tasks cannot approve or execute",()=>{
 const [task]=buildAgentDockTasks(summary);
 assert.equal(task.approvalRequired,true);assert.equal(task.approvalEnabled,false);
 assert.equal(task.executionEnabled,false);assert.deepEqual(task.actions,["view_details"]);
});
test("owner metrics are read-only and validated",()=>{
 const metrics=buildOwnerAgentMetrics(summary);
 assert.equal(metrics.counts.pendingApproval,1);assert.equal(metrics.approvalsInteractive,false);
 assert.throws(()=>buildOwnerAgentMetrics({...summary,counts:{...summary.counts,active:-1}}),/INVALID_AGENT_METRIC/);
});
test("invalid task status and excessive limit fail closed",()=>{
 assert.throws(()=>buildAgentDockTasks({...summary,workflows:[{...summary.workflows[0],state:"unknown"}]}),/INVALID_AGENT_TASK/);
 assert.throws(()=>buildAgentDockTasks(summary,{maxItems:1000}),/INVALID_TASK_LIMIT/);
});
