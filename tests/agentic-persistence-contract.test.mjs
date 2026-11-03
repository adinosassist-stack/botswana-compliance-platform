import test from "node:test";
import assert from "node:assert/strict";
import {AGENT_WORKFLOW_SCHEMA_SQL,workflowVersionUpdate} from "../server/agentic/persistence-contract.mjs";
test("schema uses tenant composite keys and version uniqueness",()=>{
 assert.match(AGENT_WORKFLOW_SCHEMA_SQL,/PRIMARY KEY \(tenant_id,workflow_id\)/);
 assert.match(AGENT_WORKFLOW_SCHEMA_SQL,/UNIQUE\(tenant_id,workflow_id,version\)/);
});
test("updates require tenant and expected version",()=>{
 const q=workflowVersionUpdate({tenantId:"t1",workflowId:"w1",expectedVersion:3,nextState:"cancelled"});
 assert.deepEqual(q.params,["cancelled","t1","w1",3]);
 assert.equal(q.expectedChanges,1);
 assert.throws(()=>workflowVersionUpdate({tenantId:"t1",workflowId:"w1",expectedVersion:-1,nextState:"cancelled"}),/INVALID/);
});
