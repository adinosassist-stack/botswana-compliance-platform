import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {runAgentCostMigration} from "../scripts/migrate-agent-cost-accounting.mjs";
import {ledgerSchemaReady} from "../cloudflare/src/ledger-schema-readiness.js";
const manifest=JSON.parse(readFileSync('scripts/manifests/agent-cost-schema.json','utf8'));
assert.equal(readFileSync(manifest.source.path,'utf8'),readFileSync('cloudflare/experimental/agent_cost_accounting.sql','utf8'));
const db=new DatabaseSync(':memory:');
try{
  db.exec(readFileSync('cloudflare/schema.sql','utf8'));
  for(const file of readdirSync('cloudflare/migrations').filter(f=>/^\d{3}_.*\.sql$/.test(f)&&Number(f.slice(0,3))>=44&&Number(f.slice(0,3))<68).sort())db.exec(readFileSync('cloudflare/migrations/'+file,'utf8'));
  const query=sql=>db.prepare(sql).all();
  const env={DB:{prepare(sql){return {first(){return db.prepare(sql).get()}}}}};
  assert.equal(await ledgerSchemaReady(env),false,'068 is required for readiness');
  let bookmarks=0,writes=0;
  const options={query,expectedSourceSha256:manifest.source.sha256,
    captureBookmark:async()=>{bookmarks++;return 'synthetic-bookmark'},
    applyReviewedSql:async({sql,path,sourceSha256})=>{writes++;assert.equal(path,manifest.source.path);assert.equal(sourceSha256,manifest.source.sha256);db.exec(sql)}};
  assert.equal((await runAgentCostMigration(options)).code,'migration_plan_ready');assert.equal(bookmarks,0);assert.equal(writes,0);
  assert.equal((await runAgentCostMigration({...options,apply:'true'})).code,'migration_mode_invalid');
  assert.equal((await runAgentCostMigration({...options,apply:true,expectedSourceSha256:'wrong'})).code,'migration_source_pin_required');
  assert.equal((await runAgentCostMigration({...options,apply:true,captureBookmark:async()=>''})).code,'migration_bookmark_unavailable');assert.equal(writes,0);
  const race=await runAgentCostMigration({...options,apply:true,captureBookmark:async()=>{db.exec('CREATE TABLE agent_cost_unexpected(id TEXT)');return 'race-bookmark'}});
  assert.equal(race.code,'migration_schema_changed');assert.equal(writes,0);db.exec('DROP TABLE agent_cost_unexpected');
  const failed=await runAgentCostMigration({...options,apply:true,applyReviewedSql:async()=>{throw Error('private-transport-detail')}});
  assert.equal(failed.code,'migration_apply_failed');assert.equal(failed.bookmark,'synthetic-bookmark');assert.ok(!JSON.stringify(failed).includes('private-transport-detail'));
  assert.equal((await runAgentCostMigration({...options,apply:true,applyReviewedSql:async()=>{}})).code,'migration_verification_failed');
  const applied=await runAgentCostMigration({...options,apply:true});assert.equal(applied.code,'migration_applied');assert.equal(applied.activationChanged,false);
  assert.equal(await ledgerSchemaReady(env),true);assert.equal(writes,1);
  assert.equal((await runAgentCostMigration({...options,apply:true})).code,'migration_already_applied');assert.equal(writes,1);
  db.exec("INSERT INTO tenants(id,name) VALUES('t1','Pilot'); INSERT INTO agent_cost_budgets(tenant_id,agent_id,budget_minor) VALUES('t1','thebe',100)");
  assert.equal(db.prepare("SELECT enabled FROM agent_cost_budgets").get().enabled,0);
  db.exec('DROP TRIGGER agent_cost_tenant_purge_guard');assert.equal(await ledgerSchemaReady(env),false);
  assert.equal((await runAgentCostMigration({...options,apply:true})).code,'accounting_schema_incompatible');assert.equal(writes,1);
  console.log('Migration 068: dry run, source pin, bookmark, race/partial rejection, verification and disabled activation PASS');
}finally{db.close()}
