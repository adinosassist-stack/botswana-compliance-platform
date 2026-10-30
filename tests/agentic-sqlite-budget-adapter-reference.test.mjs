import test from "node:test";
import assert from "node:assert/strict";
import {createSqliteAgentBudgetAdapter,agentAuditSchema} from "../server/agentic/sqlite-budget-adapter-reference.mjs";
function mock(){const statements=[];return {statements,exec(sql){statements.push(sql)},prepare(sql){return {get(...params){statements.push(["get",sql,params]);return null},run(...params){statements.push(["run",sql,params]);return {changes:1}}}}}}
test("commit occurs after transactional operations",async()=>{const db=mock();const adapter=createSqliteAgentBudgetAdapter(db);await adapter.transaction(async tx=>{await tx.run("UPDATE x SET y=?",[1]);await tx.appendAudit({tenantId:"t",agentId:"a",actorId:"owner",requestId:"r",type:"budget_reserved",occurredAt:"now",details:{costMinor:1},digest:"abc"})});assert.equal(db.statements[0],"BEGIN IMMEDIATE");assert.equal(db.statements.at(-1),"COMMIT");assert.equal(db.statements.some(x=>Array.isArray(x)&&x[1].includes("agent_audit_event")),true)});
test("rollback on failed callback",async()=>{const db=mock();await assert.rejects(createSqliteAgentBudgetAdapter(db).transaction(async()=>{throw Error("fail")}),/fail/);assert.deepEqual(db.statements,["BEGIN IMMEDIATE","ROLLBACK"])});
test("requires real transaction primitives",()=>assert.throws(()=>createSqliteAgentBudgetAdapter({}),TypeError));
test("audit schema tenant indexed",()=>assert.match(agentAuditSchema,/idx_agent_audit_tenant_time/));

test("concurrent requests on one adapter serialize BEGIN/COMMIT boundaries",async()=>{
 const db=mock(),adapter=createSqliteAgentBudgetAdapter(db);
 let release;const gate=new Promise(resolve=>{release=resolve});
 const first=adapter.transaction(async()=>{await gate});
 const second=adapter.transaction(async()=>{});
 await Promise.resolve();await Promise.resolve();
 assert.deepEqual(db.statements,["BEGIN IMMEDIATE"]);
 release();await Promise.all([first,second]);
 assert.deepEqual(db.statements,["BEGIN IMMEDIATE","COMMIT","BEGIN IMMEDIATE","COMMIT"]);
});
test("failed transaction releases queue for subsequent requests",async()=>{
 const db=mock(),adapter=createSqliteAgentBudgetAdapter(db);
 const first=adapter.transaction(async()=>{throw Error("fail")});
 const second=adapter.transaction(async()=>42);
 await assert.rejects(first,/fail/);
 assert.equal(await second,42);
 assert.deepEqual(db.statements,["BEGIN IMMEDIATE","ROLLBACK","BEGIN IMMEDIATE","COMMIT"]);
});
