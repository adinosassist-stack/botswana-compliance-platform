// Delivery / installation dates recorded on private daily reports.
// Reporter, tenant and location scope must always be checked by the calling API.
const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/;
const JOB_TYPES=new Set(["delivery","installation"]);
const JOB_STATUSES=new Set(["scheduled","completed","cancelled"]);
export const MAX_REPORT_JOBS=8;
export const MAX_OVERDUE_DAYS=7;

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

// Backward compatible: old reports store one flat job; new reports may store
// up to eight independently tracked jobs inside kpis.jobs, with no DB migration.
export function scheduleEntriesFromInput(input){
  const source=input&&typeof input==="object"&&!Array.isArray(input)?input:{};
  if(!Object.prototype.hasOwnProperty.call(source,"jobs")){
    const checked=scheduleFieldsFromInput(source);
    return checked.error?checked:{fields:checked.fields,entries:checked.fields.scheduledDate?[checked.fields]:[]};
  }
  if(source.jobReference||source.jobType||source.scheduledDate||source.jobStatus)return {error:"conflicting_delivery_job_formats"};
  if(!Array.isArray(source.jobs)||source.jobs.length>MAX_REPORT_JOBS)return {error:"invalid_delivery_jobs"};
  const entries=[],seen=new Set();
  for(const job of source.jobs){
    if(!job||typeof job!=="object"||Array.isArray(job))return {error:"invalid_delivery_jobs"};
    const checked=scheduleFieldsFromInput(job);
    if(checked.error)return checked;
    if(!checked.fields.scheduledDate)return {error:"incomplete_delivery_job"};
    const key=[checked.fields.jobType,checked.fields.jobReference.toLocaleLowerCase("en")].join("|");
    if(seen.has(key))return {error:"duplicate_delivery_job"};
    seen.add(key);
    entries.push(checked.fields);
  }
  return {fields:entries.length===0?{}:entries.length===1?entries[0]:{jobs:entries},entries};
}
export function parseReportSchedules(value){
  let kpis=value;
  if(typeof value==="string"){try{kpis=JSON.parse(value)}catch{return []}}
  const checked=scheduleEntriesFromInput(kpis);
  return checked.error?[]:checked.entries;
}
// Maintained for earlier callers.
export function parseReportSchedule(value){return parseReportSchedules(value)[0]||null}
export function dueRemindersFromRows(rows,today){
  if(!validDate(today))return [];
  const mostRecent=new Map();
  // Caller must supply newest report rows first so status updates supersede old jobs.
  for(const r of rows||[]){
    for(const job of parseReportSchedules(r.kpi_json)){
      const key=[r.employee_id,r.location_id,job.jobType,job.jobReference.toLocaleLowerCase("en")].join("|");
      if(mostRecent.has(key))continue;
      mostRecent.set(key,{...job,employeeId:r.employee_id,employeeName:r.full_name||"",locationId:r.location_id,locationName:r.location_name||"",sourceReportId:r.id});
    }
  }
  const items=[];
  for(const job of mostRecent.values()){
    if(job.jobStatus!=="scheduled")continue;
    const daysUntil=daysUntilDelivery(job.scheduledDate,today);
    if(daysUntil===null||daysUntil>4||daysUntil< -MAX_OVERDUE_DAYS)continue;
    items.push({...job,daysUntil,urgency:daysUntil<0?"overdue":daysUntil===0?"due_today":daysUntil===1?"tomorrow":"upcoming"});
  }
  // Overdue first, then due today and the next four days.
  return items.sort((a,b)=>a.daysUntil-b.daysUntil||a.scheduledDate.localeCompare(b.scheduledDate)||a.jobReference.localeCompare(b.jobReference)).slice(0,100);
}
export async function dueDeliveryReminders(env,{tenantId,employeeId=null,locationId=null,today}){
  if(!tenantId||!validDate(today))return [];
  // Tenant + employee/location filters apply inside SQL BEFORE private rows are read.
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
