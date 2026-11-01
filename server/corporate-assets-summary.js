/** Asset summary from authenticated, tenant-scoped database rows only.
 * Caller must authorize and filter by company_id on the server.
 */
function isCalendarDate(s){
 if(typeof s!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s))return false;
 const parsed=new Date(s+"T00:00:00Z");
 return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===s;
}
export function corporateAssetsSummary(assets,maintenance=[],insurance=[],asOf="2026-11-01"){
 if(!Array.isArray(assets)||!Array.isArray(maintenance)||!Array.isArray(insurance)||!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!isCalendarDate(asOf))throw new TypeError("invalid_asset_summary");
 const ids=new Set();let cents=0;
 for(const a of assets){
  if(typeof a?.id!=="string"||ids.has(a.id))throw new TypeError("invalid_asset_rows");
  ids.add(a.id);
  const value=Number(a.current_book_value_bwp);
  if(!Number.isFinite(value)||value<0||value>999999999999.99)throw new TypeError("invalid_book_value");
  cents+=Math.round(value*100);
  if(!Number.isSafeInteger(cents))throw new TypeError("asset_value_overflow");
 }
 const due=(rows,key)=>rows.reduce((count,row)=>{
  if(!ids.has(row?.asset_id))throw new TypeError("unscoped_asset_event");
  const date=row[key];if(typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new TypeError("invalid_due_date");
  return count+(date<=asOf?1:0);
 },0);
 return Object.freeze({totalAssets:assets.length,bookValueBwp:cents/100,maintenanceDue:due(maintenance,"next_due_date"),insuranceDue:due(insurance,"coverage_end")});
}
