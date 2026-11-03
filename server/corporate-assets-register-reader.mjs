/** Tenant-scoped read-only asset register adapter. */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function listAssetRegister({db,context,limit=50}){
 if(!context||context.authorized!==true||!uuid.test(context.companyId||''))throw new Error('unauthorized');
 if(!db||typeof db.query!=='function'||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new TypeError('invalid_request');
 const result=await db.query('SELECT id,asset_name,asset_category,assigned_branch,status,current_book_value_bwp FROM corporate_assets WHERE company_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2',[context.companyId,limit]);
 return {assets:(result.rows||[]).map(row=>({id:row.id,name:row.asset_name,category:row.asset_category,branch:row.assigned_branch,status:row.status,bookValueBwp:Number(row.current_book_value_bwp)}))};
}
