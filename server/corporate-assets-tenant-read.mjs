/** PostgreSQL-only tenant-scoped read transaction for Corporate Assets.
 * Never use with Cloudflare D1 or an unqualified runtime database role.
 * Requires FORCE RLS policies independently verified before activation.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function withAssetTenantRead(pool,companyId,operation){
 if(!uuid.test(companyId||'')||!pool||typeof pool.connect!=='function'||typeof operation!=='function')throw new TypeError('invalid_tenant_read');
 const client=await pool.connect();
 let begun=false;
 try{
  await client.query('BEGIN READ ONLY');begun=true;
  await client.query("SELECT set_config('app.current_tenant_id',$1,true)",[companyId]);
  const result=await operation({query:(sql,params)=>client.query(sql,params)});
  await client.query('COMMIT');begun=false;
  return result;
 }catch(error){
  if(begun){try{await client.query('ROLLBACK')}catch{error.rollbackFailed=true}}
  throw error;
 }finally{client.release()}
}
export function createAssetTenantDatabase(pool){
 if(!pool||typeof pool.connect!=='function')throw new TypeError('invalid_tenant_pool');
 return async function getDatabase(principal){
  if(!uuid.test(principal?.companyId||''))throw new TypeError('invalid_tenant');
  return {query:(sql,params)=>withAssetTenantRead(pool,principal.companyId,db=>db.query(sql,params))};
 };
}
