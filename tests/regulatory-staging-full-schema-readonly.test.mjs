// Staging readiness qualification against the exact checked-in whole-schema D1 SQL.
// Uses synthetic tenants, rules and obligations only. No network or Cloudflare credentials.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {STAGING_REGULATORY_QUERIES} from "../scripts/regulatory-staging-readonly-attestor.mjs";

const schema=readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const keys=["sources","registry","legacyRules","obligationCounts"];

function sqliteFixture(){
  const db=new DatabaseSync(":memory:");
  db.exec(schema);
  return db;
}

test("all four staging SELECTs prepare and execute on the full current D1 schema",()=>{
  const db=sqliteFixture();
  try{
    assert.deepEqual(Object.keys(STAGING_REGULATORY_QUERIES),keys);
    db.exec("PRAGMA query_only=ON;");
    for(const [key,sql] of Object.entries(STAGING_REGULATORY_QUERIES)){
      assert.match(sql.replace(/^--[^\n]*(?:\n|$)/gm,"").trim(),/^(SELECT|WITH)\b/i,key);
      const rows=db.prepare(sql).all();
      assert.ok(Array.isArray(rows),"expected D1 SELECT rows for "+key);
    }
    assert.throws(()=>db.exec("CREATE TABLE read_only_breach(id TEXT)"),/readonly|read.only/i);
  }finally{db.close()}
});

test("legacy VAT aggregate is consistent with synthetic obligations across tenants and schedules",()=>{
  const db=sqliteFixture();
  try{
    db.prepare("INSERT INTO tenants(id,name) VALUES(?,?)").run("fixture-tenant-a","Synthetic A");
    db.prepare("INSERT INTO tenants(id,name) VALUES(?,?)").run("fixture-tenant-b","Synthetic B");
    db.prepare("INSERT INTO regulatory_rules(id,rule_key,version,title,summary,action_json,status) VALUES(?,?,?,?,?,?,?)")
      .run("fixture-legacy-vat","bw.burs.vat.return-payment.25-days",1,"Fixture legacy VAT","Synthetic rule",
        JSON.stringify({operationalization:"vat_category_period",dueDaysAfterPeriodEnd:25}),"published");
    db.prepare("INSERT INTO compliance_obligations(id,tenant_id,rule_id,obligation_key,title,status,due_at) VALUES(?,?,?,?,?,?,?)")
      .run("fixture-obligation-a","fixture-tenant-a","fixture-legacy-vat","fixture-a","Synthetic VAT item","open","2026-09-25");
    db.prepare("INSERT INTO compliance_obligations(id,tenant_id,rule_id,obligation_key,title,status,due_at) VALUES(?,?,?,?,?,?,?)")
      .run("fixture-obligation-b","fixture-tenant-b","fixture-legacy-vat","fixture-b","Synthetic VAT item","completed","2026-10-25");
    db.prepare("INSERT INTO statutory_schedule_status(tenant_id,rule_id,schedule_type,config_status) VALUES(?,?,?,?)")
      .run("fixture-tenant-a","fixture-legacy-vat","VAT","ready");
    db.prepare("INSERT INTO statutory_schedule_status(tenant_id,rule_id,schedule_type,config_status) VALUES(?,?,?,?)")
      .run("fixture-tenant-b","fixture-legacy-vat","VAT","needs_input");
    db.prepare("INSERT INTO regulatory_sources(id,authority,title,source_url) VALUES(?,?,?,?)")
      .run("fixture-source-a","Synthetic Authority","Synthetic staging source","https://example.test/source");
    db.prepare("INSERT INTO regulatory_seed_registry(pack_key,seed_key,entity_type,entity_id,definition_hash,imported_by_user_id) VALUES(?,?,?,?,?,?)")
      .run("botswana-foundation-v1","source:fixture-source-a","source","fixture-source-a","synthetic-hash","fixture-maker");

    db.exec("PRAGMA query_only=ON;");
    const sources=db.prepare(STAGING_REGULATORY_QUERIES.sources).all();
    assert.equal(sources.length,1);
    assert.equal(sources[0].id,"fixture-source-a");
    assert.equal(sources[0].snapshot_count,0);
    assert.equal(sources[0].review_count,0);
    const registry=db.prepare(STAGING_REGULATORY_QUERIES.registry).all();
    assert.equal(registry.length,1);
    assert.equal(registry[0].seed_key,"source:fixture-source-a");
    const rules=db.prepare(STAGING_REGULATORY_QUERIES.legacyRules).all();
    assert.equal(rules.length,1);
    assert.equal(rules[0].status,"published");
    const rows=db.prepare(STAGING_REGULATORY_QUERIES.obligationCounts).all();
    assert.equal(rows.length,1);
    const row=rows[0];
    for(const [key,expected] of Object.entries({
      total_obligations:2,affected_tenants:2,open_obligations:1,
      completed_obligations:1,schedules:2,ready_schedules:1,needs_input_schedules:1
    }))assert.equal(row[key],expected,key);
    for(const prohibited of ["tenant_id","actor_user_id","email","obligation_key","description","title"]){
      assert.equal(Object.keys(row).includes(prohibited),false,"must not return "+prohibited);
    }
    assert.equal(row.earliest_due_at,"2026-09-25");
    assert.equal(row.latest_due_at,"2026-10-25");
  }finally{db.close()}
});
