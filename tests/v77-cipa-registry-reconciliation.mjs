import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker,{ __v77Test } from "../cloudflare/src/worker.js";

const workerSource=fs.readFileSync(new URL("../cloudflare/src/worker.js",import.meta.url),"utf8");
const schema=fs.readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
const migration=fs.readFileSync(new URL("../cloudflare/migrations/019_v77_cipa_registry_reconciliation.sql",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../public/index.html",import.meta.url),"utf8");

const valid=__v77Test.normalizeCipaRegistryInput({
  sourceType:"obrs_company_extract",
  sourceObservedAt:"2026-09-01",
  registrationNumber:"BW00001234567",
  legalName:"Kgetsi Trading (Pty) Ltd",
  entityType:"company",
  registrationStatus:"active",
  registrationDate:"2024-05-14",
  annualReturnMonth:"May",
  registeredOffice:"Plot 100, Gaborone"
},new Date("2026-09-01T12:00:00Z"));
assert.equal(valid.ok,true);
assert.equal(valid.fields.registration_number,"BW00001234567");
assert.equal(valid.fields.legal_name,"Kgetsi Trading (Pty) Ltd");
assert.equal(valid.fields.annual_return_month,"May");
assert.equal(valid.sourceObservedAt,"2026-09-01");

assert.equal(__v77Test.normalizeCipaRegistryInput({...valid.input,sourceObservedAt:"2026-07-01"},new Date("2026-09-01T12:00:00Z")).error,"cipa_source_evidence_stale");
assert.equal(__v77Test.normalizeCipaRegistryInput({...valid.input,sourceObservedAt:"2026-09-03"},new Date("2026-09-01T12:00:00Z")).error,"cipa_source_observed_at_future");
assert.equal(__v77Test.normalizeCipaRegistryInput({...valid.input,registrationNumber:""},new Date("2026-09-01T12:00:00Z")).error,"cipa_registration_number_invalid");
assert.equal(__v77Test.normalizeCipaRegistryInput({...valid.input,registrationNumber:"X".repeat(41)},new Date("2026-09-01T12:00:00Z")).error,"cipa_registration_number_invalid");
assert.equal(__v77Test.normalizeCipaRegistryInput({...valid.input,entityType:"invented"},new Date("2026-09-01T12:00:00Z")).error,"cipa_entity_type_invalid");
assert.equal(__v77Test.normalizeCipaRegistryInput({...valid.input,registrationDate:"2026-02-31"},new Date("2026-09-01T12:00:00Z")).error,"cipa_registration_date_invalid");

const profile={name:"Old Name",entityType:"company",incorporationDate:"2024-05-14",cipaMonth:"May",cipaUin:"BW-OLD",cipaStatus:"active",registeredOffice:"Old office"};
assert.equal(__v77Test.cipaProfileValue(profile,"legal_name"),"Old Name");
assert.equal(__v77Test.cipaProfileValue(profile,"registration_number"),"BW-OLD");
assert.deepEqual(__v77Test.applyCipaRegistryField(profile,"legal_name","New Legal Name"),{...profile,name:"New Legal Name"});
assert.deepEqual(__v77Test.applyCipaRegistryField(profile,"registration_number","BW-NEW"),{...profile,cipaUin:"BW-NEW"});
assert.throws(()=>__v77Test.applyCipaRegistryField(profile,"unsupported","x"),/unsupported_cipa_registry_field/);

class TestD1Statement{
  constructor(database,sql){this.database=database;this.sql=sql;this.args=[]}
  bind(...args){this.args=args;return this}
  first(){const row=this.database.prepare(this.sql).get(...this.args);return row?{...row}:null}
  all(){return {results:this.database.prepare(this.sql).all(...this.args).map(row=>({...row}))}}
  run(){const r=this.database.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes||0)}}}
}
class TestD1{
  constructor(database){this.database=database}
  prepare(sql){return new TestD1Statement(this.database,sql)}
  batch(statements){
    this.database.exec("BEGIN IMMEDIATE");
    try{const results=statements.map(statement=>statement.run());this.database.exec("COMMIT");return results}
    catch(error){this.database.exec("ROLLBACK");throw error}
  }
}

