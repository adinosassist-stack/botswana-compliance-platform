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
 const repeated=await f.staff("/public/employee/tasks/"+task.body.id+"/progress","POST",{action:"submit"},signedHeaders);
 assert.equal(repeated.res.status,409);
 const otherManager=await f.manager(IDS.tenantB,"/api/employee-self-service/tasks/"+task.body.id+"/review","POST",{decision:"approve"});
 assert.equal(otherManager.res.status,404);
 const approved=await f.manager(IDS.tenantA,"/api/employee-self-service/tasks/"+task.body.id+"/review","POST",{decision:"approve",note:"Checked result"});
 assert.equal(approved.res.status,200);
 assert.equal(approved.body.task.status,"completed");
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
