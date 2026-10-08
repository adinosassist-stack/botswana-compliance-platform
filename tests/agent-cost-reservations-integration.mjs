import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {reserveAgentCost,settleAgentCost,releaseAgentCost} from "../cloudflare/src/agent-cost-reservations.js";
const db=new DatabaseSync(":memory:");
db.exec(readFileSync(new URL("../cloudflare/experimental/agent_cost_accounting.sql",import.meta.url),"utf8"));
db.prepare("INSERT INTO agent_cost_budgets(tenant_id,agent_id,budget_minor,enabled) VALUES('t1','thebe',1000,1)").run();
const env={DB:{
 prepare(sql){let values=[];return {bind(...v){values=v;return this},first(){return db.prepare(sql).get(...values)},run(){return db.prepare(sql).run(...values)}}},
 async batch(statements){db.exec("BEGIN IMMEDIATE");try{const results=statements.map(s=>({meta:{changes:Number(s.run().changes)}}));db.exec("COMMIT");return results}catch(e){db.exec("ROLLBACK");throw e}}
}};
const args={tenantId:"t1",actorTenantId:"t1",agentId:"thebe"};
const reserve=(id,amount)=>reserveAgentCost(env,{...args,runId:id,reservationId:id,estimatedCostMinor:amount});
const balance=()=>({...db.prepare("SELECT spent_minor spent,reserved_minor reserved FROM agent_cost_budgets WHERE tenant_id='t1' AND agent_id='thebe'").get()});
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
console.log("Agent cost transactional lifecycle and audit tests passed");
