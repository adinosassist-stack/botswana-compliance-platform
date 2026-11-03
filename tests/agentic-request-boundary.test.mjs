import test from "node:test";
import assert from "node:assert/strict";
import {createAgenticRequestHandlers} from "../server/agentic/request-boundary.mjs";
import {createDevelopmentWorkflowStore} from "../server/agentic/development-store.mjs";
const actor={id:"owner",tenantId:"t1",canCreateWorkflow:true,canApproveWorkflow:true,canExecuteWorkflow:true,canViewWorkflows:true};
const context={session:{actor,tenantId:"t1"}};
test("request boundary disabled by default",()=>{
 const h=createAgenticRequestHandlers({store:createDevelopmentWorkflowStore({enabled:true})});
 assert.throws(()=>h.summary(context),/DISABLED/);
});
test("server session tenant overrides untrusted request body",()=>{
 const h=createAgenticRequestHandlers({enabled:true,store:createDevelopmentWorkflowStore({enabled:true})});
 const created=h.create(context,{tenantId:"t2",objective:"Reconcile",workflowId:"workflow_123"});
 assert.equal(created.tenantId,"t1");assert.equal(h.summary(context).counts.active,1);
});
test("missing or cross-tenant session denied",()=>{
 const h=createAgenticRequestHandlers({enabled:true,store:createDevelopmentWorkflowStore({enabled:true})});
 assert.throws(()=>h.summary({}),/FORBIDDEN/);
 assert.throws(()=>h.summary({session:{actor,tenantId:"t2"}}),/FORBIDDEN/);
});
