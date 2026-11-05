#!/usr/bin/env node
// Independent read-only inventory. Does not create buckets, inspect objects, or authorize exports.
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const target="bw-ai-exports-staging";
if(account!=="ddd23cab31928a4bb3d4998df9b26d1d"||!token)
  throw Error("dedicated_read_only_account_credentials_required");
const base="https://api.cloudflare.com/client/v4/accounts/"+account+"/r2/buckets";
async function read(path){
 const response=await fetch(base+path,{method:"GET",redirect:"error",
  headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error("cloudflare_read_unavailable:"+response.status);
 const body=await response.json();
 if(body.success!==true)throw Error("cloudflare_provider_error");
 return body.result;
}
const all=await read("");
if(!Array.isArray(all?.buckets))throw Error("bucket_inventory_unavailable");
const matching=all.buckets.filter(b=>b.name===target);
let managedDisabled=false,customEmpty=false;
if(matching.length===1){
 const [managed,custom]=await Promise.all([
  read("/"+encodeURIComponent(target)+"/domains/managed"),
  read("/"+encodeURIComponent(target)+"/domains/custom")
 ]);
 managedDisabled=managed?.enabled===false;
 customEmpty=Array.isArray(custom?.domains)&&custom.domains.length===0;
}
const present=matching.length===1;
const privateStorage=present&&managedDisabled&&customEmpty;
const report={kind:"ai_export_private_staging_bucket_inventory",bucket:target,present,
 managedDomainDisabled:managedDisabled,customDomainsEmpty:customEmpty,
 privateStorage,metadataSchemaVerified:false,objectRoundTripVerified:false,
 tenantAccessVerified:false,productionReady:false};
console.log(JSON.stringify(report));
if(!privateStorage)process.exitCode=2;
