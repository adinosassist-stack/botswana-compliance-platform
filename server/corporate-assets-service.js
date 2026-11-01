/** Corporate Assets V1: framework-independent authenticated Postgres service.
 * All SQL is parameterized and scoped to server-resolved company identity.
 * Wire only behind independently reviewed auth, CSRF and route rate limits.
 */
const categories=new Set(["Fleet","IT Hardware","Machinery","Office Furniture","Other"]);
const statuses=new Set(["Active","In Maintenance","Written Off","Decommissioned"]);
const services=new Set(["Routine Service","Repair","Insurance Renewal","Warranty Claim"]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const date=/^\d{4}-\d{2}-\d{2}$/;
function err(code){const e=new Error(code);e.code=code;return e}
function str(v,max){if(typeof v!=="string"||!v.trim()||v.trim().length>max)throw err("invalid_input");return v.trim()}
function optional(v,max){return v==null||v===""?null:str(v,max)}
function money(v,max=999999999999.99){if(typeof v!=="number"||!Number.isFinite(v)||v<0||v>max||Math.abs(Math.round(v*100)-v*100)>1e-7)throw err("invalid_amount");return v}
function day(v){if(typeof v!=="string"||!date.test(v)||Number.isNaN(Date.parse(v+"T00:00:00Z"))||new Date(v+"T00:00:00Z").toISOString().slice(0,10)!==v)throw err("invalid_date");return v}
function identity(context){if(!context||!uuid.test(context.companyId||"")||!uuid.test(context.userId||""))throw err("unauthorized");return context.companyId}
function id(v){if(typeof v!=="string"||!uuid.test(v))throw err("invalid_id");return v}
function validateObject(v){if(!v||typeof v!=="object"||Array.isArray(v))throw err("invalid_input");return v}
function enumOf(v,set){if(!set.has(v))throw err("invalid_input");return v}
export function depreciationEstimate({costBwp,ratePercent,years,method="straight-line",salvageBwp=0}){
 money(costBwp);money(salvageBwp);
 if(salvageBwp>costBwp||typeof ratePercent!=="number"||!Number.isFinite(ratePercent)||ratePercent<0||ratePercent>100||typeof years!=="number"||years<0||years>100||!Number.isFinite(years))throw err("invalid_depreciation");
 if(!["straight-line","reducing-balance"].includes(method))throw err("invalid_method");
 const residual=method==="straight-line"?costBwp-(costBwp-salvageBwp)*ratePercent/100*years:costBwp*Math.pow(1-ratePercent/100,years);
 return Math.round(Math.max(salvageBwp,residual)*100)/100;
}
export function corporateAssetService(db){
 if(!db||typeof db.query!=="function")throw err("database_required");
 const query=(sql,params)=>db.query(sql,params);
 return Object.freeze({
 async createAsset(context,raw){
  const company=identity(context),v=validateObject(raw);
  const fields=[str(v.assetName,255),enumOf(v.category,categories),optional(v.serialNumber,100),str(v.branch,100),optional(v.custodian,255),day(v.acquisitionDate),money(v.acquisitionCostBwp),money(v.bookValueBwp),v.depreciationRatePercent===undefined?15:v.depreciationRatePercent];
  if(typeof fields[8]!=="number"||!Number.isFinite(fields[8])||fields[8]<0||fields[8]>100)throw err("invalid_depreciation");
  const r=await query("INSERT INTO corporate_assets(company_id,asset_name,asset_category,serial_number_or_vin,assigned_branch,custodian_employee_name,acquisition_date,acquisition_cost_bwp,current_book_value_bwp,depreciation_rate_percentage) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",[company,...fields]);return r.rows[0];
 },
 async listAssets(context,{limit=50,offset=0}={}){
  const company=identity(context);
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>100000)throw err("invalid_pagination");
  const r=await query("SELECT * FROM corporate_assets WHERE company_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3",[company,limit,offset]);return r.rows;
 },
 async getAsset(context,assetId){
  const r=await query("SELECT * FROM corporate_assets WHERE company_id=$1 AND id=$2",[identity(context),id(assetId)]);return r.rows[0]||null;
 },
 async changeStatus(context,assetId,status){
  const r=await query("UPDATE corporate_assets SET status=$3,updated_at=now() WHERE company_id=$1 AND id=$2 RETURNING *",[identity(context),id(assetId),enumOf(status,statuses)]);return r.rows[0]||null;
 },
 async recordMaintenance(context,assetId,raw){
  const company=identity(context),v=validateObject(raw),due=v.nextDueDate==null?null:day(v.nextDueDate),serviceDate=day(v.serviceDate);
  if(due&&due<serviceDate)throw err("invalid_date");
  const r=await query("INSERT INTO asset_maintenance_logs(company_id,asset_id,service_type,description,service_provider,cost_bwp,service_date,next_due_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",[company,id(assetId),enumOf(v.serviceType,services),str(v.description,5000),optional(v.provider,255),v.costBwp===undefined?0:money(v.costBwp),serviceDate,due]);return r.rows[0];
 },
 async addInsurance(context,assetId,raw){
  const company=identity(context),v=validateObject(raw),start=day(v.coverageStart),end=day(v.coverageEnd);
  if(end<start)throw err("invalid_date");
  const r=await query("INSERT INTO asset_insurance_policies(company_id,asset_id,insurer,policy_number,coverage_start,coverage_end,annual_premium_bwp) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",[company,id(assetId),str(v.insurer,255),str(v.policyNumber,120),start,end,money(v.annualPremiumBwp)]);return r.rows[0];
 },
 async dueItems(context,throughDate){
  const company=identity(context),cutoff=day(throughDate);
  const [maintenance,insurance]=await Promise.all([
   query("SELECT * FROM asset_maintenance_logs WHERE company_id=$1 AND next_due_date IS NOT NULL AND next_due_date<=$2 ORDER BY next_due_date,id",[company,cutoff]),
   query("SELECT * FROM asset_insurance_policies WHERE company_id=$1 AND coverage_end<=$2 ORDER BY coverage_end,id",[company,cutoff])
  ]);return {maintenance:maintenance.rows,insurance:insurance.rows};
 }
 });
}