const runtimeSqlite=new DatabaseSync(":memory:");
runtimeSqlite.exec(schema);
const runtimeDb=new TestD1(runtimeSqlite),sessionSecret="test-session-secret-long-enough",auditSecret="test-audit-secret-long-enough",rawSession="v77-test-session";
const tokenHash=createHmac("sha256",sessionSecret).update(rawSession).digest("hex"),csrf="v77-csrf";
runtimeSqlite.prepare("INSERT INTO tenants(id,name) VALUES(?,?)").run("tenant-1","Test Tenant");
runtimeSqlite.prepare("INSERT INTO users(id,email,display_name) VALUES(?,?,?)").run("owner-1","owner@example.com","Owner");
runtimeSqlite.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,?,?)").run("tenant-1","owner-1","owner","active");
runtimeSqlite.prepare("INSERT INTO subscriptions(tenant_id,plan,status) VALUES(?,?,?)").run("tenant-1","business","active");
runtimeSqlite.prepare("INSERT INTO sessions(token_hash,user_id,tenant_id,role,csrf_token,expires_at) VALUES(?,?,?,?,?,datetime('now','+1 day'))").run(tokenHash,"owner-1","tenant-1","owner",csrf);
runtimeSqlite.prepare(`INSERT INTO evidence(id,tenant_id,display_name,category,upload_status,scan_status,review_status,scanned_at,reviewed_at,content_sha256)
  VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?)`).run("evidence-1","tenant-1","Current CIPA extract","Corporate","complete","clean","approved","source-sha256");
const initialState={activeCompanyId:"company-1",activeRole:"owner",companies:[{id:"company-1",profile:{name:"Old Legal Name",entityType:"company",incorporationDate:"2024-05-14",cipaMonth:"May",cipaUin:"BW00001234567",cipaStatus:"active",registeredOffice:"Gaborone"}}]};
runtimeSqlite.prepare("INSERT INTO app_state(tenant_id,version,state_json) VALUES(?,?,?)").run("tenant-1",4,JSON.stringify(initialState));
const runtimeEnv={DB:runtimeDb,SESSION_SECRET:sessionSecret,AUDIT_INTEGRITY_SECRET:auditSecret,PUBLIC_ORIGIN:"https://app.example"};
const runtimeRequest=(path,options={})=>new Request(`https://app.example${path}`,{...options,headers:{cookie:`__Host-bw_session=${rawSession}`,"x-csrf-token":csrf,"content-type":"application/json",...(options.headers||{})}});
const today=new Date().toISOString().slice(0,10);
const snapshotBody={companyId:"company-1",evidenceId:"evidence-1",sourceType:"obrs_company_extract",sourceObservedAt:today,registrationNumber:"BW00001234567",
  legalName:"New Legal Name",entityType:"company",registrationStatus:"active",registrationDate:"2024-05-14",annualReturnMonth:"May",registeredOffice:"Gaborone",reviewConfirmed:true};
let response=await worker.fetch(runtimeRequest("/api/cipa/registry-snapshots",{method:"POST",body:JSON.stringify(snapshotBody)}),runtimeEnv,{});
assert.equal(response.status,201);let payload=await response.json();assert.equal(payload.pending,1);assert.equal(payload.liveSync,false);
response=await worker.fetch(runtimeRequest("/api/cipa/registry?companyId=company-1"),runtimeEnv,{});assert.equal(response.status,200);payload=await response.json();
assert.equal(payload.mode,"manual_evidence");assert.equal(payload.summary.pending,1);let legalItem=payload.reconciliations.find(x=>x.field_key==="legal_name");assert.ok(legalItem);

runtimeSqlite.prepare("UPDATE memberships SET role='manager' WHERE tenant_id='tenant-1' AND user_id=(SELECT user_id FROM sessions WHERE token_hash=?)").run(tokenHash);
response=await worker.fetch(runtimeRequest(`/api/cipa/reconciliations/${legalItem.id}/resolve`,{method:"POST",body:JSON.stringify({action:"apply_registry",expectedStateVersion:4})}),runtimeEnv,{});
assert.equal(response.status,403);assert.equal((await response.json()).error,"owner_required_for_cipa_reconciliation");
runtimeSqlite.prepare("UPDATE memberships SET role='owner' WHERE tenant_id='tenant-1' AND user_id=(SELECT user_id FROM sessions WHERE token_hash=?)").run(tokenHash);
response=await worker.fetch(runtimeRequest(`/api/cipa/reconciliations/${legalItem.id}/resolve`,{method:"POST",body:JSON.stringify({action:"apply_registry",expectedStateVersion:4})}),runtimeEnv,{});
assert.equal(response.status,200);payload=await response.json();assert.equal(payload.stateVersion,5);
let stored=JSON.parse(runtimeSqlite.prepare("SELECT state_json FROM app_state WHERE tenant_id=?").get("tenant-1").state_json);assert.equal(stored.companies[0].profile.name,"New Legal Name");
assert.equal(runtimeSqlite.prepare("SELECT status FROM cipa_reconciliation_items WHERE id=?").get(legalItem.id).status,"applied_registry");

