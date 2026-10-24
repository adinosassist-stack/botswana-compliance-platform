import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";
import {DatabaseSync} from "node:sqlite";
import {BOTSWANA_FOUNDATION_PACK_V1,BOTSWANA_FOUNDATION_PACK_V1_HASH} from "../cloudflare/src/generated/foundation-pack-v1.js";
import {
  inspectFoundationSourceMetadata,publicFoundationSourcePreflight,
  updateUnreviewedFoundationSourceMetadata,foundationSourceDesired
} from "../cloudflare/src/regulatory-foundation-source-reconciliation.js";
import {normalizeRegulatoryRuleInsertSql} from "../cloudflare/src/regulatory-rule-insert-sql-fix.js";
import {inspectActiveLegacyVatRules,publicActiveLegacyVatRules} from "../cloudflare/src/regulatory-foundation-legacy-vat.js";

const current=BOTSWANA_FOUNDATION_PACK_V1;
const stableValue=value=>Array.isArray(value)?value.map(stableValue):value&&typeof value==="object"
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])])):value;
const stableJson=value=>JSON.stringify(stableValue(value));
const sha256Hex=async value=>crypto.createHash("sha256").update(String(value)).digest("hex");
const actor={user_id:"fixture-maker",email:"maker@example.test"};
const newId=(()=>{let n=0;return()=>`seed-fixture-${++n}`})();

function historicPack(){
  const pack=structuredClone(current);
  pack.version="1.7";pack.asOf="2026-09-28";
  pack.sources=pack.sources.filter(s=>s.key!=="industrial-licence-eservices");
  const source=k=>pack.sources.find(x=>x.key===k);
  source("botswana-egp-procurement-2026").title="Government e-Procurement system implementation tender";
  source("botswana-egp-procurement-2026").publicationDate="2026-08-13";
  source("botswana-egp-procurement-2026").notes="Government procurement was active in August 2026.";
  source("burs-payments").notes="Official BURS payment table: PAYE within 15 days; VAT within 25 days.";
  source("burs-vat-act-2026").notes="Value Added Tax Act 2026; P1m VAT registration threshold.";
  const vat=pack.rules.find(x=>x.key==="vat-return-payment");
  vat.ruleKey="bw.burs.vat.return-payment.25-days";
  vat.summary="BURS states VAT returns and VAT payable are due within 25 days after each assigned tax period.";
  vat.sourceKeys=["burs-payments","burs-vat-category-regulations"];
  delete vat.effectiveFrom;
  vat.action.dueDaysAfterPeriodEnd=25;
  vat.action.obligation.description="Submit VAT return and pay within 25 days after period end.";
  const industry=pack.rules.find(x=>x.key==="industrial-annual-fee");
  industry.sourceKeys=["industrial-licence-gov"];industry.confidence="high";
  industry.summary="Government trade eServices states industrial licences are indefinite, annual fee is 25%.";
  return pack;
}

