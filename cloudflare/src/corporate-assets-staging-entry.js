// Corporate Assets isolated staging scaffold: intentionally no application delegation.
// Activation requires a separately qualified authenticated staging runtime.
const json=(body,status)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-robots-tag':'noindex, nofollow','x-thebe-assets-staging':'isolated'}});
export function createCorporateAssetsStagingEntry(){
 return {async fetch(request,env){
  const url=new URL(request.url);
  if(env?.APP_ENV!=='staging'||env?.DEPLOYMENT_PROFILE!=='corporate-assets-isolated'||
     env?.THEBE_CORPORATE_ASSETS_ENABLED!=='false'||env?.ASSETS_STAGING_WRITES_ENABLED!=='false'||
     !/^[a-f0-9]{40}$/.test(String(env?.ASSETS_STAGING_SOURCE_SHA||''))||
     !/^[a-f0-9-]{36}$/.test(String(env?.ASSETS_STAGING_D1_ID||'')))return json({error:'staging_configuration_required'},503);
  if(request.method!=='GET'||url.pathname!=='/api/corporate-assets-staging/status')return json({error:'staging_route_disabled'},403);
  // Prove that the Worker is bound to the approved isolated DB, not a production database.
  try{
   const marker=await env.DB.prepare('SELECT database_id,environment FROM corporate_assets_staging_identity WHERE id=1').first();
   if(marker?.database_id!==env.ASSETS_STAGING_D1_ID||marker?.environment!=='corporate-assets-isolated')throw Error('staging_identity_mismatch');
  }catch{return json({error:'staging_database_unqualified'},503)}
  return json({mode:'isolated',assetWritesEnabled:false,authenticatedAcceptance:false,productionActivation:false,sourceSha:env.ASSETS_STAGING_SOURCE_SHA},200);
 }};
}
export default createCorporateAssetsStagingEntry();
