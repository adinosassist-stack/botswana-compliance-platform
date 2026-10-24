import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {
  inspectFoundationSourceMetadata,
  publicFoundationSourcePreflight,
  updateUnreviewedFoundationSourceMetadata,
  foundationSourceDesired
} from "../cloudflare/src/regulatory-foundation-source-reconciliation.js";

function fixture(){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE regulatory_sources(
      id TEXT PRIMARY KEY,authority TEXT NOT NULL,title TEXT NOT NULL,source_url TEXT NOT NULL,
      source_type TEXT NOT NULL,publication_date TEXT,effective_date TEXT,notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',verification_status TEXT NOT NULL DEFAULT 'unverified',
      latest_snapshot_version INTEGER NOT NULL DEFAULT 0,content_hash TEXT,metadata_hash TEXT,
      approved_by_user_id TEXT,approved_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE regulatory_source_snapshots(id TEXT PRIMARY KEY,source_id TEXT,version INTEGER);
    CREATE TABLE regulatory_source_reviews(id TEXT PRIMARY KEY,source_id TEXT);
    CREATE TABLE regulatory_seed_registry(pack_key TEXT,seed_key TEXT,entity_type TEXT,
      entity_id TEXT,definition_hash TEXT,PRIMARY KEY(pack_key,seed_key));
  `);
  const db={prepare(sql){return {bind(...params){
    const stmt=sqlite.prepare(sql);
    return {
      first:async()=>stmt.get(...params)||null,
      all:async()=>({results:stmt.all(...params)}),
      run:async()=>({meta:{changes:Number(stmt.run(...params).changes)}})
    };
  }}}};
  const close=()=>sqlite.close();
  const pack={packKey:"botswana-foundation-v1",version:"1.8",sources:[{
    key:"botswana-egp-procurement-2026",authority:"Ministry of Finance Botswana",
    title:"Government e-Procurement article — publication date unverified",
    url:"https://www.finance.gov.bw/?id=339",type:"official",
    notes:"Historical/provenance-only; original publication date unverified."
  }]};
  const original={
    id:"source-1",authority:pack.sources[0].authority,title:"2026 e-Government Procurement implementation tender",
    source_url:pack.sources[0].url,source_type:"official",publication_date:"2026-08-13",effective_date:null,
    notes:"[FOUNDATION PACK botswana-foundation-v1] Active tender in August 2026.",
    status:"pending",verification_status:"unverified",latest_snapshot_version:0,
    content_hash:null,metadata_hash:null,approved_by_user_id:null,approved_at:null
  };
  const insert=(row=original)=>{
    sqlite.prepare(`INSERT INTO regulatory_sources(id,authority,title,source_url,source_type,
      publication_date,effective_date,notes,status,verification_status,latest_snapshot_version,
      content_hash,metadata_hash,approved_by_user_id,approved_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        row.id,row.authority,row.title,row.source_url,row.source_type,row.publication_date,
        row.effective_date,row.notes,row.status,row.verification_status,row.latest_snapshot_version,
        row.content_hash,row.metadata_hash,row.approved_by_user_id,row.approved_at
      );
    sqlite.prepare("INSERT INTO regulatory_seed_registry(pack_key,seed_key,entity_type,entity_id,definition_hash) VALUES(?,?,?,?,?)")
      .run(pack.packKey,"source:"+pack.sources[0].key,"source",row.id,"old-seed-hash");
  };
  return {sqlite,db,pack,original,insert,close};
}

test("read-only preflight exposes proposed new source without insertion",async()=>{
  const f=fixture();
  try{
    const plan=await inspectFoundationSourceMetadata(f.db,f.pack);
    assert.equal(plan.ok,true);
    assert.equal(plan.counts.create,1);
    assert.deepEqual(publicFoundationSourcePreflight(plan).sources[0].changedFields,[]);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM regulatory_sources").get().n,0);
  }finally{f.close()}
});

test("pending, unverified, snapshot-free 2019/2026 provenance correction uses CAS and is idempotent",async()=>{
  const f=fixture();
  try{
    f.insert();
    const plan=await inspectFoundationSourceMetadata(f.db,f.pack);
    assert.equal(plan.ok,true);
    assert.equal(plan.items[0].action,"refresh_unreviewed");
    assert.ok(plan.items[0].changedFields.includes("publication_date"));
    const before=f.sqlite.prepare("SELECT publication_date FROM regulatory_sources WHERE id='source-1'").get();
    assert.equal(before.publication_date,"2026-08-13","preflight must not modify persisted metadata");
    assert.deepEqual(await updateUnreviewedFoundationSourceMetadata(f.db,plan.items[0]),
      {ok:true,sourceId:"source-1",changedFields:plan.items[0].changedFields});
    const changed=f.sqlite.prepare("SELECT * FROM regulatory_sources WHERE id='source-1'").get();
    assert.equal(changed.publication_date,null);
    assert.equal(changed.title,f.pack.sources[0].title);
    assert.equal(changed.notes,foundationSourceDesired(f.pack.sources[0],f.pack.packKey).notes);
    assert.equal(changed.status,"pending");
    assert.equal(changed.verification_status,"unverified");
    assert.equal(f.sqlite.prepare("SELECT definition_hash FROM regulatory_seed_registry").get().definition_hash,"old-seed-hash",
      "helper does not falsely advance registry identity; caller does so only after safe completion");
    const reread=await inspectFoundationSourceMetadata(f.db,f.pack);
    assert.equal(reread.items[0].action,"reuse");
    assert.equal(reread.counts.refresh_unreviewed,0);
  }finally{f.close()}
});

