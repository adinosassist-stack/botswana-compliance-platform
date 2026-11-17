/**
 * Pure, read-only quotation rehearsal readiness evaluator.
 * Does not fetch Cloudflare data, create credentials, or deploy resources.
 * Caller must supply inventory gathered independently from authenticated GETs.
 * A "ready" result is never an operational deployment authorization.
 */
const SHA=/^[0-9a-f]{40}$/;
const WORKER="bw-quotation-auth-private-staging";
const CALLER="bw-quotation-synthetic-caller-staging";
const HARNESS="bw-quotation-private-workflow-harness";
const exactResources=Object.freeze({
 authD1:"d7ad8e99-2ee4-446c-9358-0e186031571d",
 quoteD1:"aec227e9-b0f2-4b00-8de0-105465c4e2d6",
 logoR2:"bw-quotation-logo-private-staging",
 templateR2:"bw-quotation-template-private-staging"
});
function jsonc(text){
 // Only whole-line comments are supported by the locked manifests.
 return JSON.parse(text.split("\n").filter(line=>!/^\s*\/\//.test(line)).join("\n"));
}
const hasOnly=(values,expected)=>Array.isArray(values)&&
 values.length===expected.length&&new Set(values).size===expected.length&&
 expected.every(value=>values.includes(value));
export function checkQuotationPrivateRehearsal({
 mainSha,approvedMainSha,manifests,inventory,artifacts,approvals
}={}){
 const blockers=[];
 const require=(ok,reason)=>{if(!ok)blockers.push(reason)};
 require(SHA.test(mainSha||"")&&mainSha===approvedMainSha,"exact_main_not_reviewed");
 require(inventory?.source==="cloudflare-read-only-get"&&
   inventory?.accountId==="ddd23cab31928a4bb3d4998df9b26d1d"&&
   inventory?.exactMainSha===mainSha,"cloudflare_inventory_unattested");
 let service,caller,harness;
 try{
  service=jsonc(manifests?.service||"");
  caller=jsonc(manifests?.caller||"");
  harness=jsonc(manifests?.harness||"");
 }catch{blockers.push("manifest_unparseable")}
 if(service&&caller&&harness){
  for(const [name,manifest,script] of [
   ["service",service,WORKER],["caller",caller,CALLER],["harness",harness,HARNESS]
  ]){
   require(manifest.name===script,name+"_script_mismatch");
   require(manifest.workers_dev===false&&manifest.preview_urls===false&&
     Array.isArray(manifest.routes)&&manifest.routes.length===0,name+"_public_endpoint");
  }
  const db=service.d1_databases||[],r2=service.r2_buckets||[];
  for(const [binding,id] of [["AUTH_DB",exactResources.authD1],["QUOTE_DB",exactResources.quoteD1]]){
   require(db.filter(x=>x.binding===binding&&x.database_id===id).length===1,
     "service_"+binding+"_mismatch");
  }
  for(const [binding,bucket] of [["LOGO_R2",exactResources.logoR2],["TEMPLATE_R2",exactResources.templateR2]]){
   require(r2.filter(x=>x.binding===binding&&x.bucket_name===bucket).length===1,
     "service_"+binding+"_mismatch");
  }
  require(hasOnly((caller.services||[]).map(x=>x.binding+":"+x.service),
   ["QUOTATION_SERVICE:"+WORKER]),"caller_private_service_binding");
  require(hasOnly((harness.services||[]).map(x=>x.binding+":"+x.service),
   ["QUOTATION_SERVICE:"+WORKER,"QUOTATION_SYNTHETIC_CALLER:"+CALLER]),"harness_private_service_bindings");
  require(harness.vars?.QUOTATION_HARNESS_ENABLED==="disabled","harness_must_start_disabled");
 }
 for(const [key,id] of [["authD1",exactResources.authD1],["quoteD1",exactResources.quoteD1]]){
  require(inventory?.resources?.[key]?.id===id&&
   inventory.resources[key].exists===true,"remote_"+key+"_missing");
 }
 for(const [key,name] of [["logoR2",exactResources.logoR2],["templateR2",exactResources.templateR2]]){
  require(inventory?.resources?.[key]?.name===name&&
   inventory.resources[key].exists===true,"remote_"+key+"_missing");
 }
 for(const script of [WORKER,CALLER,HARNESS]){
  const observed=inventory?.scripts?.[script];
  require(observed?.exists===true,script+"_absent");
  require(observed?.publicRoutes===0&&observed?.previewUrls===false&&
    observed?.workersDev===false,script+"_privacy_unverified");
  require(observed?.bindingsVerified===true,script+"_bindings_unverified");
  require(observed?.requiredSecretsPresent===true,script+"_secrets_unverified");
 }
 for(const name of ["caller","harness"]){
  const receipt=artifacts?.[name];
  require(receipt?.sourceSha===mainSha&&
    /^[a-f0-9]{64}$/.test(receipt?.manifestSha256||"")&&
    receipt?.mode==="OFFLINE_BUILD_ONLY",name+"_main_binary_receipt_missing");
 }
 require(inventory?.privateInvocationIndependentlyVerified===true,
    "private_invocation_unverified");
 require(inventory?.isolatedRestoreTested===true,
    "recovery_not_tested");
 require(approvals?.ownerExactArtifact===true&&
   approvals?.thusicoExactArtifact===true,
    "operational_approvals_missing");
 // Even when all evidence exists, the checker never authorizes a deploy.
 return Object.freeze({
  evaluation:"SOURCE_ONLY_READINESS_CHECK",
  inputMainSha:mainSha||null,
  blockers:Object.freeze([...new Set(blockers)]),
  evidenceComplete:blockers.length===0,
  deployAuthorized:false,
  workflowExecutionAuthorized:false,
  publicLaunchAuthorized:false
 });
}
