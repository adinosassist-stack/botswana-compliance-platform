/** Tenant-scoped, read-only insurance query; requires server-resolved company context. */
import {expiryState} from './corporate-assets-domain.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function dateString(value){
 if(value instanceof Date && !Number.isNaN(value.getTime()))return value.toISOString().slice(0,10);
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
 throw new Error('invalid_policy_date');
}
export async function listInsurance({db,context,asOfDate,limit=50}){
 if(!context||context.authorized!==true||!uuid.test(context.companyId||''))throw new Error('unauthorized');
 if(!db||typeof db.query!=='function'||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new TypeError('invalid_request');
 const result=await db.query('SELECT a.asset_name AS asset_name, p.insurer AS provider, p.coverage_end AS end_date FROM asset_insurance_policies p JOIN corporate_assets a ON a.id=p.asset_id AND a.company_id=p.company_id WHERE p.company_id=$1 ORDER BY p.coverage_end ASC,p.id ASC LIMIT $2',[context.companyId,limit]);
 return {policies:(result.rows||[]).map(row=>({assetName:row.asset_name,provider:row.provider,endDate:dateString(row.end_date),state:expiryState(dateString(row.end_date),asOfDate)}))};
}
