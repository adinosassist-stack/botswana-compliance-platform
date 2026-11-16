import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 qualifyQuotationDraftPrivateStaging,quotationDraftExpectedSchema,
 canonicalQuotationSchemaSql
} from "../server/quotation-draft-staging-readonly-preflight.mjs";

const sha="a".repeat(40),stage="aec227e9-b0f2-4b00-8de0-105465c4e2d6",
 production="8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce";
const validRows=()=>[
 {name:"quotation_logo_assets",type:"table",sql:"CREATE TABLE quotation_logo_assets (id TEXT)"},
 {name:"quotation_logo_settings",type:"table",sql:"CREATE TABLE quotation_logo_settings (tenant_id TEXT)"},
 {name:"quotation_drafts",type:"table",sql:quotationDraftExpectedSchema.table},
 {name:"idx_quotation_drafts_tenant_updated",type:"index",sql:quotationDraftExpectedSchema.index}
];
function fixture(rows=validRows()){
 const calls=[];
 const d1={prepare(sql){
  assert.match(sql,/^SELECT /);
  calls.push("select");
  if(sql.startsWith("SELECT name FROM sqlite_master"))return {
   bind(...args){
    assert.deepEqual(args,["quotation_logo_assets","quotation_logo_settings"]);
    return {all:async()=>({results:rows.filter(r=>args.includes(r.name)).map(r=>({name:r.name}))})};
   }
  };
  assert.match(sql,/^SELECT name,type,sql FROM sqlite_master/);
  return {all:async()=>({results:structuredClone(rows)})};
 }};
 const bucket=name=>({list:async(opts)=>{
  calls.push(name);assert.equal(opts.limit,1);
  assert.equal(opts.prefix,name==="logo"?"quotation-logos/":"quotation-templates/");
 }});
 const config={
  environment:"quotation-private-staging",sourceSha:sha,expectedSourceSha:sha,
  d1,d1Id:stage,productionD1Id:production,
  privateLogoBucket:bucket("logo"),logoBucketName:"bw-quotation-logo-private-staging",
  privateTemplateBucket:bucket("template"),templateBucketName:"bw-quotation-template-private-staging",
  productionBucketNames:["bw-compliance-ops-backups"],
  routes:[],workersDevEnabled:false,previewUrlsEnabled:false
 };
 return {config,calls};
}
test("read-only preflight reports exact approved draft schema but authorizes no mutation",async()=>{
 const {config,calls}=fixture();
 const result=await qualifyQuotationDraftPrivateStaging(config);
 assert.equal(result.schemaReady,true);
 assert.equal(result.draftSchemaExactlyMatched,true);
 assert.equal(result.logoSchemaDeepVerified,false);
 assert.equal(result.readyForSeparateQualificationApproval,true);
 assert.equal(result.deploymentAuthorized,false);
 assert.equal(result.migrationAuthorized,false);
 assert.equal(result.templateUploadAuthorized,false);
 assert.equal(result.privateWorkerBindingAuthorized,false);
 assert.deepEqual(calls,["select","logo","template","select"]);
});
test("missing draft table and index remain blockers, never inferred from logo readiness",async()=>{
 const {config}=fixture(validRows().filter(r=>r.name.startsWith("quotation_logo")));
 const result=await qualifyQuotationDraftPrivateStaging(config);
 assert.equal(result.schemaReady,false);
 assert.deepEqual(result.missingTables,["quotation_drafts"]);
 assert.deepEqual(result.missingIndexes,["idx_quotation_drafts_tenant_updated"]);
 assert.equal(result.readyForSeparateQualificationApproval,false);
});
test("wrong draft DDL, partial index and unexpected tables fail closed",async()=>{
 const base=validRows();
 for(const rows of [
  base.map(row=>row.name==="quotation_drafts"?{...row,sql:row.sql.replace("PRIMARY KEY (tenant_id,id)","PRIMARY KEY (id)")}:row),
  base.map(row=>row.name==="idx_quotation_drafts_tenant_updated"?{...row,sql:"CREATE INDEX idx_quotation_drafts_tenant_updated ON quotation_drafts (id)"}:row),
  [...base,{name:"unrelated_production_payments",type:"table",sql:"CREATE TABLE unrelated_production_payments(x TEXT)"}],
  [...base,{...base[2]}],
  base.map(row=>row.name==="quotation_drafts"?{...row,type:"index"}:row)
 ]){
  const {config}=fixture(rows);
  const result=await qualifyQuotationDraftPrivateStaging(config);
  assert.equal(result.schemaReady,false);
  assert.equal(result.readyForSeparateQualificationApproval,false);
 }
});
test("invalid public exposure or reused production DB refused before any read",async()=>{
 const {config,calls}=fixture();
 for(const changed of [
  {d1Id:production},{routes:["thebedesk.com/*"]},
  {workersDevEnabled:true},{previewUrlsEnabled:true},
  {sourceSha:"b".repeat(40)}
 ]){
  await assert.rejects(qualifyQuotationDraftPrivateStaging({...config,...changed}));
  assert.deepEqual(calls,[]);
 }
});
test("malformed read-only schema results and read errors never qualify",async()=>{
 const f=fixture();
 await assert.rejects(qualifyQuotationDraftPrivateStaging({...f.config,d1:{
  prepare(sql){
   if(sql.startsWith("SELECT name FROM"))return f.config.d1.prepare(sql);
   return {all:async()=>{throw Error("read_only_unavailable")}};
  }
 }}),/quotation_draft_staging_schema_read_failed/);
 const g=fixture();
 await assert.rejects(qualifyQuotationDraftPrivateStaging({...g.config,d1:{
  prepare(sql){
   if(sql.startsWith("SELECT name FROM"))return g.config.d1.prepare(sql);
   return {all:async()=>({results:{bad:true}})};
  }
 }}),/quotation_draft_staging_schema_read_failed/);
});
test("the preflight's strict draft DDL is pinned to the reviewed SQL file",()=>{
 const raw=readFileSync(new URL("../docs/sql/quotation-drafts-staging-candidate.sql",import.meta.url),"utf8");
 const table=raw.slice(raw.indexOf("CREATE TABLE "),raw.indexOf(";\nCREATE INDEX "));
 const index=raw.slice(raw.indexOf("CREATE INDEX "));
 assert.equal(canonicalQuotationSchemaSql(table),
  canonicalQuotationSchemaSql(quotationDraftExpectedSchema.table));
 assert.equal(canonicalQuotationSchemaSql(index),
  canonicalQuotationSchemaSql(quotationDraftExpectedSchema.index));
});
