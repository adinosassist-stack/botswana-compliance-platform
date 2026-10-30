import test from "node:test";
import assert from "node:assert/strict";
import {admitWorkflow,transitionWorkflow} from "../server/agentic/workflow-contract.mjs";
const owner={id:"owner",tenantId:"tenantA",canCreateWorkflow:true,canApproveWorkflow:true,canExecuteWorkflow:true};
const digest="a".repeat(64);
const admit=()=>admitWorkflow({enabled:true,tenantId:"tenantA",actor:owner,objective:"Reconcile ledger",workflowId:"workflow_123"});
const step=(w,to,extra={})=>transitionWorkflow(w,{enabled:true,actor:owner,to,expectedVersion:w.version,...extra});
test("disabled by default and tenant isolated",()=>{
 assert.throws(()=>admitWorkflow({tenantId:"tenantA",actor:owner,objective:"x",workflowId:"workflow_123"}),/DISABLED/);
 assert.throws(()=>admitWorkflow({enabled:true,tenantId:"tenantB",actor:owner,objective:"x",workflowId:"workflow_123"}),/FORBIDDEN/);
});
test("proposal approval binds exact digest and execution requires approval",()=>{
 let w=admit();w=step(w,"validated",{proposalDigest:digest});w=step(w,"awaiting_approval");
 assert.throws(()=>step(w,"approved",{proposalDigest:"b".repeat(64)}),/APPROVAL_REQUIRED/);
 assert.throws(()=>step(w,"executing"),/INVALID_WORKFLOW_TRANSITION/);
 w=step(w,"approved",{proposalDigest:digest});w=step(w,"executing");w=step(w,"completed");
 assert.equal(w.state,"completed");
});
test("stale version and cross tenant transitions rejected",()=>{
 const w=admit();
 assert.throws(()=>transitionWorkflow(w,{enabled:true,actor:owner,to:"validated",expectedVersion:9,proposalDigest:digest}),/VERSION_CONFLICT/);
 assert.throws(()=>transitionWorkflow(w,{enabled:true,actor:{...owner,tenantId:"tenantB"},to:"validated",expectedVersion:0,proposalDigest:digest}),/FORBIDDEN/);
});
test("unapproved executor and invalid digest rejected",()=>{
 const w=admit();
 assert.throws(()=>step(w,"validated",{proposalDigest:"invalid"}),/INVALID_PROPOSAL_DIGEST/);
 const v=step(w,"validated",{proposalDigest:digest});
 const pending=step(v,"awaiting_approval");
 assert.throws(()=>transitionWorkflow(pending,{enabled:true,actor:{...owner,canApproveWorkflow:false},to:"approved",expectedVersion:pending.version,proposalDigest:digest}),/APPROVAL_REQUIRED/);
});
