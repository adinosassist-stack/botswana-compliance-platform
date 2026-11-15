// Delivery / installation dates recorded on private daily reports.
// No separate bearer privileges, external push, or employee-wide data access.
const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/;
const JOB_TYPES=new Set(["delivery","installation"]);
const JOB_STATUSES=new Set(["scheduled","completed","cancelled"]);

export function validDate(value){
  if(typeof value!=="string"||!ISO_DATE.test(value))return false;
  const instant=new Date(value+"T00:00:00Z");
  return Number.isFinite(instant.getTime())&&instant.toISOString().slice(0,10)===value;
}
export function daysUntilDelivery(target,today){
  if(!validDate(target)||!validDate(today))return null;
  return Math.round((Date.parse(target+"T00:00:00Z")-Date.parse(today+"T00:00:00Z"))/86400000);
}
export function scheduleFieldsFromInput(input){
  const source=input&&typeof input==="object"&&!Array.isArray(input)?input:{};
  const jobReference=String(source.jobReference||"").trim();
  const jobType=String(source.jobType||"").trim().toLowerCase();
  const scheduledDate=String(source.scheduledDate||"").trim();
  const jobStatus=String(source.jobStatus||"scheduled").trim().toLowerCase();
  const supplied=Boolean(jobReference||jobType||scheduledDate||source.jobStatus);
  if(!supplied)return {fields:{}};
  if(!jobReference||jobReference.length>80||!/^[\p{L}\p{N}][\p{L}\p{N}._\-/ ]*$/u.test(jobReference))
    return {error:"invalid_delivery_job_reference"};
  if(!JOB_TYPES.has(jobType))return {error:"delivery_or_installation_type_required"};
  if(!validDate(scheduledDate))return {error:"valid_delivery_installation_date_required"};
  if(!JOB_STATUSES.has(jobStatus))return {error:"invalid_delivery_installation_status"};
  return {fields:{jobReference,jobType,scheduledDate,jobStatus}};
}
export function parseReportSchedule(value){
  let kpis=value;
  if(typeof value==="string"){try{kpis=JSON.parse(value)}catch{return null}}
  const checked=scheduleFieldsFromInput(kpis);
  return checked.error||!checked.fields?.scheduledDate?null:checked.fields;
}
export function dueRemindersFromRows(rows,today){
  if(!validDate(today))return [];
  const mostRecent=new Map();
  for(const r of rows||[]){
    const job=parseReportSchedule(r.kpi_json);
    if(!job)continue;
    const key=[r.employee_id,r.location_id,job.jobType,job.jobReference.toLocaleLowerCase("en")].join("|");
    if(mostRecent.has(key))continue;
    mostRecent.set(key,{...job,employeeId:r.employee_id,employeeName:r.full_name||"",locationId:r.location_id,locationName:r.location_name||"",sourceReportId:r.id});
  }
  const items=[];
  for(const job of mostRecent.values()){
    if(job.jobStatus!=="scheduled")continue;
    const daysUntil=daysUntilDelivery(job.scheduledDate,today);
    if(daysUntil===null||daysUntil>4||daysUntil<0)continue;
    items.push({...job,daysUntil,urgency:daysUntil===0?"due_today":daysUntil===1?"tomorrow":"upcoming"});
  }
  return items.sort((a,b)=>a.daysUntil-b.daysUntil||a.scheduledDate.localeCompare(b.scheduledDate)||a.jobReference.localeCompare(b.jobReference)).slice(0,100);
}
export async function dueDeliveryReminders(env,{tenantId,employeeId=null,locationId=null,today}){
  if(!tenantId||!validDate(today))return [];
  // Most recent report per job wins; completed/cancelled jobs suppress older scheduled copies.
  // Tenant + employee/location filters apply inside SQL BEFORE any private rows are read.
  const rows=await env.DB.prepare(`SELECT r.id,r.employee_id,r.location_id,r.report_date,r.updated_at,r.kpi_json,
      e.full_name,l.name AS location_name
    FROM daily_employee_reports r
    JOIN employees e ON e.id=r.employee_id AND e.tenant_id=r.tenant_id
    JOIN operating_locations l ON l.id=r.location_id AND l.tenant_id=r.tenant_id
    WHERE r.tenant_id=? AND r.report_date>=date(?,'-365 days') AND r.report_date<=?
      AND (? IS NULL OR r.employee_id=?) AND (? IS NULL OR r.location_id=?)
      AND lower(trim(coalesce(e.status,'')))='active' AND l.active=1
      AND r.kpi_json LIKE '%"jobReference"%'
    ORDER BY r.report_date DESC,r.updated_at DESC,r.id DESC LIMIT 3000`)
    .bind(tenantId,today,today,employeeId,employeeId,locationId,locationId).all();
  return dueRemindersFromRows(rows.results||[],today);
}
