import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {agentBudgetSchema} from "../server/agentic/agent-budget-persistence-contract.mjs";
import {agentAuditSchema,createSqliteAgentBudgetAdapter} from "../server/agentic/sqlite-budget-adapter-reference.mjs";
import {reserveAgentBudget} from "../server/agentic/agent-budget-reservation-coordinator.mjs";
test("separate SQLite connections cannot both reserve beyond budget",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"thebe-agent-budget-"));
 const filename=join(dir,"governance.sqlite");
 let first,second;
 try {
  first=new DatabaseSync(filename);second=new DatabaseSync(filename);
  first.exec(agentBudgetSchema);first.exec(agentAuditSchema);
  first.prepare("INSERT INTO agent_budget_policy (tenant_id,agent_id,enabled,stopped,budget_minor,spent_minor,version) VALUES (?,?,?,?,?,?,?)").run("t","a",1,0,100,0,0);
  const common={identity:{tenantId:"t",agentId:"a",actorId:"owner"},costMinor:70,expectedVersion:0,occurredAt:"2026-10-29T12:00:00Z"};
  const a=await reserveAgentBudget({...common,request:{requestId:"one"},db:createSqliteAgentBudgetAdapter(first)});
  const b=await reserveAgentBudget({...common,request:{requestId:"two"},db:createSqliteAgentBudgetAdapter(second)});
  assert.deepEqual([a.status,b.status],["reserved","denied"]);
  assert.equal(second.prepare("SELECT spent_minor FROM agent_budget_policy").get().spent_minor,70);
  assert.equal(first.prepare("SELECT count(*) AS n FROM agent_budget_reservation").get().n,1);
 } finally {
  first?.close();second?.close();rmSync(dir,{recursive:true,force:true});
 }
});
