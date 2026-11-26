// Gated, tenant-scoped employee cash reporting. This module never moves funds or writes finance_transactions.
const MAX_ENTRY=10000000,MAX_COUNT=100000000;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const KEY=/^[A-Za-z0-9_-]{16,80}$/;
const CATEGORIES=new Set(["transport","materials","fuel","meals","accommodation","supplies","site","other"]);
const enabled=env=>env?.THEBE_EMPLOYEE_CASH_ENABLED==="true";
const clean=(v,max)=>typeof v==="string"&&v.trim().length<=max?v.trim():null;
const validDate=v=>{
 if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v))return null;
 const d=new Date(v+"T00:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v?v:null;
};
const amount=(v,zero=false,limit=MAX_ENTRY)=>Number.isSafeInteger(v)&&v<=limit&&(zero?v>=0:v>0)?v:null;
const reply=(json,body,status=200)=>json(body,status,{"cache-control":"no-store"});
const value=x=>Number.isSafeInteger(x)?x:0;
async function jsonBody(readJson,request){
 try{const b=await readJson(request,{maxBytes:4096});return b&&typeof b==="object"&&!Array.isArray(b)?b:null}catch{return null}
}
function entryInput(b,kind){
 const amountMinor=amount(b?.amountMinor),purpose=clean(b?.purpose,500),occurredOn=validDate(b?.occurredOn);
 const category=kind==="advance"?"advance":b?.category,requestKey=b?.requestKey;
 const receiptReference=clean(b?.receiptReference??"",160),jobReference=clean(b?.jobReference??"",120);
 if(amountMinor===null||!purpose||purpose.length<3||!occurredOn||!KEY.test(requestKey||"")||
  receiptReference===null||jobReference===null||(kind==="expense"&&!CATEGORIES.has(category)))return null;
 return {kind,amountMinor,purpose,occurredOn,category,requestKey,receiptReference,jobReference};
}
async function addEntry({env,tenantId,employeeId,actorId,actorKind,input,id}){
 const entryId=id(),eventId=id(),status=input.kind==="advance"?"approved":"submitted";
 const insert=env.DB.prepare("INSERT OR IGNORE INTO employee_cash_entries (id,tenant_id,employee_id,actor_kind,actor_id,kind,amount_minor,category,purpose,receipt_reference,job_reference,occurred_on,idempotency_key,status) SELECT ?,e.tenant_id,e.id,?,?,?,?,?,?,?,?,?,?,? FROM employees e WHERE e.tenant_id=? AND e.id=? AND lower(trim(coalesce(e.status,'')))='active'")
  .bind(entryId,actorKind,actorId,input.kind,input.amountMinor,input.category,input.purpose,input.receiptReference,input.jobReference,input.occurredOn,input.requestKey,status,tenantId,employeeId);
 const event=env.DB.prepare("INSERT INTO employee_cash_events(id,tenant_id,employee_id,entry_id,actor_kind,actor_id,action) SELECT ?,tenant_id,employee_id,id,?,?,? FROM employee_cash_entries WHERE id=? AND tenant_id=? AND employee_id=?")
  .bind(eventId,actorKind,actorId,input.kind==="advance"?"advance_recorded":"expense_submitted",entryId,tenantId,employeeId);
 const results=await env.DB.batch([insert,event]);
 const prior=await env.DB.prepare("SELECT id,actor_kind,actor_id,kind,amount_minor,category,purpose,receipt_reference,job_reference,occurred_on,status FROM employee_cash_entries WHERE tenant_id=? AND employee_id=? AND idempotency_key=? LIMIT 1")
  .bind(tenantId,employeeId,input.requestKey).first();
 if(!prior)return {status:404,error:"active_employee_required"};
 if(prior.actor_kind!==actorKind||prior.actor_id!==actorId||prior.kind!==input.kind||
  prior.amount_minor!==input.amountMinor||prior.category!==input.category||prior.purpose!==input.purpose||
  prior.receipt_reference!==input.receiptReference||prior.job_reference!==input.jobReference||prior.occurred_on!==input.occurredOn)
  return {status:409,error:"request_key_conflict"};
 const fresh=Number(results?.[0]?.meta?.changes||0)===1;
 if(fresh&&Number(results?.[1]?.meta?.changes||0)!==1)throw Error("cash_audit_failed");
 return {status:fresh?201:200,body:{ok:true,id:prior.id,status:prior.status,replayed:!fresh,postedToFinance:false}};
}
async function listEmployee(env,tenantId,employeeId){
 const [entries,counts,total]=await Promise.all([
  env.DB.prepare("SELECT id,kind,amount_minor,category,purpose,receipt_reference,job_reference,occurred_on,status,review_note,created_at FROM employee_cash_entries WHERE tenant_id=? AND employee_id=? ORDER BY occurred_on DESC,created_at DESC,id DESC LIMIT 100").bind(tenantId,employeeId).all(),
  env.DB.prepare("SELECT id,report_date,counted_minor,status,review_note,created_at FROM employee_cash_counts WHERE tenant_id=? AND employee_id=? ORDER BY report_date DESC LIMIT 20").bind(tenantId,employeeId).all(),
  env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN kind='advance' AND status='approved' THEN amount_minor ELSE 0 END),0) advances,COALESCE(SUM(CASE WHEN kind='expense' THEN amount_minor ELSE 0 END),0) spent,COALESCE(SUM(CASE WHEN kind='expense' AND status='submitted' THEN amount_minor ELSE 0 END),0) pending,COALESCE(SUM(CASE WHEN kind='expense' AND status='rejected' THEN amount_minor ELSE 0 END),0) rejected FROM employee_cash_entries WHERE tenant_id=? AND employee_id=?").bind(tenantId,employeeId).first()
 ]);
 const latest=(counts.results||[])[0]||null;
 let varianceMinor=null;
 if(latest){
  const at=await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN kind='advance' AND status='approved' THEN amount_minor ELSE 0 END),0) advances,COALESCE(SUM(CASE WHEN kind='expense' THEN amount_minor ELSE 0 END),0) spent FROM employee_cash_entries WHERE tenant_id=? AND employee_id=? AND occurred_on<=?")
    .bind(tenantId,employeeId,latest.report_date).first();
  varianceMinor=value(latest.counted_minor)-(value(at?.advances)-value(at?.spent));
 }
 return {items:entries.results||[],counts:counts.results||[],summary:{
  advancesMinor:value(total?.advances),reportedSpentMinor:value(total?.spent),pendingReviewMinor:value(total?.pending),rejectedReviewMinor:value(total?.rejected),
  expectedMinor:value(total?.advances)-value(total?.spent),
  lastCountDate:latest?.report_date??null,lastCountedMinor:latest?.counted_minor??null,
  varianceAtLastCountMinor:varianceMinor,financePosted:false,accountingBalanceVerified:false
 }};
}
async function addCount({env,staff,b,id}){
 const countedMinor=amount(b?.countedMinor,true,MAX_COUNT),reportDate=validDate(b?.reportDate),note=clean(b?.note??"",500);
 if(countedMinor===null||!reportDate||note===null)return {status:400,error:"invalid_cash_count"};
 const countId=id(),eventId=id();
 const results=await env.DB.batch([
  env.DB.prepare("INSERT OR IGNORE INTO employee_cash_counts(id,tenant_id,employee_id,report_date,counted_minor,note) VALUES(?,?,?,?,?,?)")
   .bind(countId,staff.tenant_id,staff.employee_id,reportDate,countedMinor,note),
  env.DB.prepare("INSERT INTO employee_cash_events(id,tenant_id,employee_id,count_id,actor_kind,actor_id,action) SELECT ?,tenant_id,employee_id,id,'employee',?,'count_submitted' FROM employee_cash_counts WHERE id=? AND tenant_id=? AND employee_id=?")
   .bind(eventId,staff.account_id,countId,staff.tenant_id,staff.employee_id)
 ]);
 const prior=await env.DB.prepare("SELECT id,counted_minor,note,status FROM employee_cash_counts WHERE tenant_id=? AND employee_id=? AND report_date=? LIMIT 1")
  .bind(staff.tenant_id,staff.employee_id,reportDate).first();
 if(!prior)return {status:503,error:"cash_count_unavailable"};
 if(prior.counted_minor!==countedMinor||prior.note!==note)return {status:409,error:"cash_count_already_submitted"};
 const fresh=Number(results?.[0]?.meta?.changes||0)===1;
 if(fresh&&Number(results?.[1]?.meta?.changes||0)!==1)throw Error("cash_audit_failed");
 return {status:fresh?201:200,body:{ok:true,id:prior.id,status:prior.status,replayed:!fresh}};
}
async function review({env,auth,id,which,recordId,b}){
 const decision=b?.decision,note=clean(b?.note??"",500);
 const allowed=which==="entry"?["approve","reject"]:["approve","flag"];
 if(!allowed.includes(decision)||note===null||(decision!=="approve"&&note.length<5))return {status:400,error:"invalid_cash_review"};
 const table=which==="entry"?"employee_cash_entries":"employee_cash_counts";
 const next=decision==="approve"?"approved":decision==="reject"?"rejected":"flagged";
 const eventId=id(),condition=which==="entry"?" AND kind='expense'":"";
 const update=env.DB.prepare("UPDATE "+table+" SET status=?,reviewed_by_user_id=?,review_note=?,reviewed_at=CURRENT_TIMESTAMP,last_review_event_id=? WHERE id=? AND tenant_id=? AND status='submitted'"+condition+" RETURNING id,employee_id,status")
  .bind(next,auth.user_id,note,eventId,recordId,auth.tenant_id);
 const fk=which==="entry"?"entry_id":"count_id";
 const action=(which==="entry"?"expense_":"count_")+(decision==="approve"?"approved":decision==="reject"?"rejected":"flagged");
 const event=env.DB.prepare("INSERT INTO employee_cash_events(id,tenant_id,employee_id,"+fk+",actor_kind,actor_id,action) SELECT ?,tenant_id,employee_id,id,'manager',?,? FROM "+table+" WHERE id=? AND tenant_id=? AND last_review_event_id=?")
  .bind(eventId,auth.user_id,action,recordId,auth.tenant_id,eventId);
 const results=await env.DB.batch([update,event]);
 if(Number(results?.[0]?.meta?.changes||0)!==1)return {status:409,error:"cash_review_unavailable_or_already_reviewed"};
 if(Number(results?.[1]?.meta?.changes||0)!==1)throw Error("cash_audit_failed");
 return {status:200,body:{ok:true,id:recordId,status:next,postedToFinance:false}};
}
async function guarded(json,fn){try{return await fn()}catch{return reply(json,{error:"cash_storage_unavailable"},503)}}
export async function handleEmployeeCashStaff({request,url,env,staff,json,readJson,id,isCsrfValid}){
 if(!url.pathname.startsWith("/public/employee/cash"))return null;
 if(!enabled(env))return reply(json,{error:"not_found"},404);
 if(!staff)return reply(json,{error:"unauthenticated"},401);
 const path=url.pathname;
 return guarded(json,async()=>{
  if(path==="/public/employee/cash"&&request.method==="GET")
   return reply(json,await listEmployee(env,staff.tenant_id,staff.employee_id));
  if(request.method!=="POST")return reply(json,{error:"method_not_allowed"},405);
  if(!isCsrfValid(request,staff))return reply(json,{error:"csrf_failed"},403);
  const b=await jsonBody(readJson,request);
  if(path==="/public/employee/cash/expenses"){
   const input=entryInput(b,"expense");if(!input)return reply(json,{error:"invalid_cash_expense"},400);
   const r=await addEntry({env,tenantId:staff.tenant_id,employeeId:staff.employee_id,actorId:staff.account_id,actorKind:"employee",input,id});
   return reply(json,r.body||{error:r.error},r.status);
  }
  if(path==="/public/employee/cash/counts"){
   const r=await addCount({env,staff,b,id});return reply(json,r.body||{error:r.error},r.status);
  }
  return reply(json,{error:"not_found"},404);
 });
}
export async function handleEmployeeCashManager({request,url,env,auth,json,readJson,id}){
 if(!url.pathname.startsWith("/api/employee-self-service/cash"))return null;
 if(!enabled(env))return reply(json,{error:"not_found"},404);
 if(!auth||!["owner","manager"].includes(auth.role)||!auth.tenant_id||!auth.user_id)
  return reply(json,{error:"forbidden"},403);
 const path=url.pathname;
 return guarded(json,async()=>{
  if(path==="/api/employee-self-service/cash"&&request.method==="GET"){
   const [entries,counts,balances]=await Promise.all([
    env.DB.prepare("SELECT c.id,c.employee_id,e.full_name employee_name,c.kind,c.amount_minor,c.category,c.purpose,c.receipt_reference,c.job_reference,c.occurred_on,c.status,c.review_note,c.created_at FROM employee_cash_entries c JOIN employees e ON e.id=c.employee_id AND e.tenant_id=c.tenant_id WHERE c.tenant_id=? ORDER BY c.created_at DESC,c.id DESC LIMIT 150").bind(auth.tenant_id).all(),
    env.DB.prepare("SELECT c.id,c.employee_id,e.full_name employee_name,c.report_date,c.counted_minor,c.status,c.review_note,c.created_at FROM employee_cash_counts c JOIN employees e ON e.id=c.employee_id AND e.tenant_id=c.tenant_id WHERE c.tenant_id=? ORDER BY c.report_date DESC,c.created_at DESC LIMIT 100").bind(auth.tenant_id).all()
,
    env.DB.prepare("SELECT e.id employee_id,e.full_name employee_name,COALESCE(SUM(CASE WHEN c.kind='advance' AND c.status='approved' THEN c.amount_minor ELSE 0 END),0) advances_minor,COALESCE(SUM(CASE WHEN c.kind='expense' THEN c.amount_minor ELSE 0 END),0) spent_minor,COALESCE(SUM(CASE WHEN c.kind='expense' AND c.status='submitted' THEN c.amount_minor ELSE 0 END),0) pending_minor,COALESCE(SUM(CASE WHEN c.kind='expense' AND c.status='rejected' THEN c.amount_minor ELSE 0 END),0) rejected_minor,(SELECT cc.report_date FROM employee_cash_counts cc WHERE cc.tenant_id=e.tenant_id AND cc.employee_id=e.id ORDER BY cc.report_date DESC LIMIT 1) last_count_date,(SELECT cc.counted_minor FROM employee_cash_counts cc WHERE cc.tenant_id=e.tenant_id AND cc.employee_id=e.id ORDER BY cc.report_date DESC LIMIT 1) last_counted_minor FROM employees e LEFT JOIN employee_cash_entries c ON c.tenant_id=e.tenant_id AND c.employee_id=e.id WHERE e.tenant_id=? AND (lower(trim(coalesce(e.status,'')))='active' OR c.id IS NOT NULL) GROUP BY e.id,e.full_name ORDER BY e.full_name ASC,e.id ASC LIMIT 200").bind(auth.tenant_id).all()
   ]);
   return reply(json,{entries:entries.results||[],counts:counts.results||[],balances:(balances.results||[]).map(row=>({...row,expected_minor:value(row.advances_minor)-value(row.spent_minor)})),financePosted:false});
  }
  if(request.method!=="POST")return reply(json,{error:"method_not_allowed"},405);
  const b=await jsonBody(readJson,request);
  if(path==="/api/employee-self-service/cash/advances"){
   if(!UUID.test(b?.employeeId||""))return reply(json,{error:"invalid_employee_id"},400);
   const input=entryInput(b,"advance");if(!input)return reply(json,{error:"invalid_cash_advance"},400);
   const r=await addEntry({env,tenantId:auth.tenant_id,employeeId:b.employeeId,actorId:auth.user_id,actorKind:"manager",input,id});
   return reply(json,r.body||{error:r.error},r.status);
  }
  const match=path.match(/^\/api\/employee-self-service\/cash\/(entries|counts)\/([a-f0-9-]{36})\/review$/i);
  if(match&&UUID.test(match[2])){
   const r=await review({env,auth,id,which:match[1]==="entries"?"entry":"count",recordId:match[2],b});
   return reply(json,r.body||{error:r.error},r.status);
  }
  return reply(json,{error:"not_found"},404);
 });
}
