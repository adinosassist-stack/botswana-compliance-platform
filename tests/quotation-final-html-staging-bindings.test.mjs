import test from "node:test";
import assert from "node:assert/strict";
import {createIsolatedLovelyFinalHtmlStagingComposition}
 from "../server/quotation-final-html-staging-bindings.mjs";
const tenantId="8c49e26a-48cd-411c-93a3-72809ba4f547";
const ORIGIN="https://quotation-staging.test";
const SOURCE="a".repeat(40);
const secret="S".repeat(45),caller="C".repeat(45);
const proof=()=>({
 accountId:"ddd23cab31928a4bb3d4998df9b26d1d",
 authDbId:"d7ad8e99-2ee4-446c-9358-0e186031571d",
 quoteDbId:"aec227e9-b0f2-4b00-8de0-105465c4e2d6",
 logoBucket:"bw-quotation-logo-private-staging",
 worker:"bw-quotation-final-html-private-staging",
 verifiedByIndependentPreflight:true,exactMainReviewed:true,
 ownerExactOperationApprovalRecorded:true,
 independentThusicoOperationApprovalRecorded:true,stagingWorkerInert:true,
 publicAndPreviewUrlsDisabled:true,productionBindingsAbsent:true,
 browserBindingQualified:true,browserRunEligibilityAndCostAccepted:true,
 isolatedSyntheticTenantVerified:true,privateCallerBindingVerified:true,
 recoveryPlanApproved:true,approvedSourceSha:SOURCE,currentMainSha:SOURCE
});
function fixtures(){
 const events=[];
 const db=name=>({prepare(sql){events.push(name+":prepare");return {
  bind(){events.push(name+":bind");return {first:async()=>null,run:async()=>({success:true,meta:{changes:1}})}}
 }}});
 const auth=db("auth"),quote=db("quote");
 const env={
  QUOTATION_PRIVATE_STAGE:"synthetic-internal-only",
  QUOTATION_PRIVATE_ORIGIN:ORIGIN,
  QUOTATION_PRIVATE_TENANT_ID:tenantId,
  QUOTATION_PRIVATE_SESSION_SECRET:secret,
  QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET:caller,
  AUTH_DB:auth,QUOTE_DB:quote,
  LOGO_R2:{get:async()=>null,put:async()=>({})},
  QUOTATION_BROWSER:{binding:"synthetic"}
 };
 const pdfLib={PDFDocument:{load:async()=>({})}};
 let launched=false;
 const options={env,proof:proof(),pdfLib,launchBrowser:async()=>{launched=true;throw Error("browser_must_not_launch")}};
 return {options,events,get launched(){return launched}};
}
const call=(host,headers={})=>host.handleInternal(new Request(
 ORIGIN+"/api/quotation/final-html/pdf-preview",{
 method:"POST",headers:{"content-type":"application/json",origin:ORIGIN,...headers},
 body:JSON.stringify({draftId:"syn1",revision:1})
}));
test("trusted exact-resource composition remains inaccessible without internal caller",async()=>{
 const f=fixtures();const host=createIsolatedLovelyFinalHtmlStagingComposition(f.options);
 const out=await call(host);
 assert.equal(out.status,404);
 assert.equal(f.events.length,0);
 assert.equal(f.launched,false);
});
test("correct secret alone cannot replace a real cookie/session",async()=>{
 const f=fixtures();const host=createIsolatedLovelyFinalHtmlStagingComposition(f.options);
 const out=await call(host,{"x-quotation-private-caller":caller});
 assert.equal(out.status,401);
 assert.equal(f.events.length,0);
 assert.equal(f.launched,false);
});
test("every independent Cloudflare preflight assertion is required",()=>{
 for(const key of [
 "verifiedByIndependentPreflight","exactMainReviewed",
 "ownerExactOperationApprovalRecorded","independentThusicoOperationApprovalRecorded",
 "stagingWorkerInert","publicAndPreviewUrlsDisabled",
 "productionBindingsAbsent","browserBindingQualified",
 "browserRunEligibilityAndCostAccepted","isolatedSyntheticTenantVerified",
 "privateCallerBindingVerified","recoveryPlanApproved"
 ]){
  const f=fixtures();f.options.proof[key]=false;
  assert.throws(()=>createIsolatedLovelyFinalHtmlStagingComposition(f.options),
   /independent_preflight_required/,key);
 }
});
test("wrong account/Worker/D1/R2 or stale exact-main source are rejected",()=>{
 for(const [key,value] of [
 ["accountId","different"],["worker","public-worker"],["authDbId","prod"],
 ["quoteDbId","prod"],["logoBucket","public-r2"],["approvedSourceSha","b".repeat(40)],
 ["currentMainSha","b".repeat(40)]
 ]){
  const f=fixtures();f.options.proof[key]=value;
  assert.throws(()=>createIsolatedLovelyFinalHtmlStagingComposition(f.options),
   /independent_preflight_required/,key);
 }
});
test("incomplete Worker bindings, shared DB and secrets cannot construct a host",()=>{
 for(const edit of [
 f=>{f.env.AUTH_DB=f.env.QUOTE_DB},
 f=>{delete f.env.AUTH_DB},
 f=>{delete f.env.LOGO_R2},
 f=>{delete f.env.QUOTATION_BROWSER},
 f=>{f.env.QUOTATION_PRIVATE_STAGE="production"},
 f=>{f.env.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET=secret},
 f=>{f.env.QUOTATION_PRIVATE_SESSION_SECRET="short"}
 ]){
  const f=fixtures();edit(f.options);
  assert.throws(()=>createIsolatedLovelyFinalHtmlStagingComposition(f.options),
   /isolated_bindings_required/);
 }
});
test("host refuses wrong tenant UUID and nonprivate origin",()=>{
 for(const [key,value] of [
 ["QUOTATION_PRIVATE_TENANT_ID","forged"],
 ["QUOTATION_PRIVATE_ORIGIN","https://thebedesk.com"]
 ]){
  const f=fixtures();f.options.env[key]=value;
  assert.throws(()=>createIsolatedLovelyFinalHtmlStagingComposition(f.options),
   /private_auth_unconfigured|private_preview_origin_invalid/);
 }
});
