/** Read-only staging probe for Corporate Assets PostgreSQL RLS.
 * Never runs automatically or against production. Caller supplies an isolated
 * staging pool, qualified runtime role, and two fixture tenant UUIDs.
 */
import {withAssetTenantRead} from './corporate-assets-tenant-read.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function probeCorporateAssetsRls({pool,tenantA,tenantB}={}){
 if(!pool||typeof pool.connect!=='function'||!uuid.test(tenantA||'')||!uuid.test(tenantB||'')||tenantA===tenantB)throw new TypeError('invalid_rls_probe');
 const inspect=async tenant=>withAssetTenantRead(pool,tenant,async db=>{
  const role=await db.query("SELECT current_user AS role, current_setting('row_security') AS row_security");
  const privileges=await db.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user");
  const grants=await db.query("SELECT has_table_privilege(current_user, 'corporate_assets', 'SELECT') AS can_read, has_table_privilege(current_user, 'corporate_assets', 'INSERT,UPDATE,DELETE') AS can_write");
  const policies=await db.query("SELECT c.relname AS tablename,c.relrowsecurity AS rowsecurity,c.relforcerowsecurity AS forcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname=ANY($1::text[]) AND c.relkind IN ('r','p')",[['corporate_assets','asset_maintenance_logs','asset_insurance_policies']]);
  const rows=await db.query('SELECT company_id,COUNT(*)::integer AS count FROM corporate_assets GROUP BY company_id');
  return {role:role.rows?.[0],privileges:privileges.rows?.[0],grants:grants.rows?.[0],tables:policies.rows||[],visibleTenants:(rows.rows||[]).map(r=>r.company_id)};
 });
 const a=await inspect(tenantA),b=await inspect(tenantB);
 const required=['corporate_assets','asset_maintenance_logs','asset_insurance_policies'];
 const qualified=result=>result.role?.row_security==='on'&&result.privileges?.rolsuper===false&&result.privileges?.rolbypassrls===false&&result.grants?.can_read===true&&result.grants?.can_write===false&&required.every(name=>result.tables.some(t=>t.tablename===name&&t.rowsecurity===true&&t.forcerowsecurity===true));
 const safe=(result,tenant)=>result.visibleTenants.length===1&&result.visibleTenants[0]===tenant;
 return {qualified:qualified(a)&&qualified(b)&&safe(a,tenantA)&&safe(b,tenantB),a:{...a,visibleTenants:a.visibleTenants.length},b:{...b,visibleTenants:b.visibleTenants.length}};
}
