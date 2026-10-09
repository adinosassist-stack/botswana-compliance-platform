import {installAgentCostTestSchema} from "./helpers/agent-cost-schema.mjs";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {reserveAgentCost,settleAgentCost,releaseAgentCost} from "../cloudflare/src/agent-cost-reservations.js";
const db=new DatabaseSync(":memory:");
installAgentCostTestSchema(db);
  db.exec("INSERT INTO tenants(id,name) VALUES('t1','Pilot')");
db.prepare("INSERT INTO agent_cost_budgets(tenant_id,agent_id,budget_minor,enabled) VALUES('t1','thebe',1000,1)").run();
const env={DB:{
 prepare(sql){let values=[];return {bind(...v){values=v;return this},first(){return db.prepare(sql).get(...values)},run(){return db.prepare(sql).run(...values)}}},
 async batch(statements){db.exec("BEGIN IMMEDIATE");try{const results=statements.map(s=>({meta:{changes:Number(s.run().changes)}}));db.exec("COMMIT");return results}catch(e){db.exec("ROLLBACK");throw e}}
}};
const args={tenantId:"t1",actorTenantId:"t1",agentId:"thebe"};
const reserve=(id,amount)=>reserveAgentCost(env,{...args,runId:id,reservationId:id,estimatedCostMinor:amount});
const balance=()=>({...db.prepare("SELECT spent_minor spent,reserved_minor reserved FROM agent_cost_budgets WHERE tenant_id='t1' AND agent_id='thebe'").get()});
// Reject malformed identifiers before any accounting mutation.
for(const bad of ["", "  ", null, 42]){
 const result=await reserveAgentCost(env,{...args,runId:bad,reservationId:"invalid-id",estimatedCostMinor:1});
 assert.equal(result.code,"cost_reservation_invalid");
}
assert.equal((await settleAgentCost(env,{...args,reservationId:"  ",actualCostMinor:1,provider:"test",model:"mock",inputTokens:0,outputTokens:0})).code,"cost_settlement_invalid");
assert.equal((await releaseAgentCost(env,{...args,reservationId:"  "})).code,"cost_release_invalid");
assert.equal((await reserve("r1",600)).allowed,true);
assert.deepEqual(balance(),{spent:0,reserved:600});
assert.equal((await reserve("r2",500)).allowed,false);
assert.deepEqual(balance(),{spent:0,reserved:600});
assert.equal((await reserve("r1",600)).allowed,false); // duplicate run must roll back budget update
assert.deepEqual(balance(),{spent:0,reserved:600});
assert.equal((await reserve("r3",100)).allowed,true);
assert.equal((await reserveAgentCost(env,{...args,actorTenantId:"t2",runId:"bad",reservationId:"bad",estimatedCostMinor:10})).allowed,false);
const settlement={...args,reservationId:"r1",actualCostMinor:650,provider:"test",model:"mock",inputTokens:10,outputTokens:20};
assert.equal((await settleAgentCost(env,settlement)).allowed,true);
assert.deepEqual(balance(),{spent:650,reserved:100});
assert.equal((await settleAgentCost(env,settlement)).allowed,false);
assert.deepEqual(balance(),{spent:650,reserved:100});
assert.equal((await releaseAgentCost(env,{...args,reservationId:"r3"})).allowed,true);
assert.deepEqual(balance(),{spent:650,reserved:0});
assert.equal((await releaseAgentCost(env,{...args,reservationId:"r3"})).allowed,false);
assert.equal((await reserve("r4",350)).allowed,true);
assert.equal((await settleAgentCost(env,{...settlement,reservationId:"r4",actualCostMinor:351})).allowed,false);
assert.deepEqual(balance(),{spent:650,reserved:350});
assert.equal((await releaseAgentCost(env,{...args,reservationId:"r4"})).allowed,true);
assert.deepEqual(balance(),{spent:650,reserved:0});
const events=db.prepare("SELECT reservation_id,event_type FROM agent_cost_events ORDER BY id").all().map(row=>({...row}));
assert.deepEqual(events,[{reservation_id:"r1",event_type:"reserved"},{reservation_id:"r3",event_type:"reserved"},{reservation_id:"r1",event_type:"settled"},{reservation_id:"r3",event_type:"released"},{reservation_id:"r4",event_type:"reserved"},{reservation_id:"r4",event_type:"released"}]);
assert.throws(()=>db.prepare("DELETE FROM agent_cost_events WHERE reservation_id='r1'").run(),/cost_event_delete_forbidden/);
assert.throws(()=>db.prepare("UPDATE agent_cost_events SET actual_minor=0 WHERE reservation_id='r1'").run(),/cost_event_immutable/);
assert.throws(()=>db.prepare("DELETE FROM agent_cost_reservations WHERE id='r1'").run(),/cost_reservation_delete_forbidden/);
assert.throws(()=>db.prepare("UPDATE agent_cost_reservations SET estimate_minor=0 WHERE id='r1'").run(),/cost_reservation_identity_immutable/);
// A malicious direct SQL transition must not bypass the budget invariant.
db.prepare("INSERT INTO agent_cost_reservations(id,tenant_id,agent_id,run_id,estimate_minor,status) VALUES('direct','t1','thebe','direct',100,'reserved')").run();
assert.deepEqual(balance(),{spent:650,reserved:100});
assert.throws(()=>db.prepare("UPDATE agent_cost_reservations SET status='settled',actual_minor=400 WHERE id='direct'").run(),/cost_settlement_budget_rejected/);
assert.deepEqual(balance(),{spent:650,reserved:100});
assert.equal(db.prepare("SELECT status FROM agent_cost_reservations WHERE id='direct'").get().status,'reserved');
assert.throws(()=>db.prepare("UPDATE agent_cost_reservations SET status='reserved' WHERE id='direct'").run(),/cost_invalid_transition/);
db.prepare("UPDATE agent_cost_reservations SET status='released' WHERE id='direct'").run();
assert.deepEqual(balance(),{spent:650,reserved:0});
// A ledger entry cannot impersonate another tenant or invent a lifecycle event.
assert.throws(()=>db.prepare("INSERT INTO agent_cost_events(reservation_id,tenant_id,agent_id,event_type,estimate_minor) VALUES('r1','other','thebe','released',600)").run(),/cost_event_reservation_mismatch/);
assert.throws(()=>db.prepare("INSERT INTO agent_cost_events(reservation_id,tenant_id,agent_id,event_type,estimate_minor) VALUES('r1','t1','thebe','released',600)").run(),/cost_event_reservation_mismatch/);
assert.throws(()=>db.prepare("INSERT INTO agent_cost_events(reservation_id,tenant_id,agent_id,event_type,estimate_minor) VALUES('direct','t1','thebe','reserved',100)").run(),/cost_event_reservation_mismatch/);
assert.throws(() => db.prepare("INSERT INTO agent_cost_events(reservation_id,tenant_id,agent_id,event_type,estimate_minor) VALUES(?,?,?,?,?)").run('r1','t2','thebe','reserved',600), /cost_event_(tenant_mismatch|reservation_mismatch)/);
const tenantCheck=db.prepare("SELECT count(*) AS n FROM agent_cost_events WHERE tenant_id='t1'").get();
assert.equal(tenantCheck.n,6);
assert.throws(() => db.prepare("INSERT INTO agent_cost_events(reservation_id,tenant_id,agent_id,event_type,estimate_minor) VALUES ('r1','t2','thebe','reserved',600)").run(), /cost_event_(tenant_mismatch|reservation_mismatch)/);
assert.throws(() => db.prepare("UPDATE agent_cost_reservations SET actual_minor=0 WHERE id='r1'").run(), /cost_terminal_usage_immutable/);
assert.throws(() => db.prepare("UPDATE agent_cost_reservations SET model='changed' WHERE id='r1'").run(), /cost_terminal_usage_immutable/);
const gaps=db.prepare("SELECT reservation_id FROM agent_cost_ledger_gaps ORDER BY reservation_id").all().map(x=>x.reservation_id);
assert.deepEqual(gaps,["direct"]);
assert.throws(() => db.prepare("UPDATE agent_cost_reservations SET status='released' WHERE id='r1'").run(), /cost_(terminal_status_immutable|invalid_transition)/);
db.prepare("INSERT INTO agent_cost_reservations(id,tenant_id,agent_id,run_id,estimate_minor) VALUES('pending-immutability','t1','thebe','pending-immutability',1)").run();
assert.throws(() => db.prepare("UPDATE agent_cost_reservations SET actual_minor=1 WHERE id='pending-immutability'").run(), /cost_pending_usage_immutable/);
assert.throws(() => db.prepare("UPDATE agent_cost_reservations SET model='forged' WHERE id='pending-immutability'").run(), /cost_pending_usage_immutable/);
assert.deepEqual({...db.prepare("SELECT actual_minor,model FROM agent_cost_reservations WHERE id='pending-immutability'").get()},{actual_minor:null,model:null});
console.log("Agent cost transactional lifecycle and audit tests passed");