function stage({fullSchema=false}={}){
  const sql=new DatabaseSync(":memory:");
  if(fullSchema){
    // Create every table, index and migration in the checked-in D1 SQL schema.
    sql.exec(fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8"));
  }else sql.exec(`
    CREATE TABLE regulatory_sources(
      id TEXT PRIMARY KEY,jurisdiction TEXT DEFAULT 'BW',authority TEXT NOT NULL,title TEXT NOT NULL,
      source_url TEXT NOT NULL,source_type TEXT DEFAULT 'official',
      publication_date TEXT,effective_date TEXT,status TEXT DEFAULT 'pending',
      notes TEXT,submitted_by_user_id TEXT,verification_status TEXT DEFAULT 'unverified',
      latest_snapshot_version INTEGER DEFAULT 0,content_hash TEXT,metadata_hash TEXT,
      approved_by_user_id TEXT,approved_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE regulatory_source_snapshots(id TEXT PRIMARY KEY,source_id TEXT,version INTEGER);
    CREATE TABLE regulatory_source_reviews(id TEXT PRIMARY KEY,source_id TEXT);
    CREATE TABLE regulatory_seed_registry(
      pack_key TEXT,seed_key TEXT,entity_type TEXT,entity_id TEXT,definition_hash TEXT,
      imported_by_user_id TEXT,imported_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(pack_key,seed_key)
    );
    CREATE TABLE regulatory_conflicts(
      id TEXT PRIMARY KEY,topic_key TEXT,source_ids_json TEXT,description TEXT,
      status TEXT,resolution_notes TEXT,resolved_at TEXT
    );
    CREATE TABLE regulatory_conflict_sources(conflict_id TEXT,source_id TEXT,
      PRIMARY KEY(conflict_id,source_id));
    CREATE TABLE regulatory_rules(
      id TEXT PRIMARY KEY,rule_key TEXT,version INTEGER,title TEXT,summary TEXT,
      applicability_json TEXT,action_json TEXT,source_ids_json TEXT,
      effective_from TEXT,effective_to TEXT,status TEXT,confidence TEXT,created_by_user_id TEXT,
      definition_hash TEXT,supersedes_rule_id TEXT,UNIQUE(rule_key,version)
    );
    CREATE TABLE regulatory_rule_events(
      id INTEGER PRIMARY KEY AUTOINCREMENT,rule_id TEXT,event_type TEXT,event_data TEXT,
      actor_user_id TEXT
    );
    CREATE TABLE regulatory_pack_imports(
      id TEXT PRIMARY KEY,pack_key TEXT,pack_version NUMERIC,actor_user_id TEXT,
      actor_email TEXT,sources_created INTEGER,rules_created INTEGER,
      conflicts_created INTEGER,sources_existing INTEGER,rules_existing INTEGER,
      conflicts_existing INTEGER,status TEXT,summary_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE platform_regulatory_audit(
      id INTEGER PRIMARY KEY AUTOINCREMENT,actor_user_id TEXT,actor_email TEXT,
      action TEXT,entity_type TEXT,entity_id TEXT,event_data TEXT
    );
    CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE compliance_obligations(id TEXT PRIMARY KEY,tenant_id TEXT,rule_id TEXT,status TEXT);
  `);
  // D1's SQL guard fixes the historic draft-rule insertion placeholder typo.
  const prepare=text=>{
    const stmt=sql.prepare(normalizeRegulatoryRuleInsertSql(text));
    const methods=(...params)=>({
      first:async()=>stmt.get(...params)||null,
      all:async()=>({results:stmt.all(...params)}),
      run:async()=>({meta:{changes:Number(stmt.run(...params).changes)}})
    });
    return {...methods(),bind:(...params)=>methods(...params)};
  };
  const DB={prepare,batch:async items=>{const out=[];for(const item of items)out.push(await item.run());return out}};
  sql.prepare("INSERT INTO tenants(id,name) VALUES(?,?)").run("fixture-tenant","No regulatory action allowed");
  if(fullSchema){
    sql.prepare("INSERT INTO users(id,email) VALUES(?,?)").run(actor.user_id,actor.email);
  }else sql.prepare("INSERT INTO compliance_obligations(id,tenant_id,rule_id,status) VALUES(?,?,?,?)")
    .run("untouched-obligation","fixture-tenant","legacy","open");
  const env={DB};
  const seeds={
    async seedRegistryGet(e,packKey,seedKey){return e.DB.prepare("SELECT * FROM regulatory_seed_registry WHERE pack_key=? AND seed_key=? LIMIT 1").bind(packKey,seedKey).first()},
    async seedRegistryPut(e,packKey,seedKey,entityType,entityId,hash,a){
      await e.DB.prepare(`INSERT INTO regulatory_seed_registry(pack_key,seed_key,entity_type,entity_id,definition_hash,imported_by_user_id)
        VALUES(?,?,?,?,?,?) ON CONFLICT(pack_key,seed_key) DO UPDATE SET
        entity_id=excluded.entity_id,definition_hash=excluded.definition_hash,imported_by_user_id=excluded.imported_by_user_id,
        imported_at=CURRENT_TIMESTAMP`).bind(packKey,seedKey,entityType,entityId,hash,a.user_id).run();
    }
  };
  const helper={
    ...seeds,id:newId,stableJson,sha256Hex,
    BOTSWANA_FOUNDATION_PACK_V1:current,BOTSWANA_FOUNDATION_PACK_V1_HASH,
    inspectFoundationSourceMetadata,publicFoundationSourcePreflight,
    updateUnreviewedFoundationSourceMetadata,
    inspectActiveLegacyVatRules,publicActiveLegacyVatRules,
    validateApplicabilityDefinition:()=>({ok:true}),
    validateRuleActionDefinition:()=>({ok:true}),
    regulatoryRuleDefinitionHashInput(b){
      return {ruleKey:String(b.ruleKey||""),version:Number(b.version||1),title:String(b.title||""),
        summary:String(b.summary||""),applicability:b.applicability||{},
        action:b.action||{},sourceIds:b.sourceIds||[],effectiveFrom:b.effectiveFrom||null,
        effectiveTo:b.effectiveTo||null,confidence:String(b.confidence||"medium")};
    },
    async platformRegulatoryAudit(e,a,action,entityType,entityId,eventData){
      await e.DB.prepare("INSERT INTO platform_regulatory_audit(actor_user_id,actor_email,action,entity_type,entity_id,event_data) VALUES(?,?,?,?,?,?)")
        .bind(a.user_id,a.email,action,entityType,entityId,stableJson(eventData||{})).run();
    },
    JSON,Number,String,Set,Error
  };
  const worker=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
  const start=worker.indexOf("async function importBotswanaFoundationPack");
  const end=worker.indexOf("\nfunction thresholdCompare",start);
  assert.ok(start>0&&end>start,"cannot locate production import method");
  const importer=vm.runInNewContext(`(${worker.slice(start,end)})`,helper,{timeout:1500});
  return {sql,env,importer,fullSchema,close:()=>sql.close()};
}

async function primeV17(f){
  const pack=historicPack(),packKey=pack.packKey;
  const ids=new Map();
  for(const src of pack.sources){
    const id="v17-source-"+src.key,d=foundationSourceDesired(src,packKey);
    f.sql.prepare(`INSERT INTO regulatory_sources
      (id,jurisdiction,authority,title,source_url,source_type,publication_date,effective_date,status,notes,submitted_by_user_id,verification_status)
      VALUES(?,'BW',?,?,?,?,?,?,'pending',?,?,'unverified')`)
      .run(id,d.authority,d.title,d.source_url,d.source_type,d.publication_date,d.effective_date,d.notes,actor.user_id);
    ids.set(src.key,id);
    f.sql.prepare("INSERT INTO regulatory_seed_registry(pack_key,seed_key,entity_type,entity_id,definition_hash,imported_by_user_id) VALUES(?,?,?,?,?,?)")
      .run(packKey,"source:"+src.key,"source",id,await sha256Hex(stableJson(src)),actor.user_id);
  }
  for(const conflict of pack.conflicts){
    const id="v17-conflict-"+conflict.key,sids=conflict.sourceKeys.map(k=>ids.get(k));
    f.sql.prepare("INSERT INTO regulatory_conflicts(id,topic_key,source_ids_json,description,status,resolution_notes) VALUES(?,?,?,?,?,?)")
      .run(id,conflict.topicKey,JSON.stringify(sids),conflict.description,conflict.status,conflict.resolutionNotes||null);
    f.sql.prepare("INSERT INTO regulatory_seed_registry(pack_key,seed_key,entity_type,entity_id,definition_hash,imported_by_user_id) VALUES(?,?,?,?,?,?)")
      .run(packKey,"conflict:"+conflict.key,"conflict",id,await sha256Hex(stableJson(conflict)),actor.user_id);
  }
  for(const rule of pack.rules){
    const id="v17-rule-"+rule.key,sids=rule.sourceKeys.map(k=>ids.get(k)),status=rule.key==="vat-return-payment"?"review":"draft";
    const seed={ruleKey:rule.ruleKey,title:rule.title,summary:rule.summary,
      applicability:rule.applicability||{},action:rule.action||{},sourceIds:sids,
      effectiveFrom:rule.effectiveFrom||null,effectiveTo:rule.effectiveTo||null,
      confidence:rule.confidence||"medium"};
    const seedHash=await sha256Hex(stableJson(seed));
    f.sql.prepare(`INSERT INTO regulatory_rules(id,rule_key,version,title,summary,applicability_json,action_json,
      source_ids_json,effective_from,effective_to,status,confidence,created_by_user_id,definition_hash)
      VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,rule.ruleKey,rule.title,rule.summary,JSON.stringify(seed.applicability),
        JSON.stringify(seed.action),JSON.stringify(sids),seed.effectiveFrom,seed.effectiveTo,
        status,seed.confidence,actor.user_id,seedHash);
    f.sql.prepare("INSERT INTO regulatory_seed_registry(pack_key,seed_key,entity_type,entity_id,definition_hash,imported_by_user_id) VALUES(?,?,?,?,?,?)")
      .run(packKey,"rule:"+rule.key,"rule",id,seedHash,actor.user_id);
  }
  if(f.fullSchema){
    // Real schema requires an existing rule, mandatory obligation fields, and FK integrity.
    f.sql.prepare("INSERT INTO compliance_obligations(id,tenant_id,rule_id,obligation_key,title,status) VALUES(?,?,?,?,?,'open')")
      .run("untouched-obligation","fixture-tenant","v17-rule-cipa-company-constitution","fixture-untouched","Do not modify");
  }
  return ids;
}
const scalar=(db,query)=>db.prepare(query).get()[Object.keys(db.prepare(query).get())[0]];

test("actual importer upgrades populated v1.7 evidence without approving old or new VAT rules",async()=>{
  const f=stage();
  try{
    await primeV17(f);
    const pre=await inspectFoundationSourceMetadata(f.env.DB,current);
    assert.equal(pre.ok,true);
    assert.equal(pre.counts.create,1);
    assert.ok(pre.counts.refresh_unreviewed>=2);
    const result=await f.importer(f.env,actor);
    assert.equal(result.ok,true);
    assert.equal(result.sourcesCreated,1);
    assert.ok(result.sourcesUpdated>=2);
    assert.equal(scalar(f.sql,"SELECT COUNT(*) AS n FROM regulatory_sources"),24);
    assert.equal(scalar(f.sql,"SELECT COUNT(*) AS n FROM regulatory_rules"),18);
    const oldVat=f.sql.prepare("SELECT status FROM regulatory_rules WHERE rule_key='bw.burs.vat.return-payment.25-days'").get();
    const newVat=f.sql.prepare("SELECT status,action_json,effective_from FROM regulatory_rules WHERE rule_key='bw.burs.vat.return-payment.28-days'").get();
    assert.equal(oldVat.status,"review","old v1.7 rule history must not be silently rewritten");
    assert.equal(newVat.status,"draft","no rule auto-approval or publication");
    assert.equal(JSON.parse(newVat.action_json).dueDaysAfterPeriodEnd,28);
    assert.equal(newVat.effective_from,"2026-07-01");
    const oldIndustry=f.sql.prepare("SELECT status FROM regulatory_rules WHERE id='v17-rule-industrial-annual-fee'").get();
    assert.equal(oldIndustry.status,"draft");
    const newIndustry=f.sql.prepare("SELECT status,version FROM regulatory_rules WHERE rule_key='bw.industrial.licence.annual-fee' ORDER BY version DESC LIMIT 1").get();
    assert.equal(newIndustry.status,"draft");assert.equal(newIndustry.version,2);
    const egp=f.sql.prepare("SELECT publication_date FROM regulatory_sources WHERE id='v17-source-botswana-egp-procurement-2026'").get();
    assert.equal(egp.publication_date,null,"unverified publication date must be cleared only in safe case");
    const audits=f.sql.prepare("SELECT action FROM platform_regulatory_audit").all().map(x=>x.action);
    assert.ok(audits.includes("FOUNDATION_SOURCE_METADATA_RECONCILED"));
    assert.ok(!audits.includes("RULE_STATUS_CHANGED"));
    assert.equal(scalar(f.sql,"SELECT COUNT(*) AS n FROM compliance_obligations"),1);
    const again=await f.importer(f.env,actor);
    assert.equal(again.ok,true);assert.equal(again.rulesCreated,0);
    assert.equal(again.sourcesUpdated,0);assert.equal(again.sourcesCreated,0);
    assert.equal(scalar(f.sql,"SELECT COUNT(*) AS n FROM regulatory_rules"),18);
    assert.equal(scalar(f.sql,"SELECT COUNT(*) AS n FROM compliance_obligations"),1);
  }finally{f.close()}
});

test("actual importer blocks protected changed source before ANY mutation",async()=>{
  const f=stage();
  try{
    await primeV17(f);
    f.sql.prepare("UPDATE regulatory_sources SET status='approved',verification_status='verified',latest_snapshot_version=1 WHERE id=?")
      .run("v17-source-botswana-egp-procurement-2026");
    f.sql.prepare("INSERT INTO regulatory_source_snapshots VALUES(?,?,?)")
      .run("snapshot-v17","v17-source-botswana-egp-procurement-2026",1);
    const before=f.sql.prepare("SELECT COUNT(*) AS n FROM regulatory_pack_imports").get().n;
    const beforeChanges=f.sql.prepare("SELECT total_changes() AS n").get().n;
    const result=await f.importer(f.env,actor);
    assert.equal(result.ok,false);
    assert.equal(result.error,"source_metadata_drift_requires_review");
    assert.ok(result.preflight.sources.some(s=>s.key==="botswana-egp-procurement-2026"&&s.action==="source_metadata_drift_requires_review"));
    assert.equal(f.sql.prepare("SELECT total_changes() AS n").get().n,beforeChanges,
      "protected metadata must block before any pack or registry writes");
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM regulatory_pack_imports").get().n,before);
    assert.equal(f.sql.prepare("SELECT publication_date FROM regulatory_sources WHERE id='v17-source-botswana-egp-procurement-2026'").get().publication_date,"2026-08-13");
    assert.equal(scalar(f.sql,"SELECT COUNT(*) AS n FROM regulatory_rules"),16);
  }finally{f.close()}
});

test("real checked-in 182-table D1 schema: populated v1.7 import remains draft-only and idempotent",async()=>{
  const f=stage({fullSchema:true});
  try{
    await primeV17(f);
    const pre=await inspectFoundationSourceMetadata(f.env.DB,current);
    assert.equal(pre.ok,true);
    const outcome=await f.importer(f.env,actor);
    assert.equal(outcome.ok,true);
    assert.equal(outcome.sourcesCreated,1);
    assert.equal(scalar(f.sql,"SELECT COUNT(*) AS n FROM regulatory_sources"),24);
    assert.equal(scalar(f.sql,"SELECT COUNT(*) AS n FROM regulatory_rules"),18);
    assert.equal(f.sql.prepare("SELECT status FROM regulatory_rules WHERE rule_key='bw.burs.vat.return-payment.25-days'").get().status,"review");
    assert.equal(f.sql.prepare("SELECT status FROM regulatory_rules WHERE rule_key='bw.burs.vat.return-payment.28-days'").get().status,"draft");
    assert.equal(scalar(f.sql,"SELECT COUNT(*) AS n FROM compliance_obligations"),1);
    assert.equal(f.sql.prepare("SELECT status FROM compliance_obligations WHERE id='untouched-obligation'").get().status,"open");
    const repeat=await f.importer(f.env,actor);
    assert.equal(repeat.rulesCreated,0);
    assert.equal(repeat.sourcesCreated,0);
    assert.equal(repeat.sourcesUpdated,0);
    assert.equal(scalar(f.sql,"SELECT COUNT(*) AS n FROM regulatory_rules"),18);
    assert.equal(f.sql.prepare("PRAGMA foreign_key_check").all().length,0);
  }finally{f.close()}
});

test("active legacy VAT approval or publication stops the real importer before every write",async()=>{
  for(const status of ["approved","published"]){
    const f=stage({fullSchema:true});
    try{
      await primeV17(f);
      f.sql.prepare("UPDATE regulatory_rules SET status=? WHERE id='v17-rule-vat-return-payment'").run(status);
      const baseline=f.sql.prepare("SELECT total_changes() n").get().n;
      const result=await f.importer(f.env,actor);
      assert.equal(result.ok,false);
      assert.equal(result.error,"legacy_vat_rule_active_requires_review");
      assert.equal(result.legacyVat.count,1);
      assert.equal(result.legacyVat.rules[0].status,status);
      assert.equal(f.sql.prepare("SELECT total_changes() n").get().n,baseline,"must not touch registry, sources or rules");
      assert.equal(scalar(f.sql,"SELECT COUNT(*) n FROM regulatory_sources"),23);
      assert.equal(scalar(f.sql,"SELECT COUNT(*) n FROM regulatory_rules"),16);
      assert.equal(scalar(f.sql,"SELECT COUNT(*) n FROM compliance_obligations"),1);
    }finally{f.close()}
  }
});

test("historically ended VAT publication does not block after effective end",async()=>{
  const f=stage({fullSchema:true});
  try{
    await primeV17(f);
    f.sql.prepare("UPDATE regulatory_rules SET status='published',effective_to='2026-06-30' WHERE id='v17-rule-vat-return-payment'").run();
    const result=await f.importer(f.env,actor);
    assert.equal(result.ok,true);
    assert.equal(scalar(f.sql,"SELECT COUNT(*) n FROM regulatory_rules"),18);
    assert.equal(f.sql.prepare("SELECT status FROM regulatory_rules WHERE id='v17-rule-vat-return-payment'").get().status,"published");
    assert.equal(f.sql.prepare("SELECT effective_to FROM regulatory_rules WHERE id='v17-rule-vat-return-payment'").get().effective_to,"2026-06-30");
  }finally{f.close()}
});
