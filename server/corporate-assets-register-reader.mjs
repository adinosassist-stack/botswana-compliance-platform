/** Tenant-scoped, read-only asset register adapter. Never accepts a client tenant ID. */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fieldColumns=Object.freeze({category:'asset_category',branch:'assigned_branch',status:'status'});
function validatedFilter(value,key){
 if(value===undefined)return undefined;
 if(typeof value!=='string'||value.trim()!==value||value.length<1||value.length>80||/[\x00-\x1f\x7f]/.test(value))throw new TypeError('invalid_'+key);
 return value;
}
export async function listAssetRegister({db,context,limit=50,filters={}}){
 if(!context||context.authorized!==true||!uuid.test(context.companyId||''))throw new Error('unauthorized');
 if(!db||typeof db.query!=='function'||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new TypeError('invalid_request');
 if(!filters||typeof filters!=='object'||Array.isArray(filters)||Object.keys(filters).some(key=>!Object.hasOwn(fieldColumns,key)))throw new TypeError('invalid_filters');
 const params=[context.companyId];
 const conditions=['company_id=$1'];
 for(const [key,column] of Object.entries(fieldColumns)){
  const value=validatedFilter(filters[key],key);
  if(value!==undefined){params.push(value);conditions.push(column+'=$'+params.length)}
 }
 params.push(limit);
 const sql='SELECT id,asset_name,asset_category,assigned_branch,status,current_book_value_bwp FROM corporate_assets WHERE '+conditions.join(' AND ')+' ORDER BY created_at DESC,id DESC LIMIT $'+params.length;
 const result=await db.query(sql,params);
 return {assets:(result.rows||[]).map(row=>({id:row.id,name:row.asset_name,category:row.asset_category,branch:row.assigned_branch,status:row.status,bookValueBwp:Number(row.current_book_value_bwp)}))};
}
