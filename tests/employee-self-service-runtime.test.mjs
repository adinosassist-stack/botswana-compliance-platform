import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {handleStaffManager,handleStaffPublic} from "../cloudflare/src/employee-self-service.js";
import {__v782157Test} from "../cloudflare/src/worker.js";
import {createManagerScopedReadHttp} from "../cloudflare/src/manager-invitations-scoped-read.js";

// Execute the actual Cloudflare D1 SQL against an isolated in-memory SQLite database.
// No deployment, remote credentials or live employee data are involved.
const IDS={
 tenantA:"11111111-1111-4111-8111-111111111111",
 tenantB:"22222222-2222-4222-8222-222222222222",
 managerA:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
 managerB:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
 employeeA:"aaaaaaaa-1111-4111-8111-111111111111",
 employeeB:"bbbbbbbb-2222-4222-8222-222222222222",
 employeeC:"cccccccc-3333-4333-8333-333333333333"
};
function fixture(t){
 const sql=new DatabaseSync(":memory:");
 sql.exec("PRAGMA foreign_keys=ON;");
 sql.exec("CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT NOT NULL);");
 sql.exec("CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT NOT NULL);");
 sql.exec("CREATE TABLE employees(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),full_name TEXT NOT NULL,role_title TEXT,status TEXT NOT NULL DEFAULT 'active');");
 sql.exec(readFileSync(new URL("../cloudflare/migrations/20261108_employee_self_service.sql",import.meta.url),"utf8"));
 sql.prepare("INSERT INTO tenants(id,name) VALUES(?,?)").run(IDS.tenantA,"Synthetic A");
 sql.prepare("INSERT INTO tenants(id,name) VALUES(?,?)").run(IDS.tenantB,"Synthetic B");
 sql.prepare("INSERT INTO users(id,email) VALUES(?,?)").run(IDS.managerA,"mgr-a@example.invalid");
 sql.prepare("INSERT INTO users(id,email) VALUES(?,?)").run(IDS.managerB,"mgr-b@example.invalid");
 for(const [id,tenantId,name] of [
  [IDS.employeeA,IDS.tenantA,"Synthetic Alice"],
  [IDS.employeeB,IDS.tenantB,"Synthetic Bob"],
  [IDS.employeeC,IDS.tenantA,"Synthetic Casey"]]){
  sql.prepare("INSERT INTO employees(id,tenant_id,full_name) VALUES(?,?,?)").run(id,tenantId,name);
 }
 const statement=query=>({
  bind(...args){
   const bound=sql.prepare(query);
   return {
    async first(){return bound.get(...args)||null},
    async all(){return {results:bound.all(...args)}},
    async run(){
     if(/^\s*SELECT\b/i.test(query))return {results:bound.all(...args),meta:{changes:0}};
     if(/\bRETURNING\b/i.test(query)){
      const rows=bound.all(...args);
      return {results:rows,meta:{changes:rows.length}};
     }
     const result=bound.run(...args);
     return {results:[],meta:{changes:Number(result.changes)}};
    }
   };
  }
 });
 const DB={
  prepare:statement,
  async batch(stmts){
   sql.exec("BEGIN");
   try{
    const results=[];
    for(const stmt of stmts)results.push(await stmt.run());
    sql.exec("COMMIT");
    return results;
   }catch(e){
    sql.exec("ROLLBACK");
    throw e;
   }
  }
 };
 const env={THEBE_STAFF_PORTAL_ENABLED:"true",SESSION_SECRET:"test-secret-not-a-production-key",PUBLIC_RATE_LIMITER:{},DB};
 t.after(()=>sql.close());
 const json=(object,status=200,headers={})=>new Response(JSON.stringify(object),{status,headers:{"content-type":"application/json",...headers}});
 const readJson=async req=>req.json();
 const options={
  env,json,readJson,id:randomUUID,submitDailyReport:__v782157Test.submitDailyEmployeeReport,
  requestOriginAllowed:()=>true,
  edgeScopedRateLimit:async()=>({ok:true}),
  rateLimitResponse:()=>json({error:"rate_limit"},429)
 };
 function request(path,method="GET",payload,headers={}){
  const url=new URL(path,"https://employee.example.invalid");
  return {url,request:new Request(url,{method,headers:{"content-type":"application/json",...headers},...(payload!==undefined?{body:JSON.stringify(payload)}:{})})};
 }
 async function manager(tenantId,path,method="GET",body,role="manager"){
  const args=request(path,method,body);
  const auth={tenant_id:tenantId,user_id:tenantId===IDS.tenantA?IDS.managerA:IDS.managerB,role};
  const res=await handleStaffManager({...options,...args,auth});
  return {res,body:await res.json()};
 }
 async function staff(path,method="GET",body,headers={}){
  const args=request(path,method,body,headers);
  const res=await handleStaffPublic({...options,...args});
  return {res,body:await res.json()};
 }
 return {sql,env,DB,manager,staff};
}
const password="UniqueTemporaryPassword#123";
async function inviteAndLogin(f,employeeId=IDS.employeeA,tenant=IDS.tenantA,email="alice@example.invalid"){
 const issued=await f.manager(tenant,"/api/employee-self-service/invitations","POST",{employeeId,email});
 assert.equal(issued.res.status,201);
 const token=new URL(issued.body.link).hash.slice("#invite=".length);
 assert.match(token,/^[a-f0-9]{64}$/);
 const accepted=await f.staff("/public/employee/accept","POST",{token,password});
 assert.equal(accepted.res.status,200);
 assert.equal((await f.staff("/public/employee/accept","POST",{token,password})).res.status,410,"invite cannot be reused");
 const signed=await f.staff("/public/employee/login","POST",{email,password,tenantId:tenant});
 assert.equal(signed.res.status,200);
 const rawCookie=signed.res.headers.get("set-cookie")||"";
 assert.match(rawCookie,/HttpOnly; SameSite=Strict; Max-Age=43200/);
 const cookie=rawCookie.split(";")[0];
 return {cookie,csrf:signed.body.csrfToken,token};
}
test("isolated D1 schema creates tenant-scoped tables with working foreign keys",t=>{
 const f=fixture(t);
 for(const name of ["employee_portal_accounts","employee_portal_invites","employee_portal_sessions","employee_portal_tasks","employee_portal_task_events"]){
  assert.equal(f.sql.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name=?").get(name).n,1);
  assert.ok(f.sql.prepare("PRAGMA foreign_key_list("+name+")").all().length>0,name);
 }
 assert.equal(f.sql.prepare("PRAGMA foreign_keys").get().foreign_keys,1);
});
test("employee invitation, login and task lifecycle run on real SQLite D1",async t=>{
 const f=fixture(t);
 const {cookie,csrf}=await inviteAndLogin(f);
 const signedHeaders={cookie,"x-staff-csrf":csrf};
 const me=await f.staff("/public/employee/me","GET",undefined,{cookie});
 assert.equal(me.res.status,200);
 assert.equal(me.body.employee.name,"Synthetic Alice");
 assert.equal(me.body.companyName,"Synthetic A");
 const task=await f.manager(IDS.tenantA,"/api/employee-self-service/tasks","POST",{
  employeeId:IDS.employeeA,title:"Install headstone at site",detail:"Check design and photograph finished work",priority:2,dueDate:"2026-11-18"
 });
 assert.equal(task.res.status,201);
 const otherTask=await f.manager(IDS.tenantA,"/api/employee-self-service/tasks","POST",{
  employeeId:IDS.employeeC,title:"Prepare customer quote"
 });
 assert.equal(otherTask.res.status,201);
 const tasks=await f.staff("/public/employee/tasks","GET",undefined,{cookie});
 assert.equal(tasks.res.status,200);
 assert.equal(tasks.body.items.length,1);
 assert.equal(tasks.body.items[0].id,task.body.id);
 const deniedOther=await f.staff("/public/employee/tasks/"+otherTask.body.id+"/progress","POST",{action:"start"},signedHeaders);
 assert.equal(deniedOther.res.status,404);
 const deniedNoCsrf=await f.staff("/public/employee/tasks/"+task.body.id+"/progress","POST",{action:"start"},{cookie});
 assert.equal(deniedNoCsrf.res.status,403);
 const started=await f.staff("/public/employee/tasks/"+task.body.id+"/progress","POST",{action:"start",note:"At customer location"},signedHeaders);
 assert.equal(started.res.status,200);
 assert.equal(started.body.task.status,"in_progress");
 const cannotApprove=await f.manager(IDS.tenantA,"/api/employee-self-service/tasks/"+task.body.id+"/review","POST",{decision:"approve"});
 assert.equal(cannotApprove.res.status,409);
 const submitted=await f.staff("/public/employee/tasks/"+task.body.id+"/progress","POST",{action:"submit",note:"Installed and checked"},signedHeaders);
 assert.equal(submitted.res.status,200);
 const managerHandover=await f.manager(IDS.tenantA,"/api/employee-self-service/tasks");
 const managerTask=managerHandover.body.items.find(x=>x.id===task.body.id);
 assert.equal(managerTask.latest_note,"Installed and checked");
 assert.equal(managerTask.latest_note_actor,"employee");
 const repeated=await f.staff("/public/employee/tasks/"+task.body.id+"/progress","POST",{action:"submit"},signedHeaders);
 assert.equal(repeated.res.status,409);
 const otherManager=await f.manager(IDS.tenantB,"/api/employee-self-service/tasks/"+task.body.id+"/review","POST",{decision:"approve"});
 assert.equal(otherManager.res.status,404);
 const approved=await f.manager(IDS.tenantA,"/api/employee-self-service/tasks/"+task.body.id+"/review","POST",{decision:"approve",note:"Checked result"});
 assert.equal(approved.res.status,200);
 assert.equal(approved.body.task.status,"completed");
 const reviewedStaffTasks=await f.staff("/public/employee/tasks","GET",undefined,{cookie});
 const reviewedTask=reviewedStaffTasks.body.items.find(x=>x.id===task.body.id);
 assert.equal(reviewedTask.latest_note,"Checked result");
 assert.equal(reviewedTask.latest_note_actor,"manager");
 assert.deepEqual(reviewedStaffTasks.body.history.map(x=>x.action),["approve","submit","start","assign"]);
 assert.ok(reviewedStaffTasks.body.history.every(x=>x.task_id===task.body.id));
 assert.equal(reviewedStaffTasks.body.history[0].note,"Checked result");
 assert.ok(reviewedStaffTasks.body.history.every(x=>!Object.hasOwn(x,"actor_id")));
 const events=f.sql.prepare("SELECT action,actor_kind,previous_status,next_status FROM employee_portal_task_events WHERE task_id=? ORDER BY created_at,id").all(task.body.id);
 assert.equal(events.length,4);
 assert.deepEqual(new Set(events.map(x=>x.action)),new Set(["assign","start","submit","approve"]));
 const alreadyComplete=await f.staff("/public/employee/tasks/"+task.body.id+"/progress","POST",{action:"start"},signedHeaders);
 assert.equal(alreadyComplete.res.status,409);
});
test("manager may return submitted work; staff cannot read or mutate cross-tenant tasks",async t=>{
 const f=fixture(t);const {cookie,csrf}=await inviteAndLogin(f);
 const {body:assigned,res}=await f.manager(IDS.tenantB,"/api/employee-self-service/tasks","POST",{employeeId:IDS.employeeB,title:"Prepare inventory"});
 assert.equal(res.status,201);
 const staffHeaders={cookie,"x-staff-csrf":csrf};
 assert.equal((await f.staff("/public/employee/tasks/"+assigned.id+"/progress","POST",{action:"start"},staffHeaders)).res.status,404);
 const own=await f.manager(IDS.tenantA,"/api/employee-self-service/tasks","POST",{employeeId:IDS.employeeA,title:"Check photos"});
 assert.equal(own.res.status,201);
 assert.equal((await f.staff("/public/employee/tasks/"+own.body.id+"/progress","POST",{action:"start"},staffHeaders)).res.status,200);
 assert.equal((await f.staff("/public/employee/tasks/"+own.body.id+"/progress","POST",{action:"submit"},staffHeaders)).res.status,200);
 const returned=await f.manager(IDS.tenantA,"/api/employee-self-service/tasks/"+own.body.id+"/review","POST",{decision:"return",note:"More photographs needed"});
 assert.equal(returned.res.status,200);
 assert.equal(returned.body.task.status,"in_progress");
 const returnedList=await f.staff("/public/employee/tasks","GET",undefined,{cookie});
 assert.equal(returnedList.body.items.find(x=>x.id===own.body.id).latest_note,"More photographs needed");
 assert.equal(returnedList.body.items.find(x=>x.id===own.body.id).latest_note_actor,"manager");
 assert.equal((await f.manager(IDS.tenantA,"/api/employee-self-service/tasks/"+own.body.id+"/review","POST",{decision:"return",note:"Try again"})).res.status,409);
});
test("revoking account and disabling employee immediately invalidates private tasks",async t=>{
 const f=fixture(t);const {cookie}=await inviteAndLogin(f);
 assert.equal((await f.staff("/public/employee/me","GET",undefined,{cookie})).res.status,200);
 const revoked=await f.manager(IDS.tenantA,"/api/employee-self-service/employees/"+IDS.employeeA+"/revoke","POST",{});
 assert.equal(revoked.res.status,200);
 assert.equal(revoked.body.accountRevoked,true);
 assert.ok(revoked.body.sessionsDeleted>=1);
 assert.equal((await f.staff("/public/employee/me","GET",undefined,{cookie})).res.status,401);
 assert.equal((await f.staff("/public/employee/login","POST",{tenantId:IDS.tenantA,email:"alice@example.invalid",password})).res.status,401);
 f.sql.prepare("UPDATE employees SET status='inactive' WHERE id=?").run(IDS.employeeA);
 assert.equal((await f.manager(IDS.tenantA,"/api/employee-self-service/invitations","POST",{employeeId:IDS.employeeA,email:"new-alice@example.invalid"})).res.status,404);
});
test("feature flag prevents any account or employee access when turned off",async t=>{
 const f=fixture(t);await inviteAndLogin(f);
 f.env.THEBE_STAFF_PORTAL_ENABLED="false";
 assert.equal((await f.staff("/public/employee/me")).res.status,404);
 assert.equal((await f.manager(IDS.tenantA,"/api/employee-self-service/tasks")).res.status,404);
});
test("failed task audit insert rolls back state change and keeps version",async t=>{
 const f=fixture(t);const {cookie,csrf}=await inviteAndLogin(f);
 const made=await f.manager(IDS.tenantA,"/api/employee-self-service/tasks","POST",{employeeId:IDS.employeeA,title:"Audit rollback"});
 assert.equal(made.res.status,201);
 f.sql.exec("CREATE TRIGGER deny_event BEFORE INSERT ON employee_portal_task_events WHEN NEW.action='start' BEGIN SELECT RAISE(ABORT,'synthetic_event_failed'); END");
 await assert.rejects(f.staff("/public/employee/tasks/"+made.body.id+"/progress","POST",{action:"start"},{cookie,"x-staff-csrf":csrf}),/synthetic_event_failed/);
 const row=f.sql.prepare("SELECT status,version FROM employee_portal_tasks WHERE id=?").get(made.body.id);
 assert.equal(row.status,"assigned");
 assert.equal(row.version,0);
});


test("synthetic staging: expired, forged and revoked staff sessions never authorize access",async t=>{
 const f=fixture(t);
 const {cookie,csrf}=await inviteAndLogin(f);
 assert.equal((await f.staff("/public/employee/me","GET",undefined,{cookie})).res.status,200);
 const forged="__Host-thebe_staff_session="+"0".repeat(64);
 assert.equal((await f.staff("/public/employee/me","GET",undefined,{cookie:forged})).res.status,401);
 assert.equal((await f.staff("/public/employee/me","GET",undefined,{cookie:"__Host-thebe_staff_session=not-a-real-token"})).res.status,401);
 assert.equal((await f.staff("/public/employee/tasks","GET",undefined,{cookie:forged})).res.status,401);
 f.sql.exec("UPDATE employee_portal_sessions SET expires_at=datetime('now','-1 second')");
 assert.equal((await f.staff("/public/employee/me","GET",undefined,{cookie})).res.status,401);
 assert.equal((await f.staff("/public/employee/tasks","GET",undefined,{cookie})).res.status,401);
 const task=await f.manager(IDS.tenantA,"/api/employee-self-service/tasks","POST",{employeeId:IDS.employeeA,title:"Expired session denial"});
 assert.equal(task.res.status,201);
 assert.equal((await f.staff("/public/employee/tasks/"+task.body.id+"/progress","POST",{action:"start"},{cookie,"x-staff-csrf":csrf})).res.status,401);
 const state=f.sql.prepare("SELECT status,version FROM employee_portal_tasks WHERE id=?").get(task.body.id);
 assert.equal(state.status,"assigned");
 assert.equal(state.version,0);
});
test("synthetic staging: logout requires valid CSRF and destroys the server-side session",async t=>{
 const f=fixture(t);
 const {cookie,csrf}=await inviteAndLogin(f);
 const denial=await f.staff("/public/employee/logout","POST",{}, {cookie,"x-staff-csrf":"f".repeat(64)});
 assert.equal(denial.res.status,401);
 assert.match(denial.res.headers.get("set-cookie")||"",/Max-Age=0/);
 assert.equal((await f.staff("/public/employee/me","GET",undefined,{cookie})).res.status,200,"bad logout does not delete server session");
 const loggedOut=await f.staff("/public/employee/logout","POST",{}, {cookie,"x-staff-csrf":csrf});
 assert.equal(loggedOut.res.status,200);
 assert.match(loggedOut.res.headers.get("set-cookie")||"",/Secure; HttpOnly; SameSite=Strict; Max-Age=0/);
 assert.equal((await f.staff("/public/employee/me","GET",undefined,{cookie})).res.status,401);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM employee_portal_sessions").get().n,0);
});
test("synthetic staging: reissued staff invitation rotates password and invalidates old sessions",async t=>{
 const f=fixture(t);
 const previous=await inviteAndLogin(f);
 const fresh=await f.manager(IDS.tenantA,"/api/employee-self-service/invitations","POST",{employeeId:IDS.employeeA,email:"alice@example.invalid"});
 assert.equal(fresh.res.status,201);
 const newToken=new URL(fresh.body.link).hash.slice("#invite=".length);
 assert.match(newToken,/^[a-f0-9]{64}$/);
 assert.notEqual(newToken,previous.token);
 const newPassword="AnotherTemporaryPassword#456";
 const accepted=await f.staff("/public/employee/accept","POST",{token:newToken,password:newPassword});
 assert.equal(accepted.res.status,200);
 assert.equal((await f.staff("/public/employee/accept","POST",{token:newToken,password:newPassword})).res.status,410);
 assert.equal((await f.staff("/public/employee/me","GET",undefined,{cookie:previous.cookie})).res.status,401);
 assert.equal((await f.staff("/public/employee/login","POST",{email:"alice@example.invalid",tenantId:IDS.tenantA,password})).res.status,401);
 const login=await f.staff("/public/employee/login","POST",{email:"alice@example.invalid",tenantId:IDS.tenantA,password:newPassword});
 assert.equal(login.res.status,200);
 assert.match(login.res.headers.get("set-cookie")||"",/^__Host-thebe_staff_session=[0-9a-f]{64}; Path=\/; Secure; HttpOnly; SameSite=Strict;/);
 const stored=f.sql.prepare("SELECT password_hash FROM employee_portal_accounts WHERE tenant_id=? AND employee_id=?").get(IDS.tenantA,IDS.employeeA);
 assert.match(stored.password_hash,/^staff-pbkdf2\$240000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
 assert.equal(stored.password_hash.includes(newPassword),false);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM employee_portal_sessions").get().n,1);
});
test("synthetic staging: cross-tenant assignments, invites and sign-in never cross boundary",async t=>{
 const f=fixture(t);
 const issued=await f.manager(IDS.tenantA,"/api/employee-self-service/invitations","POST",{employeeId:IDS.employeeB,email:"bob@example.invalid"});
 assert.equal(issued.res.status,404);
 const assignment=await f.manager(IDS.tenantA,"/api/employee-self-service/tasks","POST",{employeeId:IDS.employeeB,title:"Cross-tenant denial"});
 assert.equal(assignment.res.status,404);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM employee_portal_invites").get().n,0);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM employee_portal_tasks").get().n,0);
 const {cookie}=await inviteAndLogin(f);
 assert.equal((await f.staff("/public/employee/login","POST",{email:"alice@example.invalid",password,tenantId:IDS.tenantB})).res.status,401);
 assert.equal((await f.staff("/public/employee/me","GET",undefined,{cookie})).res.status,200);
 assert.equal((await f.manager(IDS.tenantA,"/api/employee-self-service/tasks","GET",undefined,"auditor")).res.status,403);
});
test("synthetic staging: origin and edge rate-limit denials happen before any database access",async()=>{
 const url=new URL("https://staff-only.invalid/public/employee/login");
 const request=new Request(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:"alice@example.invalid",tenantId:IDS.tenantA,password})});
 const env={THEBE_STAFF_PORTAL_ENABLED:"true",SESSION_SECRET:"staging-only-fake-value",PUBLIC_RATE_LIMITER:{},DB:{prepare(){throw Error("database must not be reached")}}};
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}});
 const common={request,url,env,json,readJson:async req=>req.json(),id:randomUUID,rateLimitResponse:()=>json({error:"too_many_requests"},429)};
 const badOrigin=await handleStaffPublic({...common,requestOriginAllowed:()=>false,edgeScopedRateLimit:async()=>{throw Error("rate limiter should not be called")}});
 assert.equal(badOrigin.status,403);
 const blocked=await handleStaffPublic({...common,requestOriginAllowed:()=>true,edgeScopedRateLimit:async()=>({ok:false})});
 assert.equal(blocked.status,429);
 assert.equal((await blocked.json()).error,"too_many_requests");
});

