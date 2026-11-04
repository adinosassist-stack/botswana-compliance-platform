/** Tenant-scoped maintenance list; filters are server-side and never select tenant identity. */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function dateString(value){
 if(value instanceof Date&&Number.isFinite(value.getTime()))return value.toISOString().slice(0,10);
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&validDate(value))return value;
 throw new Error('invalid_service_date');
}
function validDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [y,m,d]=value.split('-').map(Number);
 if(y<1||m<1||m>12||d<1||d>31)return false;
 const dt=new Date(0);dt.setUTCFullYear(y,m-1,d);dt.setUTCHours(0,0,0,0);
 return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d;
}
export async function listMaintenance({db,context,limit=50,fromDate,toDate}){
 if(!context||context.authorized!==true||!uuid.test(context.companyId||''))throw new Error('unauthorized');
 if(!db||typeof db.query!=='function'||!Number.isSafeInteger(limit)||limit<1||limit>100)throw new TypeError('invalid_request');
 if((fromDate!==undefined&&!validDate(fromDate))||(toDate!==undefined&&!validDate(toDate))||(fromDate&&toDate&&fromDate>toDate))throw new TypeError('invalid_date_range');
 const params=[context.companyId],where=['m.company_id=$1'];
 if(fromDate!==undefined){params.push(fromDate);where.push('m.service_date >= $'+params.length)}
 if(toDate!==undefined){params.push(toDate);where.push('m.service_date <= $'+params.length)}
 params.push(limit);
 const sql='SELECT a.asset_name AS asset_name, m.description AS description, m.service_date AS service_date, m.cost_bwp AS cost_bwp FROM asset_maintenance_logs m JOIN corporate_assets a ON a.company_id=m.company_id AND a.id=m.asset_id WHERE '+where.join(' AND ')+' ORDER BY m.service_date DESC,m.id DESC LIMIT $'+params.length;
 const result=await db.query(sql,params);
 return {events:(result.rows||[]).map(row=>({assetName:row.asset_name,description:row.description,serviceDate:dateString(row.service_date),costBwp:Number(row.cost_bwp)}))};
}
