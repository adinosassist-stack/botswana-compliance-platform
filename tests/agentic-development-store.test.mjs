import test from "node:test";
import assert from "node:assert/strict";
import {createDevelopmentWorkflowStore} from "../server/agentic/development-store.mjs";
const actor={id:"owner",tenantId:"t1",canCreateWorkflow:true,canApproveWorkflow:true,canExecuteWorkflow:true,canViewWorkflows:true};
test("store disabled by default",()=>assert.throws(()=>createDevelopmentWorkflowStore().create({tenantId:"t1",actor,objective:"Reconcile",workflowId:"workflow_123"}),/DISABLED/));
test("create, transition, audit and summarize with version fencing",()=>{
 const store=createDevelopmentWorkflowStore({enabled:true});
 const item=store.create({tenantId:"t1",actor,objective:"Reconcile",workflowId:"workflow_123"});
 assert.throws(()=>store.create({tenantId:"t1",actor,objective:"Again",workflowId:"workflow_123"}),/DUPLICATE/);
 store.transition({tenantId:"t1",id:item.id,actor,to:"validated",expectedVersion:0,proposalDigest:"a".repeat(64)});
 assert.throws(()=>store.transition({tenantId:"t1",id:item.id,actor,to:"cancelled",expectedVersion:0}),/VERSION_CONFLICT/);
 assert.equal(store.audit({tenantId:"t1",actor}).length,2);
 assert.equal(store.summary({tenantId:"t1",actor}).counts.active,1);
});
test("tenant-scoped audit and mutation",()=>{
 const store=createDevelopmentWorkflowStore({enabled:true});
 store.create({tenantId:"t1",actor,objective:"Reconcile",workflowId:"workflow_123"});
 assert.throws(()=>store.transition({tenantId:"t1",id:"workflow_123",actor:{...actor,tenantId:"t2"},to:"cancelled",expectedVersion:0}),/FORBIDDEN/);
 assert.throws(()=>store.audit({tenantId:"t1",actor:{...actor,canViewWorkflows:false}}),/FORBIDDEN/);
});
