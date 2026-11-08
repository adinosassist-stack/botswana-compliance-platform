// Inert employee portal staging Worker. Not a live employee authentication service.
// Separate deployment protection and isolated full-schema acceptance are required.
const STAGING_DATABASE_ID="adfa3871-5ecf-4672-8d2f-be9b142d5fc1";
const STAGING_NAME="employee-self-service-isolated";
const STATUS_PATH="/api/employee-self-service-staging/status";
const SHA=/^[a-f0-9]{40}$/;
const safe=(body,status)=>Response.json(body,{status,headers:{"cache-control":"no-store","x-robots-tag":"noindex, nofollow","x-content-type-options":"nosniff","x-thebe-employee-staging":"inert"}});
export function createEmployeeSelfServiceStagingEntry(){
 return {async fetch(request,env){
  const source=String(env?.STAFF_STAGING_SOURCE_SHA||"");
  if(env?.APP_ENV!=="staging"||env?.DEPLOYMENT_PROFILE!==STAGING_NAME||
     env?.THEBE_STAFF_PORTAL_ENABLED!=="false"||env?.STAFF_STAGING_WRITES_ENABLED!=="false"||
     env?.REGISTRATION_MODE!=="hold"||env?.PAYMENT_PROVIDER!=="none"||
     env?.STAFF_STAGING_D1_ID!==STAGING_DATABASE_ID||!SHA.test(source)||!env?.DB?.prepare)
   return safe({error:"employee_staging_configuration_unqualified"},503);
  const url=new URL(request.url);
  if(request.method!=="GET"||url.pathname!==STATUS_PATH||url.search)
   return safe({error:"employee_staging_route_disabled"},403);
  try{
   const marker=await env.DB.prepare("SELECT database_id,environment FROM employee_self_service_staging_identity WHERE id=1").first();
   if(marker?.database_id!==STAGING_DATABASE_ID||marker?.environment!==STAGING_NAME)
    throw Error("isolated_identity_unqualified");
   const tables=await env.DB.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('employee_portal_accounts','employee_portal_invites','employee_portal_sessions','employee_portal_tasks','employee_portal_task_events')").first();
   if(Number(tables?.n)!==5)throw Error("employee_schema_unqualified");
  }catch{return safe({error:"employee_staging_database_unqualified"},503)}
  return safe({mode:STAGING_NAME,d1SchemaQualified:true,employeeLoginsEnabled:false,employeeWritesEnabled:false,customerActivation:false,sourceSha:source},200);
 }};
}
export default createEmployeeSelfServiceStagingEntry();
