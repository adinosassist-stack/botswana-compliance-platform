import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {handleStaffManager,handleStaffPublic} from "../cloudflare/src/employee-self-service.js";

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
 sql.exec("CREATE TABLE employees(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),full_name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active');");
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
  env,json,readJson,id:randomUUID,
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