test("staff daily report history is own-only and unauthorized report writes are denied",async t=>{
 const f=fixture(t);
 f.sql.exec(readFileSync(new URL("../cloudflare/migrations/015_v73_daily_operations_reporting.sql",import.meta.url),"utf8"));
 const {cookie}=await inviteAndLogin(f);
 for(const [location,tenant] of [["branch-a",IDS.tenantA],["branch-b",IDS.tenantB]])f.sql.prepare("INSERT INTO operating_locations(id,tenant_id,name) VALUES(?,?,?)").run(location,tenant,location);
 for(const [rid,tenant,employee,location,summary] of [["own",IDS.tenantA,IDS.employeeA,"branch-a","Installed monument"],["peer",IDS.tenantA,IDS.employeeC,"branch-a","Private peer report"],["foreign",IDS.tenantB,IDS.employeeB,"branch-b","Private tenant report"],["bad-location",IDS.tenantA,IDS.employeeA,"branch-b","Invalid branch association"]]){
  f.sql.prepare("INSERT INTO daily_employee_reports(id,tenant_id,employee_id,location_id,report_date,work_summary) VALUES(?,?,?,?,?,?)").run(rid,tenant,employee,location,"2026-11-26",summary);
 }
 const result=await f.staff("/public/employee/reports?employeeId="+IDS.employeeC,"GET",undefined,{cookie});
 assert.equal(result.res.status,200);
 assert.deepEqual(result.body.items.map(x=>x.id),["own"]);
 assert.equal(result.body.items[0].work_summary,"Installed monument");
 assert.equal(result.res.headers.get("cache-control"),"no-store");
 assert.equal((await f.staff("/public/employee/reports")).res.status,401);
 assert.equal((await f.staff("/public/employee/reports","POST",{workSummary:"Forged"},{cookie})).res.status,403);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM daily_employee_reports").get().n,4);
 await f.manager(IDS.tenantA,"/api/employee-self-service/employees/"+IDS.employeeA+"/revoke","POST",{});
 assert.equal((await f.staff("/public/employee/reports","GET",undefined,{cookie})).res.status,401);
});

