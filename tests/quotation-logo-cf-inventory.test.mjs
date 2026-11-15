import test from "node:test";
import assert from "node:assert/strict";
import {
 summarizeQuotationStagingInventory,inspectQuotationCloudflareResources
} from "../scripts/quotation-staging-resource-inventory.mjs";
const accountId="ddd23cab-3192-4a4b-8b3d-4998df9b26d1";
const productionD1Id="8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce";
const stageId="11111111-2222-4333-8444-555555555555";
const sha="f".repeat(40);
const names=["bw-quotation-logo-private-staging","bw-quotation-template-private-staging"];
const defaults={productionD1Id,productionBucketNames:["bw-compliance-ops-backups"],exactMainSha:sha};
const database={name:"bw-quotation-staging",uuid:stageId};
const buckets=names.map(name=>({name}));
function mock({db=[database],r2=buckets,badStatus=false,missingPagination=false}={}){
 const requests=[];
 const fetchImpl=async (url,options)=>{
  const u=new URL(url);
  requests.push({url:u.toString(),options});
  if(badStatus)return new Response("forbidden",{status:403});
  if(u.pathname.endsWith("/d1/database"))return Response.json({
   success:true,result:db,...(missingPagination?{}:{result_info:{total_pages:1}})
  });
  if(u.pathname.endsWith("/r2/buckets"))return Response.json({
   success:true,result:{buckets:r2,cursor:""}
  });
  throw Error("unexpected_cloudflare_path");
 };
 return {fetchImpl,requests};
}
test("fully absent quotation staging resources remain blocked without any writes",async()=>{
 const {fetchImpl,requests}=mock({db:[],r2:[]});
 const report=await inspectQuotationCloudflareResources({
  fetchImpl,apiToken:"simulated_read_only_token",accountId,...defaults
 });
 assert.deepEqual(report.presence,{d1:false,logoBucket:false,templateBucket:false});
 assert.deepEqual(report.missingOrUnsafe,[
  "dedicated_d1_missing","private_logo_bucket_missing","private_template_bucket_missing"
 ]);
 assert.equal(report.deploymentAuthorized,false);
 assert.equal(report.nextAction,"obtain_independent_provisioning_approval");
 assert.equal(requests.length,2);
 assert.ok(requests.every(req=>req.options.method==="GET"));
 assert.ok(requests.every(req=>new URL(req.url).hostname==="api.cloudflare.com"));
});
test("resource presence is not approval nor a claim public routes are private",async()=>{
 const {fetchImpl}=mock();
 const report=await inspectQuotationCloudflareResources({
  fetchImpl,apiToken:"simulated_read_only_token",accountId,...defaults
 });
 assert.equal(report.resourceIdentityCheckPassed,true);
 assert.equal(report.deploymentAuthorized,false);
 assert.equal(report.privateRoutesVerified,false);
 assert.equal(report.productionIsolationFullyVerified,false);
 assert.equal(report.templateApproved,false);
 assert.equal(report.stagingD1Id,stageId);
});
test("rejects D1 equal to production and R2 collision with known production bucket",()=>{
 const prodDb=[{name:"bw-quotation-staging",uuid:productionD1Id}];
 const report=summarizeQuotationStagingInventory({
  ...defaults,databases:prodDb,buckets
 });
 assert.equal(report.resourceIdentityCheckPassed,false);
 assert.ok(report.missingOrUnsafe.includes("d1_identity_invalid_or_production"));
 const collision=summarizeQuotationStagingInventory({
  ...defaults,productionBucketNames:[names[0]],databases:[database],buckets
 });
 assert.equal(collision.resourceIdentityCheckPassed,false);
 assert.ok(collision.missingOrUnsafe.includes("private_bucket_name_conflicts_with_production"));
});
test("upstream 403, missing pagination and bogus data fail closed",async()=>{
 for(const options of [{badStatus:true},{missingPagination:true}]){
  const {fetchImpl}=mock(options);
  await assert.rejects(inspectQuotationCloudflareResources({
   fetchImpl,apiToken:"simulated_read_only_token",accountId,...defaults
  }),/quotation_inventory_/);
 }
 await assert.rejects(inspectQuotationCloudflareResources({
  fetchImpl:async()=>new Response("<html>bad</html>"),
  apiToken:"simulated_read_only_token",accountId,...defaults
 }),/quotation_inventory_/);
 await assert.rejects(inspectQuotationCloudflareResources({
  fetchImpl:async()=>new Response("not found",{status:404}),
  apiToken:"simulated_read_only_token",accountId,...defaults
 }),/quotation_inventory_/);
});
test("D1 pagination is complete before readiness and no page beyond guard is trusted",async()=>{
 const calls=[];
 const fetchImpl=async (url,options)=>{
  const u=new URL(url);calls.push(u);
  if(u.pathname.endsWith("/d1/database")){
   return Response.json({success:true,result:u.searchParams.get("page")==="1"?[]:[database],
    result_info:{total_pages:2}});
  }
  return Response.json({success:true,result:{buckets,cursor:""}});
 };
 const result=await inspectQuotationCloudflareResources({
  fetchImpl,apiToken:"simulated_read_only_token",accountId,...defaults
 });
 assert.equal(result.presence.d1,true);
 assert.equal(calls.length,3);
 assert.ok(calls.every(x=>x.hostname==="api.cloudflare.com"));
});
test("does not accept duplicate ambiguous inventory or malformed expected SHA",()=>{
 assert.throws(()=>summarizeQuotationStagingInventory({
  ...defaults,databases:[database,database],buckets
 }),/ambiguous/);
 assert.throws(()=>summarizeQuotationStagingInventory({
  ...defaults,exactMainSha:"invalid",databases:[database],buckets
 }),/invalid/);
});
