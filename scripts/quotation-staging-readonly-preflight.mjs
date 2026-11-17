/**
 * Quotation staging deployment preflight, strictly READ-ONLY.
 * This command reads a reviewed Cloudflare resource inventory supplied by an
 * independent verifier. It does not assume config IDs prove remote binding.
 * It NEVER uploads a Worker or writes Cloudflare data.
 */
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";

export const expected=Object.freeze({
 worker:"bw-quotation-auth-private-staging",
 authD1:"d7ad8e99-2ee4-446c-9358-0e186031571d",
 quotationD1:"aec227e9-b0f2-4b00-8de0-105465c4e2d6",
 logoR2:"bw-quotation-logo-private-staging",
 templateR2:"bw-quotation-template-private-staging"
});
const fail=reason=>{throw Error("quotation_staging_preflight_"+reason)};
const exact=(actual,required,reason)=>{if(actual!==required)fail(reason)};
export function verifyQuotationStagingPreflight({manifestText,inventory,exactMainSha,reviewedMainSha}={}){
 if(typeof manifestText!=="string"||!inventory||typeof inventory!=="object"||
    Array.isArray(inventory))fail("missing_inputs");
 if(!/^[0-9a-f]{40}$/.test(exactMainSha||"")||
    !/^[0-9a-f]{40}$/.test(reviewedMainSha||"")||
    exactMainSha!==reviewedMainSha)fail("source_mismatch");
 // Manifest is JSONC but only comment lines are supported in this locked file.
 const raw=manifestText.split("\n").filter(line=>!/^\s*\/\//.test(line)).join("\n");
 let manifest;
 try{manifest=JSON.parse(raw)}catch{fail("invalid_manifest")}
 exact(manifest.name,expected.worker,"worker_name");
 exact(manifest.workers_dev,false,"public_url");
 exact(manifest.preview_urls,false,"preview_url");
 if(!Array.isArray(manifest.routes)||manifest.routes.length)fail("public_routes");
 if(manifest.main!=="../../server/quotation-service-bound-staging-worker.mjs")
  fail("wrong_module");
 const d1=manifest.d1_databases,r2=manifest.r2_buckets;
 if(!Array.isArray(d1)||d1.length!==2||!Array.isArray(r2)||r2.length!==2)
  fail("resource_shape");
 for(const [binding,name,id] of [
  ["AUTH_DB","bw-quotation-auth-synthetic-staging",expected.authD1],
  ["QUOTE_DB","bw-quotation-staging",expected.quotationD1]
 ]){
  const found=d1.filter(x=>x.binding===binding);
  if(found.length!==1||found[0].database_name!==name||found[0].database_id!==id)
   fail("database_binding_"+binding);
 }
 for(const [binding,bucket] of [
  ["LOGO_R2",expected.logoR2],["TEMPLATE_R2",expected.templateR2]
 ]){
  const found=r2.filter(x=>x.binding===binding);
  if(found.length!==1||found[0].bucket_name!==bucket)
   fail("bucket_binding_"+binding);
 }
 // Inventory must come from authenticated read-only Cloudflare GETs.
 // It proves resources EXIST, not that they are attached to a deployed Worker.
 if(inventory.source!=="cloudflare-read-only-get"||
    inventory.accountId!=="ddd23cab31928a4bb3d4998df9b26d1d"||
    inventory.exactMainSha!==exactMainSha)fail("inventory_provenance");
 for(const [key,name,id] of [
  ["authD1","bw-quotation-auth-synthetic-staging",expected.authD1],
  ["quoteD1","bw-quotation-staging",expected.quotationD1]
 ]){
  const item=inventory[key];
  if(!item||item.name!==name||item.uuid!==id||item.success!==true)
   fail("remote_database_"+key);
 }
 for(const [key,name] of [
  ["logoR2",expected.logoR2],["templateR2",expected.templateR2]
 ]){
  const item=inventory[key];
  if(!item||item.success!==true||item.name!==name)fail("remote_bucket_"+key);
 }
 const worker=inventory.worker;
 if(worker?.success!==true||worker.name!==expected.worker||
    worker.deployed_on!==null||worker.public!==false||
    worker.preview!==false||worker.workerReferences!==0||
    worker.domainReferences!==0)fail("worker_isolation");
 if(!Array.isArray(worker.versions)||worker.versions.length!==1||
    worker.versions[0].id!=="cc20de6e-ab08-409f-89a1-390e0eaf5be1"||
    worker.versions[0].module!=="quotation-private-bootstrap-deny-all.mjs"||
    !Array.isArray(worker.versions[0].urls)||worker.versions[0].urls.length)
  fail("unreviewed_worker_version");
 return Object.freeze({
  allowedMode:"READ_ONLY_PREFLIGHT_ONLY",remoteResourceIdentityVerified:true,
  liveWorkerBindingVerified:false,executableWorkerDeployed:false,
  stagingDeploymentAuthorized:false,publicLaunchAuthorized:false,
  exactMainSha,manifestSha256:createHash("sha256").update(manifestText).digest("hex")
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [manifestPath,inventoryPath,mainSha,reviewedSha]=process.argv.slice(2);
 try{
  const report=verifyQuotationStagingPreflight({
   manifestText:readFileSync(manifestPath,"utf8"),
   inventory:JSON.parse(readFileSync(inventoryPath,"utf8")),
   exactMainSha:mainSha,reviewedMainSha:reviewedSha
  });
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
 }catch(error){process.stderr.write(String(error.message)+"\n");process.exitCode=1}
}
