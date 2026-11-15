import test from "node:test";
import assert from "node:assert/strict";
import {qualifyQuotationPrivateStaging} from "../server/quotation-staging-readonly-preflight.mjs";
const sourceSha="a".repeat(40),prodId="22222222-3333-4444-8555-666666666666",
 stageId="11111111-2222-4333-8444-555555555555";
function setup({tables=["quotation_logo_assets","quotation_logo_settings"]}={}){
 const calls=[];
 const d1={prepare(sql){
  assert.match(sql,/^SELECT name FROM sqlite_master/);
  calls.push("select");
  return {bind(...names){
   assert.deepEqual(names,["quotation_logo_assets","quotation_logo_settings"]);
   return {all:async()=>({results:tables.map(name=>({name}))})}
  }};
 }};
 const bucket=(label)=>({list:async options=>{
  calls.push(label);assert.equal(options.limit,1);
 }});
 return {calls,config:{
  environment:"quotation-private-staging",sourceSha,expectedSourceSha:sourceSha,
  d1,d1Id:stageId,productionD1Id:prodId,
  privateLogoBucket:bucket("logo_list"),logoBucketName:"bw-quotation-logo-private-staging",
  privateTemplateBucket:bucket("template_list"),templateBucketName:"bw-quotation-template-private-staging",
  productionBucketNames:["bw-compliance-ops-backups"],routes:[],workersDevEnabled:false,previewUrlsEnabled:false
 }};
}
test("dedicated private staging preflight uses read-only operations only",async()=>{
 const {calls,config}=setup();
 const out=await qualifyQuotationPrivateStaging(config);
 assert.deepEqual(calls,["select","logo_list","template_list"]);
 assert.equal(out.schemaReady,true);
 assert.equal(out.readyForSeparateApproval,true);
 assert.equal(out.deploymentAuthorized,false);
 assert.equal(out.independentReviewerRequired,"thusico");
});
test("missing D1 schema returns blocker without migrations or writes",async()=>{
 const {calls,config}=setup({tables:["quotation_logo_assets"]});
 const out=await qualifyQuotationPrivateStaging(config);
 assert.equal(out.schemaReady,false);
 assert.deepEqual(out.missingTables,["quotation_logo_settings"]);
 assert.equal(out.readyForSeparateApproval,false);
 assert.deepEqual(calls,["select","logo_list","template_list"]);
});
test("rejects production D1, reused R2 names and exposed routes before all I/O",async()=>{
 const {calls,config}=setup();
 for(const changes of [
  {d1Id:prodId},
  {d1Id:"f".repeat(40)},
  {productionBucketNames:undefined},
  {routes:undefined},
  {logoBucketName:"bw-compliance-ops-backups"},
  {templateBucketName:config.logoBucketName},
  {routes:["thebedesk.com/*"]},
  {workersDevEnabled:true},
  {previewUrlsEnabled:true},
  {sourceSha:"d".repeat(40)},
  {environment:"production"}
 ]){
  await assert.rejects(qualifyQuotationPrivateStaging({...config,...changes}));
  assert.equal(calls.length,0);
 }
});
test("invalid or missing read-only adapters refuse qualification",async()=>{
 const {calls,config}=setup();
 await assert.rejects(qualifyQuotationPrivateStaging({...config,d1:null}),/read_only_bindings_required/);
 await assert.rejects(qualifyQuotationPrivateStaging({...config,privateLogoBucket:{put(){}}}),/read_only_bindings_required/);
 assert.deepEqual(calls,[]);
});
test("D1 and R2 read failures cannot be treated as ready",async()=>{
 const a=setup();
 await assert.rejects(qualifyQuotationPrivateStaging({...a.config,d1:{
  prepare(){throw Error("unavailable")}
 }}),/schema_read_failed/);
 const b=setup();
 await assert.rejects(qualifyQuotationPrivateStaging({...b.config,
  privateTemplateBucket:{list:async()=>{throw Error("forbidden")}}
 }),/private_storage_read_failed/);
});
