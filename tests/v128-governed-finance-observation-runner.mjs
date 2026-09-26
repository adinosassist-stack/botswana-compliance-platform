import assert from "node:assert/strict";
import {runGovernedFinanceObservation} from "../cloudflare/src/governed-finance-observation-runner.js";

const task={id:"watch-1",tenantId:"tenant-a",status:"active",objective:"Watch finance certainty.",allowedTools:["financial_position.read","finance_data_quality.read"],budget:{maxToolCallsPerRun:4}};
const results={"financial_position.read":{available:true,allowed:true},"finance_data_quality.read":{available:true,allowed:true}};
const snapshot={reconciliationExceptionCount:1,reconciliationExceptionExposureMinor:12500,overdueInvoiceCount:0};

const mismatch=await runGovernedFinanceObservation({tenantId:"tenant-b",task,results,snapshot});
assert.equal(mismatch.ok,false);assert.equal(mismatch.code,"tenant_mismatch");assert.equal(mismatch.executionAllowed,false);assert.equal(mismatch.checkpointAllowed,false);

const overBudget=await runGovernedFinanceObservation({tenantId:"tenant-a",task,results,snapshot,toolCalls:5});
assert.equal(overBudget.ok,false);assert.equal(overBudget.code,"budget_denied");assert.equal(overBudget.executionAllowed,false);

const incomplete=await runGovernedFinanceObservation({tenantId:"tenant-a",task,results:{"financial_position.read":{available:true,allowed:true}},snapshot});
assert.equal(incomplete.ok,false);assert.equal(incomplete.code,"observation_unverified");assert.equal(incomplete.checkpointAllowed,false);

const ok=await runGovernedFinanceObservation({tenantId:"tenant-a",task,results,snapshot,toolCalls:2});
assert.equal(ok.ok,true);assert.equal(ok.mode,"read_only");assert.equal(ok.authority,"none");assert.equal(ok.executionAllowed,false);assert.equal(ok.externalActions,0);assert.equal(ok.externalDeliveryAllowed,false);assert.equal(ok.checkpointAllowed,true);
assert.equal(ok.checkpoint.tenantId,"tenant-a");assert.equal(ok.checkpoint.persistentTaskId,"watch-1");assert.equal(ok.ownerExceptions.length,1);assert.equal(ok.ownerExceptions[0].delivery,"command_centre_only");assert.equal(ok.ownerExceptions[0].executionAllowed,false);

const hostile={...task,allowedTools:[...task.allowedTools,"payment.execute"]};
const hostileRun=await runGovernedFinanceObservation({tenantId:"tenant-a",task:hostile,results,snapshot});
assert.deepEqual(hostileRun.observationRun.reads,task.allowedTools);assert.equal(hostileRun.executionAllowed,false);
console.log("v128 governed finance observation runner passed");
