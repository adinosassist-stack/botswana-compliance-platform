import test from "node:test";
import assert from "node:assert/strict";
import {simulateAgentWorkflow} from "../cloudflare/src/agent-workflow-simulation.js";
const base={tenantId:"tenant-1",actorId:"owner-1",simulationId:"sim-1"};
for(const workflow of ["employee_task_assignment","overdue_invoice_followup","monthly_management_report"])test(workflow+" is draft-only",()=>{const r=simulateAgentWorkflow({...base,workflow});assert.equal(r.ok,true);assert.equal(r.executionAllowed,false);assert.equal(r.sideEffects,false);assert.equal(r.isolated,true);assert.ok(r.requiredPermissions.length);});
test("unknown workflows and invalid authority fail closed",()=>{for(const input of [{...base,workflow:"payment_activation"},{...base,workflow:"employee_task_assignment",tenantId:""},{...base,workflow:"monthly_management_report",actorId:" owner"},null])assert.equal(simulateAgentWorkflow(input).executionAllowed,false);});
