import {parseReportSchedules,dueDeliveryReminders} from "./delivery-installation-reminders.js";
import {managerDailyReviewEnabled,readStaffDailyReviewNotices} from "./manager-daily-report-review.js";
import {handleEmployeeCashStaff,handleEmployeeCashManager} from "./employee-cash.js";
import {staffPortalEnabled,staffEmail,staffPasswordValid,staffUuidValid,staffTaskInput,staffTaskTransition,staffNote} from "./employee-self-service-policy.js";

// Separate staff identity. A staff cookie NEVER grants /api workspace access.
const COOKIE="__Host-thebe_staff_session";
const encoder=new TextEncoder();
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const sha256=async value=>hex(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(value))));
const cookieValue=request=>{
 const raw=String(request.headers.get("cookie")||"");
 const found=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE+"="));
 return found?found.slice(COOKIE.length+1):"";
};
const sessionCookie=(token)=>COOKIE+"="+token+"; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=43200";
const clearCookie=()=>COOKIE+"=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0";
const validEmailOrReject=body=>staffEmail(body?.email);
const dataBody=async(readJson,request,maxBytes=4096)=>{
 try{const b=await readJson(request,{maxBytes});return b&&typeof b==="object"&&!Array.isArray(b)?b:null}catch{return null}
};
async function deriveStaffPassword(password,salt,iterations){
 const key=await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveBits"]);
 return new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations},key,256));
}
async function passwordHash(password,derive){
 const salt=crypto.getRandomValues(new Uint8Array(16)),iterations=240000;
 const bits=await derive(password,salt,iterations);
 return "staff-pbkdf2$"+iterations+"$"+hex(salt)+"$"+hex(new Uint8Array(bits));
}
async function passwordMatches(password,stored,derive){
 const parts=String(stored||"").split("$");
 if(parts.length!==4||parts[0]!=="staff-pbkdf2"||Number(parts[1])!==240000||!(/^[a-f0-9]{32}$/.test(parts[2]))||!(/^[a-f0-9]{64}$/.test(parts[3])))return false;
 const salt=Uint8Array.from(parts[2].match(/../g).map(x=>parseInt(x,16)));
 const bits=hex(await derive(password,salt,240000));
 let mismatch=0;for(let i=0;i<64;i++)mismatch|=bits.charCodeAt(i)^parts[3].charCodeAt(i);
 return mismatch===0;
}
async function staffSession(request,env){
 const token=cookieValue(request);
 if(!/^[a-f0-9]{64}$/.test(token))return null;
 return env.DB.prepare("SELECT s.token_hash,s.csrf_token,a.id account_id,a.tenant_id,a.employee_id,a.email,e.full_name,t.name company_name FROM employee_portal_sessions s JOIN employee_portal_accounts a ON a.id=s.account_id AND a.status='active' JOIN employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id AND lower(trim(coalesce(e.status,'')))='active' JOIN tenants t ON t.id=a.tenant_id WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1").bind(await sha256(token)).first();
}
function isCsrfValid(request,session){
 const supplied=String(request.headers.get("x-staff-csrf")||"");
 const target=String(session?.csrf_token||"");
 if(supplied.length!==target.length||supplied.length<20)return false;
 let mismatch=0;for(let i=0;i<target.length;i++)mismatch|=supplied.charCodeAt(i)^target.charCodeAt(i);
 return mismatch===0;
}
async function changeTask({env,id,actor,kind,action,note="",taskId,employeeId}){
 const tenantId=actor.tenant_id,old=await env.DB.prepare("SELECT id,employee_id,status,version FROM employee_portal_tasks WHERE id=? AND tenant_id=? LIMIT 1").bind(taskId,tenantId).first();
 if(!old||kind==="employee"&&old.employee_id!==employeeId)return {error:"task_not_found",status:404};
 const next=staffTaskTransition(kind,old.status,action);
 if(!next)return {error:"invalid_task_transition",status:409};
 const eventId=id();
 const update=kind==="employee"?
  env.DB.prepare("UPDATE employee_portal_tasks SET status=?,version=version+1,last_transition_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND employee_id=? AND status=? AND version=? AND EXISTS(SELECT 1 FROM employees e WHERE e.id=employee_portal_tasks.employee_id AND e.tenant_id=employee_portal_tasks.tenant_id AND lower(trim(coalesce(e.status,'')))='active') RETURNING id,version,status").bind(next,eventId,taskId,tenantId,employeeId,old.status,old.version):
  env.DB.prepare("UPDATE employee_portal_tasks SET status=?,version=version+1,last_transition_id=?,reviewed_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND status=? AND version=? AND EXISTS(SELECT 1 FROM employees e WHERE e.id=employee_portal_tasks.employee_id AND e.tenant_id=employee_portal_tasks.tenant_id AND lower(trim(coalesce(e.status,'')))='active') RETURNING id,version,status").bind(next,eventId,actor.user_id,taskId,tenantId,old.status,old.version);
 const audit=env.DB.prepare("INSERT INTO employee_portal_task_events(id,task_id,tenant_id,actor_kind,actor_id,action,previous_status,next_status,note) SELECT ?,t.id,t.tenant_id,?,?,?,?,?,? FROM employee_portal_tasks t WHERE t.id=? AND t.tenant_id=? AND t.last_transition_id=? AND t.status=?")
  .bind(eventId,kind,kind==="employee"?actor.account_id:actor.user_id,action,old.status,next,note,taskId,tenantId,eventId,next);
 const changes=await env.DB.batch([update,audit]);
 const row=changes?.[0]?.results?.[0];
 if(!row||Number(changes?.[1]?.meta?.changes||0)!==1)return {error:"task_changed_retry",status:409};
 return {ok:true,task:{id:row.id,status:row.status,version:row.version},status:200};
}
export async function handleStaffPublic({request,url,env,json,readJson,requestOriginAllowed,edgeScopedRateLimit,rateLimitResponse,id,submitDailyReport,derivePassword=deriveStaffPassword}){
 if(!url.pathname.startsWith("/public/employee/"))return null;
 if(!staffPortalEnabled(env)||!env.DB)return json({error:"not_found"},404);
 if(!env.PUBLIC_RATE_LIMITER||!env.SESSION_SECRET)return json({error:"staff_security_configuration_incomplete"},503);
 if(!requestOriginAllowed(request,env))return json({error:"origin_failed"},403);
 const limit=await edgeScopedRateLimit(request,env,"staff-portal-public");
 if(!limit.ok)return rateLimitResponse(limit);
 const path=url.pathname,method=request.method;
 if(path==="/public/employee/accept"&&method==="POST"){
  const body=await dataBody(readJson,request);
  const token=String(body?.token||""),password=body?.password;
  if(!/^[a-f0-9]{64}$/.test(token)||!staffPasswordValid(password))return json({error:"invalid_invitation"},400);
  const acceptLimit=await edgeScopedRateLimit(request,env,"staff-portal-accept",token);
  if(!acceptLimit.ok)return rateLimitResponse(acceptLimit);
  const tokenHash=await sha256(token),inv=await env.DB.prepare("SELECT i.id,i.tenant_id,i.employee_id,i.email FROM employee_portal_invites i JOIN employees e ON e.id=i.employee_id AND e.tenant_id=i.tenant_id AND lower(trim(coalesce(e.status,'')))='active' WHERE i.token_hash=? AND i.status='active' AND i.expires_at>CURRENT_TIMESTAMP LIMIT 1").bind(tokenHash).first();
  if(!inv)return json({error:"invalid_or_expired_invitation"},410);
  const ph=await passwordHash(password,derivePassword),nonce=id(),accountId=id();
  const results=await env.DB.batch([
   env.DB.prepare("UPDATE employee_portal_invites SET status='used',used_at=CURRENT_TIMESTAMP,consumed_nonce=? WHERE id=? AND token_hash=? AND status='active' AND expires_at>CURRENT_TIMESTAMP AND EXISTS(SELECT 1 FROM employees e WHERE e.id=employee_portal_invites.employee_id AND e.tenant_id=employee_portal_invites.tenant_id AND lower(trim(coalesce(e.status,'')))='active') RETURNING id").bind(nonce,inv.id,tokenHash),
   env.DB.prepare("DELETE FROM employee_portal_sessions WHERE account_id IN (SELECT a.id FROM employee_portal_accounts a JOIN employee_portal_invites i ON i.tenant_id=a.tenant_id AND i.employee_id=a.employee_id WHERE i.id=? AND i.consumed_nonce=?)").bind(inv.id,nonce),
   env.DB.prepare("INSERT INTO employee_portal_accounts(id,tenant_id,employee_id,email,password_hash) SELECT ?,i.tenant_id,i.employee_id,i.email,? FROM employee_portal_invites i WHERE i.id=? AND i.consumed_nonce=? AND i.status='used' ON CONFLICT(tenant_id,employee_id) DO UPDATE SET email=excluded.email,password_hash=excluded.password_hash,status='active',updated_at=CURRENT_TIMESTAMP").bind(accountId,ph,inv.id,nonce)
  ]);
  if(!results?.[0]?.results?.length||Number(results?.[2]?.meta?.changes||0)!==1)return json({error:"invalid_or_expired_invitation"},410);
  return json({ok:true,email:inv.email,tenantId:inv.tenant_id,message:"Account ready. Sign in to view assigned work."},200);
 }
 if(path==="/public/employee/login"&&method==="POST"){
  const body=await dataBody(readJson,request),email=validEmailOrReject(body),tenantId=String(body?.tenantId||""),password=body?.password;
  if(!email||!staffUuidValid(tenantId)||!staffPasswordValid(password))return json({error:"invalid_credentials"},401);
  const loginLimit=await edgeScopedRateLimit(request,env,"staff-portal-login",email);
  if(!loginLimit.ok)return rateLimitResponse(loginLimit);
  const row=await env.DB.prepare("SELECT a.id,a.password_hash FROM employee_portal_accounts a JOIN employees e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id AND lower(trim(coalesce(e.status,'')))='active' WHERE a.tenant_id=? AND a.email=? AND a.status='active' LIMIT 1").bind(tenantId,email).first();
  if(!row||!(await passwordMatches(password,row.password_hash,derivePassword)))return json({error:"invalid_credentials"},401);
  const token=random(),csrf=random();
  await env.DB.prepare("INSERT INTO employee_portal_sessions(token_hash,account_id,csrf_token,expires_at) VALUES(?,?,?,datetime('now','+12 hours'))").bind(await sha256(token),row.id,csrf).run();
  return json({ok:true,csrfToken:csrf},200,{"set-cookie":sessionCookie(token)});
 }
 const staff=await staffSession(request,env);
 const cash=await handleEmployeeCashStaff({request,url,env,staff,json,readJson,id,isCsrfValid});
 if(cash)return cash;
 if(path==="/public/employee/me"&&method==="GET"){
  if(!staff)return json({error:"unauthenticated"},401);
  return json({employee:{id:staff.employee_id,name:staff.full_name,email:staff.email},tenantId:staff.tenant_id,companyName:staff.company_name,csrfToken:staff.csrf_token});
 }
 if(path==="/public/employee/reports"&&method==="GET"){
  if(!staff)return json({error:"unauthenticated"},401,{"cache-control":"no-store"});
  const rows=await env.DB.prepare("SELECT r.id,r.location_id,r.report_date,r.work_summary,r.wins,r.blockers,r.incidents,r.next_plan,r.kpi_json,r.needs_attention,r.revision_count,r.submitted_at,r.updated_at,l.name location_name FROM daily_employee_reports r JOIN operating_locations l ON l.id=r.location_id AND l.tenant_id=r.tenant_id WHERE r.tenant_id=? AND r.employee_id=? ORDER BY r.report_date DESC,r.updated_at DESC,r.id DESC LIMIT 30").bind(staff.tenant_id,staff.employee_id).all();
  const reportDate=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Gaborone",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const deliveryReminders=await dueDeliveryReminders(env,{tenantId:staff.tenant_id,employeeId:staff.employee_id,today:reportDate});
  const items=(rows.results||[]).map(({kpi_json,...row})=>({...row,jobs:parseReportSchedules(kpi_json)}));
  const locations=await env.DB.prepare("SELECT l.id,l.name FROM employee_reporting_access a JOIN operating_locations l ON l.id=a.location_id AND l.tenant_id=a.tenant_id WHERE a.tenant_id=? AND a.employee_id=? AND a.status='active' AND a.expires_at>CURRENT_TIMESTAMP AND l.active=1 ORDER BY l.name,l.id").bind(staff.tenant_id,staff.employee_id).all();
  const reviewNotices=managerDailyReviewEnabled(env)?await readStaffDailyReviewNotices(env.DB,staff.tenant_id,staff.employee_id):[];
  return json({items,reportDate,deliveryReminders,assignedLocations:locations.results||[],reviewNotices},200,{"cache-control":"no-store"});
 }
 if(path==="/public/employee/reports"&&method==="POST"){
  const headers={"cache-control":"no-store"};
  if(!staff)return json({error:"unauthenticated"},401,headers);
  if(!isCsrfValid(request,staff))return json({error:"csrf_failed"},403,headers);
  const body=await dataBody(readJson,request,24*1024);
  if(!body||typeof body.locationId!=="string"||!body.locationId||body.locationId.length>128||!Object.hasOwn(body,"expectedRevision")||!(body.expectedRevision===null||Number.isInteger(body.expectedRevision)&&body.expectedRevision>=0&&body.expectedRevision<=8)||typeof body.reportDate!=="string"||["tenantId","employeeId","token","kpis"].some(k=>Object.hasOwn(body,k)))return json({error:"invalid_staff_report"},400,headers);
  const access=await env.DB.prepare("SELECT a.id access_id,a.tenant_id,a.employee_id,a.location_id FROM employee_reporting_access a JOIN operating_locations l ON l.id=a.location_id AND l.tenant_id=a.tenant_id WHERE a.tenant_id=? AND a.employee_id=? AND a.location_id=? AND a.status='active' AND a.expires_at>CURRENT_TIMESTAMP AND l.active=1 LIMIT 1").bind(staff.tenant_id,staff.employee_id,body.locationId).first();
  if(!access)return json({error:"reporting_location_not_assigned"},403,headers);
  if(typeof submitDailyReport!=="function")return json({error:"staff_reporting_unavailable"},503,headers);
  return submitDailyReport(env,body,access,staff);
 }
 if(path==="/public/employee/tasks"&&method==="GET"){
  if(!staff)return json({error:"unauthenticated"},401);
  const rows=await env.DB.prepare("SELECT t.id,t.title,t.detail,t.due_date,t.priority,t.status,t.version,t.created_at,t.updated_at,n.note latest_note,n.actor_kind latest_note_actor FROM employee_portal_tasks t LEFT JOIN employee_portal_task_events n ON n.rowid=(SELECT MAX(ev.rowid) FROM employee_portal_task_events ev WHERE ev.task_id=t.id AND ev.tenant_id=t.tenant_id AND LENGTH(TRIM(ev.note))>0) WHERE t.tenant_id=? AND t.employee_id=? ORDER BY CASE t.status WHEN 'submitted' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'assigned' THEN 2 ELSE 3 END,t.due_date,t.created_at DESC LIMIT 100").bind(staff.tenant_id,staff.employee_id).all();
  const history=await env.DB.prepare("SELECT ev.task_id,ev.actor_kind,ev.action,ev.previous_status,ev.next_status,ev.note,ev.created_at FROM employee_portal_task_events ev JOIN employee_portal_tasks t ON t.id=ev.task_id AND t.tenant_id=ev.tenant_id WHERE t.tenant_id=? AND t.employee_id=? ORDER BY ev.rowid DESC LIMIT 500").bind(staff.tenant_id,staff.employee_id).all();
  return json({items:rows.results||[],history:history.results||[]},200,{"cache-control":"no-store"});
 }
 if(path==="/public/employee/logout"&&method==="POST"){
  if(!staff||!isCsrfValid(request,staff))return json({error:"unauthenticated"},401,{"set-cookie":clearCookie()});
  await env.DB.prepare("DELETE FROM employee_portal_sessions WHERE token_hash=?").bind(staff.token_hash).run();
  return json({ok:true},200,{"set-cookie":clearCookie()});
 }
 const match=path.match(/^\/public\/employee\/tasks\/([a-f0-9-]{32,36})\/progress$/i);
 if(match&&method==="POST"){
  if(!staff)return json({error:"unauthenticated"},401);
  if(!isCsrfValid(request,staff))return json({error:"csrf_failed"},403);
  const body=await dataBody(readJson,request),action=body?.action,note=staffNote(body?.note||"");
  if(!["start","submit"].includes(action)||note===null)return json({error:"invalid_task_update"},400);
  const result=await changeTask({env,id,actor:staff,kind:"employee",action,note,taskId:match[1],employeeId:staff.employee_id});
  return json(result.ok?result:{error:result.error},result.status);
 }
 return json({error:"not_found"},404);
}
export async function handleStaffManager({request,url,env,auth,json,readJson,id}){
 if(!url.pathname.startsWith("/api/employee-self-service"))return null;
 if(!staffPortalEnabled(env)||!env.DB)return json({error:"not_found"},404);
 if(!auth||!["owner","manager"].includes(auth.role))return json({error:"forbidden"},403);
 if(!env.PUBLIC_RATE_LIMITER||!env.SESSION_SECRET)return json({error:"staff_security_configuration_incomplete"},503);
 const method=request.method,path=url.pathname,tenantId=auth.tenant_id;
 const cash=await handleEmployeeCashManager({request,url,env,auth,json,readJson,id});
 if(cash)return cash;
 if(path==="/api/employee-self-service/tasks"&&method==="GET"){
  const rows=await env.DB.prepare("SELECT t.id,t.employee_id,e.full_name employee_name,t.title,t.detail,t.priority,t.status,t.due_date,t.version,t.updated_at,n.note latest_note,n.actor_kind latest_note_actor FROM employee_portal_tasks t JOIN employees e ON e.id=t.employee_id AND e.tenant_id=t.tenant_id LEFT JOIN employee_portal_task_events n ON n.rowid=(SELECT MAX(ev.rowid) FROM employee_portal_task_events ev WHERE ev.task_id=t.id AND ev.tenant_id=t.tenant_id AND LENGTH(TRIM(ev.note))>0) WHERE t.tenant_id=? ORDER BY CASE t.status WHEN 'submitted' THEN 0 ELSE 1 END,t.updated_at DESC LIMIT 100").bind(tenantId).all();
  return json({items:rows.results||[]});
 }
 if(path==="/api/employee-self-service/tasks"&&method==="POST"){
  const body=await dataBody(readJson,request),input=staffTaskInput(body);
  if(!input)return json({error:"invalid_assignment"},400);
  const taskId=id(),eventId=id();
  const results=await env.DB.batch([
   env.DB.prepare("INSERT INTO employee_portal_tasks(id,tenant_id,employee_id,title,detail,due_date,priority,assigned_by_user_id) SELECT ?,e.tenant_id,e.id,?,?,?,?,? FROM employees e WHERE e.tenant_id=? AND e.id=? AND lower(trim(coalesce(e.status,'')))='active'").bind(taskId,input.title,input.detail,input.dueDate,input.priority,auth.user_id,tenantId,input.employeeId),
   env.DB.prepare("INSERT INTO employee_portal_task_events(id,task_id,tenant_id,actor_kind,actor_id,action,next_status) SELECT ?,t.id,t.tenant_id,'manager',?,'assign','assigned' FROM employee_portal_tasks t WHERE t.id=? AND t.tenant_id=?").bind(eventId,auth.user_id,taskId,tenantId)
  ]);
  if(Number(results?.[0]?.meta?.changes||0)!==1||Number(results?.[1]?.meta?.changes||0)!==1)return json({error:"active_employee_required"},404);
  return json({ok:true,id:taskId,status:"assigned"},201);
 }
 if(path==="/api/employee-self-service/invitations"&&method==="POST"){
  const body=await dataBody(readJson,request),employeeId=String(body?.employeeId||""),email=staffEmail(body?.email);
  if(!staffUuidValid(employeeId)||!email)return json({error:"invalid_invitation"},400);
  const employee=await env.DB.prepare("SELECT id FROM employees WHERE tenant_id=? AND id=? AND lower(trim(coalesce(status,'')))='active' LIMIT 1").bind(tenantId,employeeId).first();
  if(!employee)return json({error:"active_employee_required"},404);
  const token=random(),invId=id();
  const results=await env.DB.batch([
   env.DB.prepare("UPDATE employee_portal_invites SET status='revoked' WHERE tenant_id=? AND employee_id=? AND status='active'").bind(tenantId,employeeId),
   env.DB.prepare("INSERT INTO employee_portal_invites(id,tenant_id,employee_id,email,token_hash,expires_at,issued_by_user_id) SELECT ?,e.tenant_id,e.id,?,?,datetime('now','+48 hours'),? FROM employees e WHERE e.id=? AND e.tenant_id=? AND lower(trim(coalesce(e.status,'')))='active'").bind(invId,email,await sha256(token),auth.user_id,employeeId,tenantId)
  ]);
  if(Number(results?.[1]?.meta?.changes||0)!==1)return json({error:"active_employee_required"},404);
  const link=url.origin+"/staff/?tenant="+encodeURIComponent(tenantId)+"#invite="+encodeURIComponent(token);
  return json({ok:true,expiresInHours:48,link},201);
 }
 const revoke=path.match(/^\/api\/employee-self-service\/employees\/([a-f0-9-]{32,36})\/revoke$/i);
 if(revoke&&method==="POST"){
  const employeeId=revoke[1];
  const found=await env.DB.prepare("SELECT id FROM employee_portal_accounts WHERE tenant_id=? AND employee_id=? LIMIT 1").bind(tenantId,employeeId).first();
  const rows=await env.DB.batch([
   env.DB.prepare("UPDATE employee_portal_accounts SET status='revoked',updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND employee_id=?").bind(tenantId,employeeId),
   env.DB.prepare("DELETE FROM employee_portal_sessions WHERE account_id IN (SELECT id FROM employee_portal_accounts WHERE tenant_id=? AND employee_id=?)").bind(tenantId,employeeId),
   env.DB.prepare("UPDATE employee_portal_invites SET status='revoked' WHERE tenant_id=? AND employee_id=? AND status='active'").bind(tenantId,employeeId)
  ]);
  return json({ok:true,accountRevoked:!!found,sessionsDeleted:Number(rows?.[1]?.meta?.changes||0)});
 }
 const review=path.match(/^\/api\/employee-self-service\/tasks\/([a-f0-9-]{32,36})\/review$/i);
 if(review&&method==="POST"){
  const body=await dataBody(readJson,request),decision=body?.decision,note=staffNote(body?.note||"");
  if(!["approve","return"].includes(decision)||note===null||(decision==="return"&&note.length<5))return json({error:"invalid_review"},400);
  const result=await changeTask({env,id,actor:auth,kind:"manager",action:decision,note,taskId:review[1]});
  return json(result.ok?result:{error:result.error},result.status);
 }
 return json({error:"not_found"},404);
}
