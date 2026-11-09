/**
 * Thebe Life: read-only staging qualification, intentionally not mounted.
 * This is NOT a deployment, migration runner, or public endpoint.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPECTED_TABLES=Object.freeze([
  'life_households','life_household_members','life_household_entries',
  'life_motshelo_groups','life_motshelo_members','life_motshelo_contributions'
]);
export async function qualifyThebeLifeStaging({env,productionDatabaseId,expectedSourceSha}={}){
  const failures=[];
  if(env?.APP_ENV!=='staging')failures.push('not_staging');
  if(env?.DEPLOYMENT_PROFILE!=='thebe-life-private-staging')failures.push('wrong_profile');
  if(env?.THEBE_LIFE_HOUSEHOLD_ENABLED!=='false')failures.push('life_flag_must_be_off');
  if(env?.THEBE_LIFE_INSURANCE_ENABLED!=='false')failures.push('insurance_flag_must_be_off');
  if(env?.THEBE_LIFE_MOTSHELO_PAYMENTS_ENABLED!=='false')failures.push('payments_flag_must_be_off');
  if(env?.LIFE_STAGING_PUBLIC_ROUTES_ENABLED!=='false')failures.push('public_routes_must_be_off');
  if(!UUID.test(String(env?.LIFE_D1_DATABASE_ID||'')))failures.push('staging_d1_id_invalid');
  if(!UUID.test(String(productionDatabaseId||'')))failures.push('production_d1_id_unverified');
  if(env?.LIFE_D1_DATABASE_ID && env.LIFE_D1_DATABASE_ID===productionDatabaseId)failures.push('d1_not_isolated');
  if(!/^[a-f0-9]{40}$/.test(String(expectedSourceSha||''))||env?.LIFE_STAGING_SOURCE_SHA!==expectedSourceSha)
    failures.push('source_sha_unverified');
  if(env?.LIFE_STAGING_DATA_CLASS!=='synthetic-only')failures.push('synthetic_only_required');
  if(typeof env?.LIFE_DB?.prepare!=='function')failures.push('staging_d1_binding_missing');
  if(failures.length)return Object.freeze({ready:false,failures});
  try{
    const result=await env.LIFE_DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('life_households','life_household_members','life_household_entries','life_motshelo_groups','life_motshelo_members','life_motshelo_contributions')"
    ).all();
    if(!Array.isArray(result?.results))return Object.freeze({ready:false,failures:['staging_d1_preflight_invalid']});
    const present=new Set(result.results.map(row=>row?.name));
    for(const table of EXPECTED_TABLES)if(!present.has(table))failures.push('missing_'+table);
  }catch{return Object.freeze({ready:false,failures:['staging_d1_read_failed']});}
  return Object.freeze({ready:failures.length===0,failures});
}
