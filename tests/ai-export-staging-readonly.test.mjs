import assert from "node:assert/strict";
import {test} from "node:test";
import {inspectAiExportStaging} from "../cloudflare/src/ai-export-staging-readonly.js";
function fixture({envName="staging",schema=true,shareEvidence=false,r2Result=null}={}){
 const calls=[];
 const db={prepare(sql){calls.push(["d1.prepare",sql]);return{bind(...args){calls.push(["d1.bind",args]);return{first:async()=>{calls.push(["d1.first"]);return schema?{name:"ai_document_export_jobs"}:null}}}}}};
 const r2={head:async key=>{calls.push(["r2.head",key]);return r2Result}};
 const env={APP_ENV:envName,DB:db,EVIDENCE:shareEvidence?r2:{head:async()=>{throw Error("evidence must not be accessed")}},EXPORTS:r2};
 return {env,calls};
}
test("authorized staging preflight is read-only and cannot attest production readiness",async()=>{
 const {env,calls}=fixture();
 const result=await inspectAiExportStaging({env,authorized:true});
 assert.equal(result.ok,true);assert.equal(result.productionReady,false);
 assert.equal(result.checks.metadataTable,true);assert.equal(result.checks.bucketReachable,true);
 assert.deepEqual(calls.map(x=>x[0]),["d1.prepare","d1.bind","d1.first","r2.head"]);
 assert.equal(calls[1][1][1],"ai_document_export_jobs");
 assert.equal(calls[3][1],"ai-exports/_preflight_/missing-object");
});
test("unauthorized and production calls do not access storage at all",async()=>{
 for(const [env,authorized] of [[fixture().env,false],[fixture({envName:"production"}).env,true]]){
  const x=await inspectAiExportStaging({env,authorized});
  assert.equal(x.ok,false);assert.equal(x.reasons[0],"staging_read_authorization_required");
 }
});
test("the evidence bucket cannot be reused as private export storage",async()=>{
 const {env,calls}=fixture({shareEvidence:true});
 const x=await inspectAiExportStaging({env,authorized:true});
 assert.equal(x.ok,false);assert.equal(x.checks.dedicatedBucket,false);
 assert.equal(calls.filter(x=>x[0]==="r2.head").length,0);
});
test("missing D1 schema and R2 sentinel collision are both blockers",async()=>{
 const {env}=fixture({schema:false,r2Result:{key:"already-present"}});
 const x=await inspectAiExportStaging({env,authorized:true});
 assert.equal(x.ok,false);
 assert.equal(x.reasons.includes("export_metadata_schema_not_applied"),true);
 assert.equal(x.reasons.includes("staging_sentinel_collision"),true);
});
test("staging storage exceptions do not disclose sensitive values",async()=>{
 const {env}=fixture();
 env.DB.prepare=()=>{throw Error("password=secret")};
 env.EXPORTS.head=async()=>{throw Error("token=secret")};
 const x=await inspectAiExportStaging({env,authorized:true});
 assert.equal(x.ok,false);
 assert.equal(JSON.stringify(x).includes("secret"),false);
 assert.equal(x.reasons.includes("staging_d1_read_failed"),true);
 assert.equal(x.reasons.includes("staging_r2_read_failed"),true);
});
