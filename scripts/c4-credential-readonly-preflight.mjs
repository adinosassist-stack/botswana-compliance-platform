#!/usr/bin/env node
/**
 * Read-only, exact-account and exact-disposable D1 metadata + bookmark proof.
 * No SQL query, no execute endpoint, no D1 restore, no Cloudflare writes.
 * A success proves GET authority only, never D1 Write or Time Travel restore.
 */
export const ACCOUNT="ddd23cab31928a4bb3d4998df9b26d1d";
export const DATABASE="abc83674-a1b3-4e71-8b93-497f0fb2c081";
export const NAME="bw-c4-quotation-restore-rehearsal-20261121";
const BASE="https://api.cloudflare.com/client/v4";
export async function c4ReadOnlyProof({token,fetchImpl=fetch}={}){
  if(typeof token!=="string"||token.length<15)throw Error("protected_secret_missing");
  const paths=[
    `/accounts/${ACCOUNT}/d1/database/${DATABASE}`,
    `/accounts/${ACCOUNT}/d1/database/${DATABASE}/time_travel/bookmark`
  ];
  const results=[];
  for(const path of paths){
    const response=await fetchImpl(BASE+path,{
      method:"GET",redirect:"error",
      headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},
      signal:AbortSignal.timeout(15000)
    });
    if(!response.ok)throw Error(`read_only_get_denied_http_${response.status}`);
    const data=await response.json();
    if(data?.success!==true)throw Error("cloudflare_read_only_get_failed");
    results.push(data.result);
  }
  const [db,bookmark]=results;
  if(db?.uuid!==DATABASE||db?.name!==NAME)throw Error("disposable_database_mismatch");
  if(db?.num_tables!==0)throw Error("disposable_database_not_empty");
  if(typeof bookmark?.bookmark!=="string"||!bookmark.bookmark.length)
    throw Error("time_travel_bookmark_unavailable");
  return Object.freeze({
    kind:"c4_protected_readonly_credential_preflight",
    account:ACCOUNT,database:DATABASE,databaseName:NAME,
    metadataReadVerified:true,bookmarkReadVerified:true,
    applicationTables:db.num_tables,
    bookmarkPresent:true,
    credentialScopeVerified:false,d1WriteAuthorized:false,
    restoreAuthorized:false,sqlWriteAuthorized:false,
    customerActivationAuthorized:false,productionChange:false
  });
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
  if(process.argv.length!==3||process.argv[2]!=="--protected-readonly"){
    console.error("DENIED: protected read-only explicit mode required");
    process.exitCode=2;
  }else{
    try{
      const proof=await c4ReadOnlyProof({token:process.env.C4_STAGING_D1_CLOUDFLARE_TOKEN});
      process.stdout.write(JSON.stringify(proof)+"\n");
    }catch(error){
      console.error("C4_READONLY_PREFLIGHT_FAILED:",String(error.message||"unknown"));
      process.exitCode=1;
    }
  }
}
