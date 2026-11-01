import test from "node:test";
import assert from "node:assert/strict";
import {buildAgentGovernanceSummary} from "../server/agentic/agent-governance-summary.mjs";
const policies=[{tenantId:"a",agentId:"one",enabled:true,stopped:false,budgetMinor:100,spentMinor:30},{tenantId:"a",agentId:"two",enabled:true,stopped:true,budgetMinor:200,spentMinor:20},{tenantId:"b",agentId:"secret",enabled:true,stopped:false,budgetMinor:900,spentMinor:800}];
test("owner projection filters cross-tenant policies",()=>{const r=buildAgentGovernanceSummary({tenantId:"a",policies});assert.equal(r.totalAgents,2);assert.equal(r.totalBudgetMinor,300);assert.equal(r.totalSpentMinor,50);assert.equal(r.stoppedAgents,1);assert.equal(r.agents.some(x=>x.agentId==="secret"),false)});
test("reservations count only matching tenant and agent",()=>{const r=buildAgentGovernanceSummary({tenantId:"a",policies,reservations:[{tenantId:"a",agentId:"one"},{tenantId:"b",agentId:"one"}]});assert.equal(r.agents[0].reservationCount,1)});
test("remaining budget is never negative",()=>{const r=buildAgentGovernanceSummary({tenantId:"a",policies:[{tenantId:"a",agentId:"x",budgetMinor:10,spentMinor:20}]});assert.equal(r.agents[0].remainingMinor,0)});
test("missing tenant is rejected",()=>assert.throws(()=>buildAgentGovernanceSummary({tenantId:""}),TypeError));