test("staff reminders enforce D-4 through D+7, tenant scope and latest job status",async t=>{
 const f=fixture(t);
 f.sql.exec(readFileSync(new URL("../cloudflare/migrations/015_v73_daily_operations_reporting.sql",import.meta.url),"utf8"));
 const {cookie}=await inviteAndLogin(f);
 const today=new Date().toLocaleDateString("en-CA",{timeZone:"Africa/Gaborone"});
 const after=n=>{const d=new Date(today+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 f.sql.prepare("INSERT INTO operating_locations(id,tenant_id,name) VALUES('branch-a',?,'Branch A')").run(IDS.tenantA);
 f.sql.prepare("INSERT INTO operating_locations(id,tenant_id,name) VALUES('branch-b',?,'Branch B')").run(IDS.tenantB);
 const jobs=[
  {jobReference:"INSTALL-4",jobType:"installation",scheduledDate:after(4),jobStatus:"scheduled"},
  {jobReference:"DELIVER-TODAY",jobType:"delivery",scheduledDate:today,jobStatus:"scheduled"},
  {jobReference:"TOO-EARLY",jobType:"delivery",scheduledDate:after(5),jobStatus:"scheduled"},
  {jobReference:"FINISHED",jobType:"installation",scheduledDate:today,jobStatus:"completed"},
  {jobReference:"CANCELLED",jobType:"delivery",scheduledDate:today,jobStatus:"cancelled"},
  {jobReference:"OVERDUE-7",jobType:"installation",scheduledDate:after(-7),jobStatus:"scheduled"},
  {jobReference:"OVERDUE-1",jobType:"delivery",scheduledDate:after(-1),jobStatus:"scheduled"},
  {jobReference:"TOO-OLD",jobType:"delivery",scheduledDate:after(-8),jobStatus:"scheduled"}
 ];
 for(const [id,tenant,employee,location,items] of [["own",IDS.tenantA,IDS.employeeA,"branch-a",jobs],["peer",IDS.tenantA,IDS.employeeC,"branch-a",[{...jobs[0],jobReference:"PRIVATE-PEER"}]],["foreign",IDS.tenantB,IDS.employeeB,"branch-b",[{...jobs[0],jobReference:"PRIVATE-TENANT"}]]]){
  f.sql.prepare("INSERT INTO daily_employee_reports(id,tenant_id,employee_id,location_id,report_date,kpi_json) VALUES(?,?,?,?,?,?)").run(id,tenant,employee,location,today,JSON.stringify({jobs:items}));
 }
 // Earlier reports must not resurrect completed or cancelled jobs.
 f.sql.prepare("INSERT INTO daily_employee_reports(id,tenant_id,employee_id,location_id,report_date,kpi_json) VALUES(?,?,?,?,?,?)").run("own-previous",IDS.tenantA,IDS.employeeA,"branch-a",after(-1),JSON.stringify({jobs:[{...jobs[3],jobStatus:"scheduled"},{...jobs[4],jobStatus:"scheduled"}]}));
 const result=await f.staff("/public/employee/reports","GET",undefined,{cookie});
 assert.equal(result.res.status,200);
 assert.equal(result.body.reportDate,today);
 assert.deepEqual(result.body.deliveryReminders.map(x=>x.jobReference),["OVERDUE-7","OVERDUE-1","DELIVER-TODAY","INSTALL-4"]);
 assert.deepEqual(result.body.deliveryReminders.map(x=>x.daysUntil),[-7,-1,0,4]);
 assert.deepEqual(result.body.deliveryReminders.map(x=>x.urgency),["overdue","overdue","due_today","upcoming"]);
 assert.equal(result.body.items[0].jobs.length,8);
 assert.equal(result.body.items[1].jobs.length,2);
 f.sql.prepare("UPDATE operating_locations SET active=0 WHERE id='branch-a'").run();
 const disabled=await f.staff("/public/employee/reports","GET",undefined,{cookie});
 assert.deepEqual(disabled.body.deliveryReminders,[]);
});

test("direct staff daily reports create and correct canonical records with branch/session/revision controls",async t=>{
 const f=fixture(t);
 f.sql.exec(readFileSync(new URL("../cloudflare/migrations/015_v73_daily_operations_reporting.sql",import.meta.url),"utf8"));
 f.sql.exec(readFileSync(new URL("../cloudflare/migrations/040_v78_authorization_reporting_concurrency.sql",import.meta.url),"utf8"));
 f.sql.exec(`CREATE TABLE subscriptions(tenant_id TEXT,plan TEXT,status TEXT);
 CREATE TABLE entitlement_overrides(tenant_id TEXT,feature_key TEXT,enabled INTEGER,limit_value INTEGER,expires_at TEXT);
 CREATE TABLE plan_entitlements(plan TEXT,feature_key TEXT,enabled INTEGER,limit_value INTEGER);
 CREATE TABLE audit_chain_state(tenant_id TEXT PRIMARY KEY,last_event_id TEXT,last_hash TEXT,event_count INTEGER,updated_at TEXT);
 CREATE TABLE audit_events(tenant_id TEXT,actor_user_id TEXT,event_type TEXT,entity_type TEXT,entity_id TEXT,event_data TEXT,occurred_at TEXT,tenant_seq INTEGER,prev_hash TEXT,event_hash TEXT,integrity_version INTEGER,write_source TEXT,UNIQUE(tenant_id,tenant_seq));
 INSERT INTO plan_entitlements VALUES('starter','operating_locations',1,NULL);`);
 f.env.AUDIT_INTEGRITY_SECRET="isolated-synthetic-audit-key";
 const {cookie,csrf}=await inviteAndLogin(f);
 const headers={cookie,"x-staff-csrf":csrf};
 const today=new Date().toLocaleDateString("en-CA",{timeZone:"Africa/Gaborone"});
 const previous=new Date(today+"T00:00:00Z");previous.setUTCDate(previous.getUTCDate()-1);
 const yesterday=previous.toISOString().slice(0,10);
 for(const [loc,tenant] of [["assigned",IDS.tenantA],["peer",IDS.tenantA],["foreign",IDS.tenantB]])f.sql.prepare("INSERT INTO operating_locations(id,tenant_id,name) VALUES(?,?,?)").run(loc,tenant,loc);
 for(const [access,tenant,employee,loc] of [["own",IDS.tenantA,IDS.employeeA,"assigned"],["peer",IDS.tenantA,IDS.employeeC,"peer"],["foreign",IDS.tenantB,IDS.employeeB,"foreign"]])f.sql.prepare("INSERT INTO employee_reporting_access(id,tenant_id,employee_id,location_id,token_hash,expires_at) VALUES(?,?,?,?,?,datetime('now','+365 days'))").run(access,tenant,employee,loc,"hash-"+access);
 const get=await f.staff("/public/employee/reports","GET",undefined,{cookie});
 assert.deepEqual(get.body.assignedLocations.map(x=>x.id),["assigned"]);
 const input={locationId:"assigned",reportDate:today,expectedRevision:null,workSummary:"Delivery complete"};
 const submit=(body,h=headers)=>f.staff("/public/employee/reports","POST",body,h);
 assert.equal((await submit(input,{})).res.status,401);
 assert.equal((await submit(input,{cookie})).res.status,403);
 assert.equal((await submit({...input,employeeId:IDS.employeeC})).res.status,400);
 assert.equal((await submit({...input,locationId:"peer"})).res.status,403);
 assert.equal((await submit({...input,locationId:"foreign"})).res.status,403);
 const created=await submit(input);assert.equal(created.res.status,201);
 assert.equal((await submit(input)).body.idempotent,true);
 const nextDay=await submit({...input,reportDate:yesterday});assert.equal(nextDay.res.status,201);
 assert.notEqual(created.body.reportId,nextDay.body.reportId);
 // Existing job data must survive text-only staff corrections.
 const jobs=JSON.stringify({jobReference:"JOB-1",jobType:"delivery",scheduledDate:today,jobStatus:"completed",revenueBwp:1250});
 f.sql.prepare("UPDATE daily_employee_reports SET kpi_json=? WHERE id=?").run(jobs,created.body.reportId);
 assert.equal((await submit({...input,workSummary:"Stale text"})).res.status,409);
 const corrected=await submit({...input,expectedRevision:0,workSummary:"Delivery signed off"});
 assert.equal(corrected.res.status,200);assert.equal(corrected.body.revision,1);
 const row=f.sql.prepare("SELECT work_summary,kpi_json,revision_count FROM daily_employee_reports WHERE id=?").get(created.body.reportId);
 assert.equal(row.work_summary,"Delivery signed off");assert.equal(JSON.parse(row.kpi_json).jobReference,"JOB-1");assert.equal(JSON.parse(row.kpi_json).revenueBwp,1250);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM daily_report_revisions WHERE report_id=?").get(created.body.reportId).n,1);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM daily_employee_reports").get().n,2);
 assert.equal(f.sql.prepare("SELECT count(*) n FROM audit_events WHERE tenant_id=?").get(IDS.tenantA).n,3);
 // Both reporting surfaces must read the canonical employee report rather than a copy.
 const owner=await __v782157Test.dailyOpsDashboard(f.env,IDS.tenantA,today);
 assert.equal(owner.reportingPopulation.expected,2);
 assert.equal(owner.reportingPopulation.expectedSubmitted,1);
 assert.equal(owner.coverage,50);
 assert.equal(owner.totals.revenue,1250);
 const assigned=owner.branches.find(x=>x.locationId==="assigned"),peer=owner.branches.find(x=>x.locationId==="peer");
 assert.equal(assigned.expected,1);assert.equal(assigned.submittedExpected,1);assert.equal(assigned.coverage,100);
 assert.equal(peer.expected,1);assert.equal(peer.submitted,0);
 assert.equal(owner.missing[0].employeeId,IDS.employeeC);
 assert.equal(owner.reports[0].work_summary,"Delivery signed off");
 const filtered=await __v782157Test.dailyOpsDashboard(f.env,IDS.tenantA,today,"assigned");
 assert.equal(filtered.coverage,100);assert.equal(filtered.branches.length,1);assert.equal(filtered.reports[0].id,created.body.reportId);
 const otherDate=await __v782157Test.dailyOpsDashboard(f.env,IDS.tenantA,yesterday,"assigned");
 assert.equal(otherDate.reports[0].id,nextDay.body.reportId);
 // Deliberately malformed association must not expose another tenant's name or count.
 f.sql.prepare("INSERT INTO daily_employee_reports(id,tenant_id,employee_id,location_id,report_date,work_summary) VALUES(?,?,?,?,?,?)").run("bad-tenant-link",IDS.tenantA,IDS.employeeB,"foreign",today,"Foreign private text");
 const hardened=await __v782157Test.dailyOpsDashboard(f.env,IDS.tenantA,today);
 assert.equal(hardened.reports.length,1);
 assert.equal(hardened.totals.revenue,1250);
 // A missing employee with an approved exception is excused, not overdue.
 f.sql.prepare("INSERT INTO daily_reporting_exceptions(id,tenant_id,employee_id,location_id,report_date,reason_code) VALUES(?,?,?,?,?,'leave')").run("excused",IDS.tenantA,IDS.employeeC,"peer",today);
 const excused=await __v782157Test.dailyOpsDashboard(f.env,IDS.tenantA,today);
 assert.equal(excused.reportingPopulation.expected,1);assert.equal(excused.reportingPopulation.excused,1);assert.equal(excused.missing.length,0);assert.equal(excused.coverage,100);
 // Seed real peer and foreign reports before checking manager authorization.
 for(const [rid,tenant,employee,loc] of [["peer-report",IDS.tenantA,IDS.employeeC,"peer"],["foreign-report",IDS.tenantB,IDS.employeeB,"foreign"]])f.sql.prepare("INSERT INTO daily_employee_reports(id,tenant_id,employee_id,location_id,report_date,work_summary) VALUES(?,?,?,?,?,?)").run(rid,tenant,employee,loc,today,"Not visible to assigned manager");
 // Branch-scoped manager read service uses a separate membership/grant boundary.
 f.sql.exec("CREATE TABLE memberships(tenant_id TEXT,user_id TEXT,role TEXT,status TEXT); CREATE TABLE workspace_manager_invites(tenant_id TEXT,accepted_by_user_id TEXT,status TEXT); CREATE TABLE workspace_manager_location_grants(tenant_id TEXT,manager_user_id TEXT,location_id TEXT,status TEXT);");
 f.sql.prepare("INSERT INTO memberships VALUES(?,?,'manager','active')").run(IDS.tenantA,IDS.managerA);
 f.sql.prepare("INSERT INTO workspace_manager_invites VALUES(?,?,'accepted')").run(IDS.tenantA,IDS.managerA);
 f.sql.prepare("INSERT INTO workspace_manager_location_grants VALUES(?,?,?,'active')").run(IDS.tenantA,IDS.managerA,"assigned");
 const scoped=createManagerScopedReadHttp({db:f.DB}),identity={role:"manager",tenantId:IDS.tenantA,userId:IDS.managerA};
 const managerRead=async path=>{const response=await scoped(new Request("https://example.invalid"+path),identity);assert.equal(response.status,200);return response.json()};
 const managerReports=await managerRead("/api/workspace/managers/my-reports");
 assert.equal(managerReports.reports.length,2);assert.ok(managerReports.reports.every(r=>r.location_id==="assigned"));
 assert.ok(managerReports.reports.some(r=>r.id===created.body.reportId&&r.work_summary==="Delivery signed off"));
 const managerDashboard=await managerRead("/api/workspace/managers/my-dashboard");
 assert.equal(managerDashboard.reports,2);assert.deepEqual(managerDashboard.locations.map(l=>l.id),["assigned"]);
 f.sql.prepare("UPDATE workspace_manager_location_grants SET status='revoked'").run();
 assert.deepEqual((await managerRead("/api/workspace/managers/my-reports")).reports,[]);
 f.sql.prepare("UPDATE employee_reporting_access SET status='revoked' WHERE id='own'").run();
 assert.equal((await submit({...input,expectedRevision:1,workSummary:"Denied"})).res.status,403);
 await f.manager(IDS.tenantA,"/api/employee-self-service/employees/"+IDS.employeeA+"/revoke","POST",{});
 assert.equal((await submit(input)).res.status,401);
});
