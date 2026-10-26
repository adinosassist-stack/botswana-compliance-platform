// Offline-only fixture contract qualification against the checked-in D1 schema.
// This module does not create SQL statements, connect to Cloudflare, or write data.
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {createSyntheticRegulatoryFixtureManifest,verifySyntheticRegulatoryFixtureManifest} from "./regulatory-staging-fixture-manifest.mjs";

const required={
 tenants:["id","name"],
 compliance_obligations:["id","tenant_id","rule_id","obligation_key","title","status","due_at"],
 statutory_schedule_status:["tenant_id","rule_id","schedule_type","config_status","next_due_at"],
 regulatory_rules:["id","rule_key","status","action_json"],
 regulatory_source_snapshots:["id","source_id","version","content_hash","metadata_hash"],
 regulatory_source_reviews:["id","source_id","reviewer_user_id","decision"]
};
export function qualifySyntheticFixtureSchema(schemaText,manifest,approvedDigest){
 const manifestCheck=verifySyntheticRegulatoryFixtureManifest(manifest,approvedDigest);
 if(!manifestCheck.ok)return {ok:false,reason:manifestCheck.reason};
 if(typeof schemaText!=="string"||!schemaText.trim())return {ok:false,reason:"schema_missing"};
 const db=new DatabaseSync(":memory:");
 try{
  db.exec(schemaText);
  for(const [table,columns] of Object.entries(required)){
   const found=new Set(db.prepare("PRAGMA table_info("+table+")").all().map(row=>row.name));
   if(columns.some(col=>!found.has(col)))return {ok:false,reason:"schema_contract_incompatible",table};
  }
  const tenants=new Set(manifest.tenants.map(x=>x.id));
  if(tenants.size!==2||manifest.historicalVat.some(x=>!tenants.has(x.tenantId))||
     manifest.schedules.some(x=>!tenants.has(x.tenantId)))
    return {ok:false,reason:"fixture_tenant_reference_invalid"};
  const legacy=manifest.rules.find(x=>x.key==="bw.burs.vat.return-payment.25-days");
  const proposed=manifest.rules.find(x=>x.key==="bw.burs.vat.return-payment.28-days");
  if(legacy?.status!=="review"||proposed?.status!=="draft")
    return {ok:false,reason:"rule_status_invalid"};
  return {ok:true,scope:"offline-schema-qualification-only",schemaTables:Object.keys(required).length,fixtureDigest:approvedDigest};
 }catch{return {ok:false,reason:"schema_parse_failed"}}
 finally{db.close()}
}
export function qualifyCheckedInSyntheticSchema(){
 const {manifest,sha256}=createSyntheticRegulatoryFixtureManifest();
 const schema=readFileSync(new URL("../cloudflare/schema.sql",import.meta.url),"utf8");
 return qualifySyntheticFixtureSchema(schema,manifest,sha256);
}