response=await worker.fetch(runtimeRequest("/api/cipa/registry-snapshots",{method:"POST",body:JSON.stringify({...snapshotBody,legalName:"Second Registry Name"})}),runtimeEnv,{});assert.equal(response.status,201);
response=await worker.fetch(runtimeRequest("/api/cipa/registry?companyId=company-1"),runtimeEnv,{});payload=await response.json();legalItem=payload.reconciliations.find(x=>x.field_key==="legal_name");
stored=JSON.parse(runtimeSqlite.prepare("SELECT state_json FROM app_state WHERE tenant_id=?").get("tenant-1").state_json);stored.companies[0].profile.name="Concurrent Workspace Name";
runtimeSqlite.prepare("UPDATE app_state SET version=6,state_json=? WHERE tenant_id=?").run(JSON.stringify(stored),"tenant-1");
response=await worker.fetch(runtimeRequest(`/api/cipa/reconciliations/${legalItem.id}/resolve`,{method:"POST",body:JSON.stringify({action:"apply_registry",expectedStateVersion:5})}),runtimeEnv,{});
assert.equal(response.status,409);assert.equal((await response.json()).error,"cipa_state_version_conflict");

response=await worker.fetch(runtimeRequest("/api/cipa/registry-snapshots",{method:"POST",body:JSON.stringify({...snapshotBody,legalName:"Third Registry Name"})}),runtimeEnv,{});assert.equal(response.status,201);
payload=await response.json();runtimeSqlite.prepare("UPDATE cipa_registry_snapshots SET source_observed_at='2000-01-01' WHERE id=?").run(payload.id);
response=await worker.fetch(runtimeRequest("/api/cipa/registry?companyId=company-1"),runtimeEnv,{});payload=await response.json();legalItem=payload.reconciliations.find(x=>x.field_key==="legal_name");
response=await worker.fetch(runtimeRequest(`/api/cipa/reconciliations/${legalItem.id}/resolve`,{method:"POST",body:JSON.stringify({action:"keep_workspace",note:"Current evidence is no longer fresh enough."})}),runtimeEnv,{});
assert.equal(response.status,409);assert.equal((await response.json()).error,"cipa_source_evidence_stale_restage_required");
assert.ok(runtimeSqlite.prepare("SELECT count(*) count FROM audit_events WHERE tenant_id=?").get("tenant-1").count>=2);
console.log("PASS authenticated D1 staging, owner resolution, RBAC, concurrency and stale-source runtime paths");

const checks=[
  ["manual evidence boundary",workerSource.includes('mode:"manual_evidence"')&&workerSource.includes('liveSync:false')&&!workerSource.includes("CIPA_ACCESS_TOKEN")],
  ["approved clean corporate evidence gate",workerSource.includes("approved_clean_cipa_evidence_required")&&workerSource.includes("evidenceScanReady")&&workerSource.includes("evidence_category")],
  ["fresh source evidence",workerSource.includes("cipa_source_evidence_stale")&&workerSource.includes("cipa_source_observed_at_future")&&workerSource.includes("cipa_source_evidence_stale_restage_required")],
  ["tenant and company isolation",workerSource.includes("cipa_registry_snapshots WHERE tenant_id=? AND company_id=?")&&workerSource.includes("app_state WHERE tenant_id=?")],
  ["explicit owner resolution",workerSource.includes("CIPA_RECONCILIATION_APPLIED")&&workerSource.includes("CIPA_RECONCILIATION_KEPT_INTERNAL")&&workerSource.includes('roleAllowed(a,"owner")')],
  ["optimistic state protection",workerSource.includes("cipa_internal_profile_changed_repreview_required")&&workerSource.includes("cipa_state_version_conflict")],
  ["content integrity",workerSource.includes("cipaRegistryContentHash")&&schema.includes("content_hash TEXT NOT NULL")],
  ["snapshot schema",schema.includes("CREATE TABLE IF NOT EXISTS cipa_registry_snapshots")&&schema.includes("UNIQUE(tenant_id,company_id,content_hash)")],
  ["reconciliation schema",schema.includes("CREATE TABLE IF NOT EXISTS cipa_reconciliation_items")&&schema.includes("applied_registry")&&schema.includes("kept_internal")],
  ["migration parity",migration.includes("cipa_registry_snapshots")&&migration.includes("cipa_reconciliation_items")],
  ["truthful UI",html.includes('id="cipaRegistryPanel"')&&html.includes("No live CIPA sync is claimed")&&html.includes("stageCipaRegistrySnapshot()")],
  ["source links",html.includes("Open CIPA")&&html.includes("Search the CIPA register")],
  ["profile persistence",html.includes('id="pCipaUin"')&&html.includes('id="pCipaStatus"')&&html.includes('id="pRegisteredOffice"')]
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks)console.log(`${ok?"PASS":"FAIL"} ${name}`);
if(failed.length)process.exit(1);

console.log("v77 CIPA registry reconciliation contract checks passed");
