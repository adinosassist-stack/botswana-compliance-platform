import test from "node:test";
import assert from "node:assert/strict";
import {buildAgentCommandCentre} from "../server/agentic/command-centre-readonly.mjs";
const actor={id:"owner",tenantId:"t1",canViewWorkflows:true};
test("counts and task cards are tenant scoped",()=>{
 const view=buildAgentCommandCentre({tenantId:"t1",actor,workflows:[
  {id:"1",tenantId:"t1",state:"awaiting_approval",objective:"Pay supplier",version:2},
  {id:"2",tenantId:"t1",state:"completed",objective:"Reconcile",version:5},
  {id:"3",tenantId:"t2",state:"failed",objective:"Secret",version:1}
 ]});
 assert.equal(view.workflows.length,2);assert.equal(view.counts.pendingApproval,1);
 assert.equal(view.counts.completed,1);assert.equal(view.counts.failed,0);
 assert.equal(view.workflows[0].requiresApproval,true);
});
test("unauthorized viewers fail closed",()=>{
 assert.throws(()=>buildAgentCommandCentre({tenantId:"t1",actor:{...actor,canViewWorkflows:false}}),/FORBIDDEN/);
 assert.throws(()=>buildAgentCommandCentre({tenantId:"t2",actor}),/FORBIDDEN/);
});
