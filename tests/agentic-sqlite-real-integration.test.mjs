import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {agentBudgetSchema} from "../server/agentic/agent-budget-persistence-contract.mjs";
import {agentAuditSchema,createSqliteAgentBudgetAdapter} from "../server/agentic/sqlite-budget-adapter-reference.mjs";
import {reserveAgentBudget} from "../server/agentic/agent-budget-reservation-coordinator.mjs";
function setup(){
 const db=new DatabaseSync(":memory:");
 db.exec(agentBudgetSchema);db.exec(agentAuditSchema);
 db.prepare("INSERT INTO agent_budget_policy (tenant_id,agent_id,enabled,stopped,budget_minor,spent_minor,version) VALUES (?,?,?,?,?,?,?)").run("tenant","agent",1,0,100,0,0);
 return db;
}
const base={identity:{tenantId:"tenant",agentId:"agent",actorId:"owner"},request:{requestId:"req-1"},costMinor:70,expectedVersion:0,occurredAt:"2026-10-29T12:00:00Z"};
test("real SQLite reservation is atomic and idempotent",async()=>{
 const db=setup(),adapter=createSqliteAgentBudgetAdapter(db);
 assert.equal((await reserveAgentBudget({...base,db:adapter})).status,"reserved");
 assert.equal((await reserveAgentBudget({...base,db:adapter})).status,"duplicate");
 assert.equal(db.prepare("SELECT spent_minor FROM agent_budget_policy").get().spent_minor,70);
 assert.equal(db.prepare("SELECT count(*) AS n FROM agent_budget_reservation").get().n,1);
 assert.equal(db.prepare("SELECT count(*) AS n FROM agent_audit_event").get().n,1);
 db.close();
});
test("real SQLite denies overspending without partial writes",async()=>{
 const db=setup(),adapter=createSqliteAgentBudgetAdapter(db);
 assert.equal((await reserveAgentBudget({...base,costMinor:101,db:adapter})).status,"denied");
 assert.equal(db.prepare("SELECT spent_minor FROM agent_budget_policy").get().spent_minor,0);
 assert.equal(db.prepare("SELECT count(*) AS n FROM agent_budget_reservation").get().n,0);
 db.close();
});
test("real SQLite rolls back debit and reservation if audit insert fails",async()=>{
 const db=setup(),adapter=createSqliteAgentBudgetAdapter(db);
 db.exec("DROP TABLE agent_audit_event");
 await assert.rejects(reserveAgentBudget({...base,db:adapter}));
 assert.equal(db.prepare("SELECT spent_minor FROM agent_budget_policy").get().spent_minor,0);
 assert.equal(db.prepare("SELECT count(*) AS n FROM agent_budget_reservation").get().n,0);
 db.close();
});
test("real SQLite concurrent requests cannot exceed budget",async()=>{
 const db=setup(),adapter=createSqliteAgentBudgetAdapter(db);
 const results=await Promise.all([
  reserveAgentBudget({...base,db:adapter}),
  reserveAgentBudget({...base,request:{requestId:"req-2"},db:adapter})
 ]);
 assert.deepEqual(results.map(r=>r.status),["reserved","denied"]);
 assert.equal(db.prepare("SELECT spent_minor FROM agent_budget_policy").get().spent_minor,70);
 db.close();
});

test("real SQLite stopped agent cannot reserve",async()=>{
 const db=setup(),adapter=createSqliteAgentBudgetAdapter(db);
 db.prepare("UPDATE agent_budget_policy SET stopped=1 WHERE tenant_id=? AND agent_id=?").run("tenant","agent");
 assert.equal((await reserveAgentBudget({...base,db:adapter})).status,"denied");
 assert.equal(db.prepare("SELECT count(*) AS n FROM agent_budget_reservation").get().n,0);
 db.close();
});
test("real SQLite tenant mismatch cannot spend another tenant budget",async()=>{
 const db=setup(),adapter=createSqliteAgentBudgetAdapter(db);
 assert.equal((await reserveAgentBudget({...base,identity:{tenantId:"other",agentId:"agent",actorId:"owner"},db:adapter})).status,"denied");
 assert.equal(db.prepare("SELECT spent_minor FROM agent_budget_policy WHERE tenant_id='tenant'").get().spent_minor,0);
 db.close();
});
test("real SQLite stale version cannot reserve",async()=>{
 const db=setup(),adapter=createSqliteAgentBudgetAdapter(db);
 db.prepare("UPDATE agent_budget_policy SET version=2 WHERE tenant_id='tenant' AND agent_id='agent'").run();
 assert.equal((await reserveAgentBudget({...base,db:adapter})).status,"denied");
 assert.equal(db.prepare("SELECT spent_minor FROM agent_budget_policy").get().spent_minor,0);
 db.close();
});
