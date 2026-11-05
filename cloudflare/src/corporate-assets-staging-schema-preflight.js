// Read-only schema and identity preflight for the isolated Corporate Assets staging D1.
// It neither creates sessions nor changes business records.
export const ASSET_STAGING_REQUIRED_COLUMNS=Object.freeze({
 tenants:['id','name'],users:['id','email','password_hash','session_generation'],
 memberships:['tenant_id','user_id','role','status'],
 sessions:['token_hash','user_id','tenant_id','role','session_generation','csrf_token','expires_at'],
 audit_events:['tenant_id','actor_user_id','event_type','entity_type','entity_id','tenant_seq','prev_hash','event_hash','integrity_version'],
 audit_chain_state:['tenant_id','last_hash','event_count'],
 corporate_assets:['id','tenant_id','revision','book_value_minor'],
 corporate_asset_services:['id','tenant_id','asset_id','due_on']
});
const validId=s=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(s||''));
export async function corporateAssetsStagingSchemaPreflight(env){
 if(env?.APP_ENV!=='staging'||!validId(env?.ASSETS_STAGING_D1_ID)||!env?.DB)
  return {ready:false,reason:'staging_config_required'};
 try{
  const marker=await env.DB.prepare('SELECT database_id,environment FROM corporate_assets_staging_identity WHERE id=1').first();
  if(marker?.database_id!==env.ASSETS_STAGING_D1_ID||marker?.environment!=='corporate-assets-isolated')return {ready:false,reason:'isolated_database_identity_required'};
  for(const [table,columns] of Object.entries(ASSET_STAGING_REQUIRED_COLUMNS)){
   // All table names are static in this file, never user supplied.
   const rows=await env.DB.prepare(`PRAGMA table_info(${table})`).all();
   const present=new Set((rows?.results||[]).map(row=>row.name));
   if(columns.some(column=>!present.has(column)))return {ready:false,reason:'missing_required_schema',table};
  }
  return {ready:true,mode:'read_only_preflight'};
 }catch{return {ready:false,reason:'schema_read_unavailable'}}
}
