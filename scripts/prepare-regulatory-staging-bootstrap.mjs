// Read-only guard for a separately approved, one-time empty staging bootstrap.
import {writeFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {createStagingRegulatoryAttestor} from "./regulatory-staging-readonly-attestor.mjs";

export const EMPTY_DATABASE_QUERY="SELECT COUNT(*) AS object_count FROM sqlite_schema WHERE substr(name,1,7) != 'sqlite_' AND name != '_cf_KV'";

export async function prepareStagingBootstrap(options){
  const {token,accountId,stagingDatabaseId,expectedStagingName,
    fetchImpl=globalThis.fetch}=options;
  if(String(stagingDatabaseId).toLowerCase()==="8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce")
    throw new Error("staging_bootstrap_production_forbidden");
  await createStagingRegulatoryAttestor({...options,fetchImpl}).verifyTarget();
  let body,response;
  try{
    response=await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${stagingDatabaseId}/query`,{
      method:"POST",redirect:"error",signal:AbortSignal.timeout(20000),
      headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
      body:JSON.stringify({sql:EMPTY_DATABASE_QUERY,params:[]})
    });
    body=await response.json();
  }catch{throw new Error("staging_bootstrap_inventory_unavailable")}
  const batches=body?.result,rows=batches?.[0]?.results;
  if(!response.ok||body?.success!==true||!Array.isArray(batches)||batches.length!==1||
    batches[0]?.success!==true||!Array.isArray(rows)||rows.length!==1||
    !Number.isSafeInteger(rows[0]?.object_count)||rows[0].object_count<0)
    throw new Error("staging_bootstrap_inventory_invalid");
  if(rows[0].object_count!==0)throw new Error("staging_bootstrap_requires_empty_database");
  return {name:"regulatory-staging-bootstrap",account_id:accountId,
    compatibility_date:"2026-09-03",d1_databases:[{binding:"STAGING_DB",
      database_id:stagingDatabaseId,database_name:expectedStagingName}]};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const config=await prepareStagingBootstrap({
      token:process.env.CLOUDFLARE_API_TOKEN,accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
      stagingDatabaseId:process.env.REGULATORY_STAGING_D1_ID,
      productionDatabaseId:process.env.PRODUCTION_D1_DATABASE_ID,
      expectedStagingName:process.env.REGULATORY_STAGING_D1_NAME
    });
    if(!process.argv[2])throw new Error("staging_bootstrap_config_path_required");
    writeFileSync(process.argv[2],JSON.stringify(config),{mode:0o600,flag:"wx"});
    console.log("Verified exact staging identity and empty database.");
  }catch(error){
    const code=/^staging_[a-z_]+$/.test(error.message)?error.message:"staging_bootstrap_failed";
    console.error("REGULATORY_STAGING_BOOTSTRAP_REFUSED "+code);
    process.exitCode=1;
  }
}
