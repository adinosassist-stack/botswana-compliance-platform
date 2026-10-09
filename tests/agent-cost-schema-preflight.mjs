import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {inspectAgentCostSchema} from "../scripts/agent-cost-schema-preflight.mjs";

const db=new DatabaseSync(":memory:");
try{
  const query=sql=>{assert.match(sql,/^(SELECT|PRAGMA)/);return db.prepare(sql).all()};
  assert.equal((await inspectAgentCostSchema(query)).code,"schema_prerequisites_missing");
  db.exec(readFileSync("cloudflare/schema.sql","utf8"));
  const absent=await inspectAgentCostSchema(query);assert.equal(absent.readyForReviewedFreshInstall,true);
  assert.equal(absent.migrationAllowed,false);assert.equal(absent.executionAllowed,false);
  db.exec(readFileSync("cloudflare/experimental/agent_cost_accounting.sql","utf8"));
  const compatible=await inspectAgentCostSchema(query);assert.equal(compatible.code,"accounting_schema_compatible");
  assert.equal(compatible.migrationRequired,false);
  db.exec("INSERT INTO tenants(id,name) VALUES('t1','Pilot'); INSERT INTO agent_cost_budgets(tenant_id,agent_id,budget_minor) VALUES('t1','thebe',100)");
  const before=db.prepare("SELECT total_changes() n").get().n;
  assert.equal((await inspectAgentCostSchema(query)).ok,true);
  assert.equal(db.prepare("SELECT total_changes() n").get().n,before,"inspection must not mutate rows");
  db.exec("DROP TRIGGER agent_cost_reserve_deletion_guard");
  assert.ok((await inspectAgentCostSchema(query)).missingObjects.includes('agent_cost_reserve_deletion_guard'));
  db.exec("CREATE TRIGGER agent_cost_reserve_deletion_guard BEFORE INSERT ON agent_cost_reservations BEGIN SELECT 1; END");
  assert.ok((await inspectAgentCostSchema(query)).changedObjects.includes('agent_cost_reserve_deletion_guard'));
  db.exec("CREATE TABLE agent_cost_unreviewed(id TEXT)");
  assert.ok((await inspectAgentCostSchema(query)).unexpectedObjects.includes('agent_cost_unreviewed'));
  const legacy=new DatabaseSync(':memory:');
  try{
    legacy.exec(readFileSync('cloudflare/schema.sql','utf8'));
    legacy.exec('CREATE TABLE agent_cost_budgets(tenant_id TEXT,agent_id TEXT,budget_minor INTEGER,PRIMARY KEY(tenant_id,agent_id))');
    const inspected=await inspectAgentCostSchema(sql=>legacy.prepare(sql).all());
    assert.equal(inspected.code,'accounting_schema_incompatible');assert.ok(inspected.changedObjects.includes('agent_cost_budgets'));
    legacy.exec('ALTER TABLE deletion_requests DROP COLUMN processing_token');
    assert.equal((await inspectAgentCostSchema(sql=>legacy.prepare(sql).all())).code,'schema_prerequisites_missing');
  }finally{legacy.close()}
  assert.equal((await inspectAgentCostSchema(async()=>{throw Error('private-storage-detail')})).code,'schema_inspection_unavailable');
  assert.equal((await inspectAgentCostSchema(sql=>sql==='PRAGMA foreign_key_check'?[{rowid:42}]:query(sql))).code,'schema_foreign_key_violations');
  console.log('Agent cost schema preflight: read-only fresh/compatible/legacy/partial/drift/FK inspection PASS');
}finally{db.close()}