test("verified/approved/snapshotted/reviewed metadata cannot be silently overwritten",async()=>{
  for(const kind of ["approved","verified","snapshot","review","content_hash"]){
    const f=fixture();
    try{
      f.insert();
      if(kind==="approved")f.sqlite.exec("UPDATE regulatory_sources SET status='approved',approved_by_user_id='reviewer' WHERE id='source-1'");
      if(kind==="verified")f.sqlite.exec("UPDATE regulatory_sources SET verification_status='verified' WHERE id='source-1'");
      if(kind==="snapshot")f.sqlite.exec("INSERT INTO regulatory_source_snapshots VALUES('snapshot-1','source-1',1)");
      if(kind==="review")f.sqlite.exec("INSERT INTO regulatory_source_reviews VALUES('review-1','source-1')");
      if(kind==="content_hash")f.sqlite.exec("UPDATE regulatory_sources SET content_hash='evidence' WHERE id='source-1'");
      const plan=await inspectFoundationSourceMetadata(f.db,f.pack);
      assert.equal(plan.ok,false,kind);
      assert.equal(plan.items[0].action,"source_metadata_drift_requires_review",kind);
      assert.equal(plan.counts.source_metadata_drift_requires_review,1);
      assert.equal(f.sqlite.prepare("SELECT publication_date FROM regulatory_sources").get().publication_date,"2026-08-13");
      await assert.rejects(updateUnreviewedFoundationSourceMetadata(f.db,plan.items[0]),
        /foundation_source_update_requires_preflight/);
    }finally{f.close()}
  }
});

test("preflight-to-write race with new approval or snapshot fails with no overwrite",async()=>{
  for(const kind of ["approval","snapshot","metadata_edit"]){
    const f=fixture();
    try{
      f.insert();
      const plan=await inspectFoundationSourceMetadata(f.db,f.pack);
      assert.equal(plan.ok,true);
      if(kind==="approval")f.sqlite.exec("UPDATE regulatory_sources SET status='approved' WHERE id='source-1'");
      if(kind==="snapshot")f.sqlite.exec("INSERT INTO regulatory_source_snapshots VALUES('s1','source-1',1)");
      if(kind==="metadata_edit")f.sqlite.exec("UPDATE regulatory_sources SET notes='changed concurrently' WHERE id='source-1'");
      const outcome=await updateUnreviewedFoundationSourceMetadata(f.db,plan.items[0]);
      assert.equal(outcome.ok,false,kind);
      assert.equal(outcome.error,"source_metadata_changed_during_import");
      assert.equal(f.sqlite.prepare("SELECT publication_date FROM regulatory_sources").get().publication_date,"2026-08-13");
    }finally{f.close()}
  }
});

test("source URL drift is never auto-corrected even without snapshots",async()=>{
  const f=fixture();
  try{
    f.insert({...f.original,source_url:"https://archive.example/old-url"});
    const plan=await inspectFoundationSourceMetadata(f.db,f.pack);
    assert.equal(plan.ok,false);
    assert.deepEqual(plan.items[0].changedFields.includes("source_url"),true);
    assert.equal(plan.items[0].action,"source_metadata_drift_requires_review");
  }finally{f.close()}
});

test("import path offers separate read-only preflight and gates metadata hashes behind safe updates",()=>{
  const w=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
  const start=w.indexOf("async function importBotswanaFoundationPack");
  const stop=w.indexOf("function thresholdCompare",start);
  const method=w.slice(start,stop);
  assert.ok(method.includes("inspectFoundationSourceMetadata(env.DB,pack)"));
  assert.ok(method.includes('if(!sourcePreflight.ok)return {ok:false,error:"source_metadata_drift_requires_review"'));
  assert.ok(method.indexOf("if(!sourcePreflight.ok)")<method.indexOf("seedRegistryPut"),
    "whole-pack block must occur before any data writes");
  assert.ok(method.indexOf("updateUnreviewedFoundationSourceMetadata")<method.indexOf('seedRegistryPut(env,packKey,sk,"source",plan.sourceId'),
    "registry must not advance before guarded metadata update");
  assert.ok(method.includes("FOUNDATION_SOURCE_METADATA_RECONCILED"));
  assert.ok(w.includes('url.searchParams.get("preflight")==="1"'));
  assert.ok(w.includes("return json(result,result.ok?201:409)"));
});
