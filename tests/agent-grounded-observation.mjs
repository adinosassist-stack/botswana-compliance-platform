import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {runGroundedFinancialObservation} from "../cloudflare/src/agent-grounded-observation.js";

const db=new DatabaseSync(":memory:");
try{
  db.exec(readFileSync("cloudflare/schema.sql","utf8"));
  const migrations=readdirSync("cloudflare/migrations").filter(f=>/^\d{3}_.*\.sql$/.test(f)&&Number(f.slice(0,3))>=44).sort();
  assert.equal(migrations.at(-1),JSON.parse(readFileSync("RELEASE_PROFILE.json","utf8")).latest_cloudflare_migration);
  for(const file of migrations)db.exec(readFileSync("cloudflare/migrations/"+file,"utf8"));
  const schema=readFileSync("cloudflare/experimental/agent_cost_accounting.sql","utf8");
  db.exec(schema);db.exec(schema); // Qualification includes reapplication without changing existing rows.
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  db.exec("INSERT INTO tenants(id,name) VALUES('t1','Pilot'),('t2','Other'); INSERT INTO agent_cost_budgets(tenant_id,agent_id,budget_minor) VALUES('t1','thebe',1000)");
  assert.equal(db.prepare("SELECT enabled FROM agent_cost_budgets").get().enabled,0);
  let calls=0;
  const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this},first(){return db.prepare(sql).get(...args)},all(){return {results:db.prepare(sql).all(...args)}},run(){return db.prepare(sql).run(...args)}}},
    async batch(statements){db.exec("BEGIN IMMEDIATE");try{const result=statements.map(s=>({meta:{changes:Number(s.run().changes)}}));db.exec("COMMIT");return result}catch(e){db.exec("ROLLBACK");throw e}}};
  const model={id:"mock",provider:"test",enabled:true,taskClasses:["summary"],estimatedCostUsd:0.01,evalPassRate:0.99,
    externalProcessingApproved:true,maxOutputTokens:10,inputTokenOverhead:10,
    pricing:{inputBwpMinorPerMillion:100000,outputBwpMinorPerMillion:100000}};
  const env={DB,AGENT_MODEL_EXECUTION_ENABLED:"1",AGENT_APPROVED_MODELS_JSON:JSON.stringify([model])};
  const auth={tenant_id:"t1",user_id:"u1",role:"owner"};
  const input={runId:"grounded",budgetUsd:0.1};
  db.prepare("INSERT INTO finance_accounts(id,tenant_id,name,account_type,opening_balance_minor,status) VALUES(?,?,?,?,?,?)").run('a1','t1','Pilot','bank',12345,'active');
  db.prepare("INSERT INTO finance_accounts(id,tenant_id,name,account_type,opening_balance_minor,status) VALUES(?,?,?,?,?,?)").run('a2','t2','Other','bank',987654,'active');
  const adapters={test:async request=>{calls++;assert.ok(request.prompt.includes('12345'));assert.ok(!request.prompt.includes('987654'));
    assert.equal(db.prepare("SELECT status FROM agent_cost_reservations WHERE run_id=?").get(request.runId).status,'reserved');
    return {text:"Advisory narrative",usage:{inputTokens:100,outputTokens:5}}}};
  const run=(extra={})=>runGroundedFinancialObservation({env,auth,input,adapters,...extra});
  assert.equal((await run()).ok,false,"default disabled ledger must block provider");assert.equal(calls,0);
  db.exec("UPDATE agent_cost_budgets SET enabled=1");
  for(const field of ['prompt','models','tenantId','data','actionKey'])assert.equal((await run({input:{...input,[field]:'forged'}})).code,'grounded_input_invalid');
  assert.equal((await run({auth:{...auth,role:'reviewer'}})).code,'model_actor_forbidden');
  assert.equal((await run({env:{...env,AGENT_RUNTIME_KILL_SWITCH:'1'}})).code,'runtime_kill_switch_active');
  const result=await run();assert.equal(result.ok,true);assert.equal(result.outputVerified,false);assert.equal(result.executionAllowed,false);
  assert.equal(result.evidence.data.cashPositionMinor,12345);assert.equal(result.evidence.amountUnit,'minor_units');
  assert.ok(result.evidence.sourceRef);assert.ok(result.evidence.authoritativeSource);assert.equal(result.costStatus,'settled');
  assert.equal((await run()).ok,false);assert.equal(calls,1);
  db.exec('DROP TABLE finance_accounts');
  assert.equal((await run({input:{...input,runId:'missing-source'}})).code,'authoritative_read_unavailable');assert.equal(calls,1);
  assert.equal(db.prepare("SELECT count(*) n FROM agent_cost_reservations WHERE run_id='missing-source'").get().n,0);
  db.exec(readFileSync("cloudflare/migrations/044_v79_finance_reconciliation.sql","utf8"));
  // Document the promotion blocker rather than claiming production readiness:
  // experimental balances can outlive a deleted tenant (no tenant FK).
  db.exec("INSERT INTO tenants(id,name) VALUES('purge-probe','Probe'); INSERT INTO agent_cost_budgets(tenant_id,agent_id,budget_minor) VALUES('purge-probe','thebe',1); DELETE FROM tenants WHERE id='purge-probe'");
  assert.equal(db.prepare("SELECT count(*) n FROM agent_cost_budgets WHERE tenant_id='purge-probe'").get().n,1);
  console.log("Accounting schema qualified over release migration chain; grounded financial observation tenant isolation and fail-closed lifecycle: PASS (experimental purge blocker remains)");
}finally{db.close()}
