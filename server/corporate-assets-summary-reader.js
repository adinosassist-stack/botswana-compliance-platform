/** Read-only server adapter. Caller injects a trusted authenticated principal, authorized database query and permission check. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createCorporateAssetsSummaryReader({query,authorize,clock=()=>new Date()}={}){
 if(typeof query!=="function"||typeof authorize!=="function"||typeof clock!=="function")throw new TypeError("invalid_dependencies");
 return async function readSummary(principal){
  if(!UUID.test(principal?.companyId||"")||!UUID.test(principal?.userId||""))throw new Error("unauthorized");
  if(await authorize(principal,"assets:read")!==true)throw new Error("forbidden");
  const company=principal.companyId;
  const today=clock();
  if(!(today instanceof Date)||Number.isNaN(today.getTime()))throw new Error("invalid_clock");
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Gaborone",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(today);
  const dateParts=Object.fromEntries(parts.filter(part=>["year","month","day"].includes(part.type)).map(part=>[part.type,part.value]));
  const asOf=`${dateParts.year}-${dateParts.month}-${dateParts.day}`;
  // All queries use server-resolved company context and bounded, aggregate results.
  const [assetTotals,maintenance,insurance]=await Promise.all([
   query("SELECT COUNT(*)::integer AS total, COALESCE(SUM(current_book_value_bwp),0)::text AS book_value FROM corporate_assets WHERE company_id=$1",[company],principal),
   query("SELECT COUNT(*)::integer AS total FROM asset_maintenance_logs WHERE company_id=$1 AND next_due_date IS NOT NULL AND next_due_date<=$2",[company,asOf],principal),
   query("SELECT COUNT(*)::integer AS total FROM asset_insurance_policies WHERE company_id=$1 AND coverage_end<=$2",[company,asOf],principal)
  ]);
  const count=x=>{const n=Number(x?.rows?.[0]?.total);if(!Number.isSafeInteger(n)||n<0)throw new Error("invalid_summary_result");return n};
  const total=count(assetTotals),maintenanceDue=count(maintenance),insuranceDue=count(insurance);
  const book=Number(assetTotals?.rows?.[0]?.book_value);
  if(!Number.isFinite(book)||book<0||book>Number.MAX_SAFE_INTEGER/100)throw new Error("invalid_summary_result");
  return Object.freeze({totalAssets:total,bookValueBwp:Math.round(book*100)/100,maintenanceDue,insuranceDue,asOf});
 };
}
