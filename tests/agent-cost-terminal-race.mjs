import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {installAgentCostTestSchema} from "./helpers/agent-cost-schema.mjs";
import {reserveAgentCost,settleAgentCost} from "../cloudflare/src/agent-cost-reservations.js";

const db=new DatabaseSync(":memory:");
installAgentCostTestSchema(db);
db.exec("INSERT INTO tenants(id,name) VALUES('race-tenant','Race');");
db.prepare("INSERT INTO agent_cost_budgets(tenant_id,agent_id,budget_minor,enabled) VALUES('race-tenant','thebe',100,1)").run();

const env={DB:{
  prepare(sql){let values=[];return {
    bind(...v){values=v;return this},
    first(){return db.prepare(sql).get(...values)},
    run(){return db.prepare(sql).run(...values)}
  }},
  async batch(statements){
    db.exec("BEGIN IMMEDIATE");
    try{
      const results=statements.map(statement=>({meta:{changes:Number(statement.run().changes)}}));
      db.exec("COMMIT");
      return results;
    }catch(error){
      db.exec("ROLLBACK");
      throw error;
    }
  }
}};

const authority={tenantId:"race-tenant",actorTenantId:"race-tenant",agentId:"thebe"};
const reserved=await reserveAgentCost(env,{...authority,runId:"race-run",reservationId:"race-reservation",estimatedCostMinor:60});
assert.equal(reserved.allowed,true);

const settlement={...authority,reservationId:"race-reservation",actualCostMinor:60,provider:"test",model:"mock",inputTokens:1,outputTokens:1};
// Both async calls can observe the reservation as active before either batch resumes.
// The conditional terminal update plus changes() ledger guard must still allow one winner only.
const results=await Promise.all([
  settleAgentCost(env,settlement),
  settleAgentCost(env,settlement)
]);
const winners=results.filter(result=>result.allowed===true);
const losers=results.filter(result=>result.allowed===false);
assert.equal(winners.length,1,"exactly one concurrent settlement must win");
assert.equal(losers.length,1,"exactly one concurrent settlement must lose");
assert.equal(losers[0].code,"cost_settlement_conflict");

assert.deepEqual(
  {...db.prepare("SELECT spent_minor spent,reserved_minor reserved FROM agent_cost_budgets WHERE tenant_id='race-tenant' AND agent_id='thebe'").get()},
  {spent:60,reserved:0}
);
assert.deepEqual(
  {...db.prepare("SELECT status,actual_minor FROM agent_cost_reservations WHERE id='race-reservation'").get()},
  {status:"settled",actual_minor:60}
);
const events=db.prepare("SELECT event_type FROM agent_cost_events WHERE reservation_id='race-reservation' ORDER BY id").all().map(row=>row.event_type);
assert.deepEqual(events,["reserved","settled"]);
assert.equal(db.prepare("SELECT count(*) n FROM agent_cost_ledger_gaps WHERE reservation_id='race-reservation'").get().n,0);

console.log("Agent cost concurrent terminal settlement race PASS");
