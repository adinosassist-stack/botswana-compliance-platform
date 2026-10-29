import test from "node:test";
import assert from "node:assert/strict";
import {agentBudgetSchema,reservationStatements} from "../server/agentic/agent-budget-persistence-contract.mjs";
const input={tenantId:"tenant-a",agentId:"agent-1",requestId:"request-1",costMinor:40,expectedVersion:2,createdAt:"2026-10-29T00:00:00Z"};
test("schema is tenant-scoped and defaults to stopped",()=>{assert.match(agentBudgetSchema,/PRIMARY KEY \(tenant_id, agent_id\)/);assert.match(agentBudgetSchema,/stopped INTEGER NOT NULL DEFAULT 1/)});
test("debit is version fenced, enabled and not stopped",()=>{const {debit}=reservationStatements(input);assert.match(debit.sql,/version=\?/);assert.match(debit.sql,/enabled=1 AND stopped=0/);assert.deepEqual(debit.params,[40,"tenant-a","agent-1",2,40])});
test("idempotency is scoped to tenant agent request",()=>{const {existing,record}=reservationStatements(input);assert.deepEqual(existing.params,["tenant-a","agent-1","request-1"]);assert.deepEqual(record.params,["tenant-a","agent-1","request-1",40,input.createdAt])});
test("rejects negative, fractional and unsafe amounts",()=>{for(const costMinor of [-1,0.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>reservationStatements({...input,costMinor}),TypeError)});
test("rejects absent tenant and invalid version",()=>{assert.throws(()=>reservationStatements({...input,tenantId:""}),TypeError);assert.throws(()=>reservationStatements({...input,expectedVersion:-1}),TypeError)});
