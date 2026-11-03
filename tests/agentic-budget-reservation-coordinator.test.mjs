import test from "node:test";
import assert from "node:assert/strict";
import {reserveAgentBudget} from "../server/agentic/agent-budget-reservation-coordinator.mjs";
const input={identity:{tenantId:"t",agentId:"a",actorId:"owner"},request:{requestId:"r"},costMinor:50,expectedVersion:1,occurredAt:"2026-10-29T12:00:00Z"};
function adapter({existing=null,changes=1,auditFailure=false}={}){const calls=[];return {calls,transaction:async fn=>fn({get:async()=>existing,run:async(sql)=>{calls.push(sql);return {changes}},appendAudit:async event=>{calls.push(event);if(auditFailure)throw Error("audit failed")}})}}
test("successful reservation records debit, reservation and audit",async()=>{const db=adapter();assert.equal((await reserveAgentBudget({...input,db})).status,"reserved");assert.equal(db.calls.length,3)});
test("duplicate request does not debit twice",async()=>{const db=adapter({existing:{cost_minor:50}});assert.equal((await reserveAgentBudget({...input,db})).status,"duplicate");assert.equal(db.calls.length,0)});
test("same request with different amount is conflict",async()=>{const db=adapter({existing:{cost_minor:51}});assert.equal((await reserveAgentBudget({...input,db})).status,"conflict");assert.equal(db.calls.length,0)});
test("version mismatch or disabled policy denies before ledger write",async()=>{const db=adapter({changes:0});assert.equal((await reserveAgentBudget({...input,db})).status,"denied");assert.equal(db.calls.length,1)});
test("audit failure propagates to transaction adapter for rollback",async()=>{await assert.rejects(reserveAgentBudget({...input,db:adapter({auditFailure:true})}),/audit failed/)});
test("untrusted or missing actor rejected",async()=>{await assert.rejects(reserveAgentBudget({...input,identity:{...input.identity,actorId:""},db:adapter()}),TypeError)});
