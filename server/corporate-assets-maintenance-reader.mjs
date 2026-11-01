/** Tenant-scoped maintenance list; server resolves the authenticated company. */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function dateString(value){if(value instanceof Date)return value.toISOString().slice(0,10);if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}/.test(value))return value.slice(0,10);throw new Error('invalid_service_date')}
export async function listMaintenance({db,context,limit=50}){
 if(!context||context.authorized!==true||!uuid.test(context.companyId||''))throw new Error('unauthorized');
 if(!db||typeof db.query!=='function'||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new TypeError('invalid_request');
 const result=await db.query('SELECT a.asset_name AS asset_name, m.description AS description, m.service_date AS service_date, m.cost_bwp AS cost_bwp FROM asset_maintenance_logs m JOIN corporate_assets a ON a.company_id=m.company_id AND a.id=m.asset_id WHERE m.company_id=$1 ORDER BY m.service_date DESC,m.id DESC LIMIT $2',[context.companyId,limit]);
 return {events:(result.rows||[]).map(row=>({assetName:row.asset_name,description:row.description,serviceDate:dateString(row.service_date),costBwp:Number(row.cost_bwp)}))};
}
