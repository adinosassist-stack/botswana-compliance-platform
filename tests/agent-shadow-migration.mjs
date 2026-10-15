import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {inspectAgentShadowSchema} from "../scripts/agent-shadow-schema-preflight.mjs";
import {runAgentShadowMigration} from "../scripts/migrate-agent-shadow.mjs";

const manifest=JSON.parse(readFileSync("scripts/manifests/agent-shadow-schema.json","utf8"));
const source=readFileSync(manifest.source.path,"utf8");
function fixture(tip=68){
  const db=new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(readFileSync("cloudflare/schema.sql","utf8"));
  for(const file of readdirSync("cloudflare/migrations").filter(f=>/^\d{3}_.*\.sql$/.test(f)&&Number(f.slice(0,3))>=44&&Number(f.slice(0,3))<=tip).sort())db.exec(readFileSync("cloudflare/migrations/"+file,"utf8"));
  return db;
}
async function scenario(fn,tip=68){const db=fixture(tip);try{await fn(db,async sql=>db.prepare(sql).all())}finally{db.close()}}
await scenario(async(db,query)=>{
  const before=JSON.stringify(db.prepare("SELECT * FROM sqlite_master ORDER BY type,name").all());
  let writes=0,bookmarks=0;
  const transport={query,expectedSourceSha256:manifest.source.sha256,captureBookmark:async()=>{bookmarks++;return "recovery-bookmark"},
    applyReviewedSql:async request=>{writes++;assert.equal(request.bookmark,"recovery-bookmark");assert.equal(request.sql,source);assert.equal(request.path,manifest.source.path);db.exec(request.sql)}};
  assert.equal((await inspectAgentShadowSchema(query)).code,"shadow_schema_absent");
  assert.equal((await runAgentShadowMigration(transport)).code,"migration_plan_ready");
  assert.equal(JSON.stringify(db.prepare("SELECT * FROM sqlite_master ORDER BY type,name").all()),before);
  assert.equal(writes,0);assert.equal(bookmarks,0);
  assert.equal((await runAgentShadowMigration({...transport,apply:true,expectedSourceSha256:"wrong"})).code,"migration_source_pin_required");
  assert.equal((await runAgentShadowMigration({...transport,apply:true,captureBookmark:async()=>{throw Error("unavailable")}})).code,"migration_bookmark_unavailable");
  assert.equal(writes,0);
  const failed=await runAgentShadowMigration({...transport,apply:true,applyReviewedSql:async()=>{throw Error("remote failure")}});
  assert.equal(failed.code,"migration_apply_failed");assert.equal(failed.reconciliationRequired,true);
  const applied=await runAgentShadowMigration({...transport,apply:true});
  assert.equal(applied.code,"migration_applied");assert.equal(applied.executionAllowed,false);assert.equal(applied.activationChanged,false);
  assert.equal(writes,1);
  assert.equal((await inspectAgentShadowSchema(query)).code,"shadow_schema_compatible");
  assert.equal((await runAgentShadowMigration({...transport,apply:true})).code,"migration_already_applied");assert.equal(writes,1);
  db.exec("DROP INDEX agent_cost_shadow_events_tenant_time");
  assert.equal((await runAgentShadowMigration({...transport,apply:true})).code,"shadow_schema_incompatible");assert.equal(writes,1);
});
await scenario(async(db,query)=>{assert.equal((await inspectAgentShadowSchema(query)).code,"shadow_prerequisites_missing")},67);
await scenario(async(db,query)=>{
  let writes=0;
  const result=await runAgentShadowMigration({query,apply:true,expectedSourceSha256:manifest.source.sha256,
    captureBookmark:async()=>{db.exec("CREATE TABLE agent_cost_shadow_events(id TEXT PRIMARY KEY)");return "bookmark"},applyReviewedSql:async()=>writes++});
  assert.equal(result.code,"migration_schema_changed");assert.equal(writes,0);
});
await scenario(async(db,query)=>{
  db.exec(source);db.exec("CREATE TRIGGER unrelated_name AFTER INSERT ON agent_cost_shadow_events BEGIN SELECT 1; END");
  assert.equal((await inspectAgentShadowSchema(query)).code,"shadow_schema_incompatible");
});
await scenario(async(db,query)=>{
  const result=await runAgentShadowMigration({query,apply:true,expectedSourceSha256:manifest.source.sha256,
    captureBookmark:async()=>"bookmark",applyReviewedSql:async()=>db.exec("CREATE TABLE agent_cost_shadow_events(id TEXT PRIMARY KEY)")});
  assert.equal(result.code,"migration_verification_failed");assert.equal(result.reconciliationRequired,true);
});
await scenario(async(db,query)=>{
  db.exec(source);db.exec("PRAGMA foreign_keys=OFF");
  db.exec("INSERT INTO agent_cost_shadow_events(id,tenant_id,run_id,actor_user_id,detail_json) VALUES('bad','missing','missing','missing','{}')");
  assert.equal((await inspectAgentShadowSchema(query)).code,"shadow_prerequisites_missing");
});
console.log("Migration 069 real-schema plan, prerequisite, source pin, bookmark, race, apply, replay, partial/incompatible schema and foreign-key checks PASS");
