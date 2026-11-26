import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {handleEmployeeCashStaff,handleEmployeeCashManager} from "../cloudflare/src/employee-cash.js";

const A="11111111-1111-4111-8111-111111111111",B="22222222-2222-4222-8222-222222222222";
const EM_A="aaaaaaaa-1111-4111-8111-111111111111",EM_B="bbbbbbbb-2222-4222-8222-222222222222";
const M_A="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",M_B="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const day="2026-11-18";
function fixture(t){
 const sql=new DatabaseSync(":memory:");
 sql.exec("PRAGMA foreign_keys=ON");
 sql.exec("CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT);CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT);CREATE TABLE employees(id TEXT PRIMARY KEY,tenant_id TEXT REFERENCES tenants(id),status TEXT NOT NULL DEFAULT 'active',full_name TEXT NOT NULL)");
 sql.exec(readFileSync(new URL("../cloudflare/migrations/20261118_employee_cash_reports.sql",import.meta.url),"utf8"));
 for(const [table,rows] of [["tenants",[[A,"Tenant A"],[B,"Tenant B"]]],["users",[[M_A,"owner-a@example.invalid"],[M_B,"owner-b@example.invalid"]]]]){
  const query=table==="tenants"?"INSERT INTO tenants(id,name) VALUES(?,?)":"INSERT INTO users(id,email) VALUES(?,?)";
  for(const row of rows)sql.prepare(query).run(...row);
 }
 sql.prepare("INSERT INTO employees(id,tenant_id,status,full_name) VALUES(?,?,'active',?)").run(EM_A,A,"Alice");
 sql.prepare("INSERT INTO employees(id,tenant_id,status,full_name) VALUES(?,?,'active',?)").run(EM_B,B,"Bob");
 const DB={
  prepare(statement){
   return {bind(...args){
    const bound=sql.prepare(statement);
    return {
     async first(){return bound.get(...args)||null},
     async all(){return {results:bound.all(...args)}},
     async run(){
      if(/\bRETURNING\b/i.test(statement)){
       const rows=bound.all(...args);
       return {results:rows,meta:{changes:rows.length}};
      }
      const out=bound.run(...args);
      return {results:[],meta:{changes:Number(out.changes)}};
     }
    };
   }};
  },
  async batch(statements){
   sql.exec("BEGIN");
   try{const results=[];for(const s of statements)results.push(await s.run());sql.exec("COMMIT");return results}
   catch(error){sql.exec("ROLLBACK");throw error}
  }
 };
 t.after(()=>sql.close());
 const env={DB,THEBE_EMPLOYEE_CASH_ENABLED:"true"};
 const json=(data,status=200,headers={})=>Response.json(data,{status,headers});
 const readJson=async request=>request.json();
 const base={env,json,readJson,id:randomUUID};
 const alice={tenant_id:A,employee_id:EM_A,account_id:"staff-alice",csrf_token:"staff-secret"};
 const bob={tenant_id:B,employee_id:EM_B,account_id:"staff-bob",csrf_token:"staff-secret-b"};
 const isCsrfValid=(req,session)=>req.headers.get("x-staff-csrf")===session.csrf_token;
 async function staff(path,method="GET",body,principal=alice,csrf=true){
  const url=new URL(path,"https://thebedesk.example.invalid");
  const request=new Request(url,{method,headers:{"content-type":"application/json",...(csrf?{"x-staff-csrf":principal.csrf_token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const res=await handleEmployeeCashStaff({...base,request,url,staff:principal,isCsrfValid});
  return {status:res.status,body:await res.json()};
 }
 async function manager(path,method="GET",body,tenant=A,role="manager"){
  const url=new URL(path,"https://thebedesk.example.invalid");
  const request=new Request(url,{method,headers:{"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const auth={tenant_id:tenant,user_id:tenant===A?M_A:M_B,role};
  const res=await handleEmployeeCashManager({...base,request,url,auth});
  return {status:res.status,body:await res.json()};
 }
 return {sql,env,staff,manager};
}
function advance(employeeId=EM_A,amountMinor=200000,requestKey="cashadvance-request-001"){
 return {employeeId,amountMinor,purpose:"Opening branch cash advance",occurredOn:day,requestKey};
}
function expense(amountMinor=85000,requestKey="employee-expense-001"){
 return {amountMinor,purpose:"Installation materials and crew transport",category:"materials",
  receiptReference:"INV-123",jobReference:"ST-55",occurredOn:day,requestKey};
}
test("feature flag stays off by default and rejects untrusted actors without touching storage",async t=>{
 const f=fixture(t);
 delete f.env.THEBE_EMPLOYEE_CASH_ENABLED;
 assert.equal((await f.staff("/public/employee/cash")).status,404);
 assert.equal((await f.manager("/api/employee-self-service/cash")).status,404);
 f.env.THEBE_EMPLOYEE_CASH_ENABLED="true";
 assert.equal((await f.manager("/api/employee-self-service/cash","GET",undefined,A,"auditor")).status,403);
});
test("manager advance, employee expense, cash count, balance and review use real isolated SQLite",async t=>{
 const f=fixture(t);
 const opened=await f.manager("/api/employee-self-service/cash/advances","POST",advance());
 assert.equal(opened.status,201,JSON.stringify(opened.body));
 assert.equal(opened.body.postedToFinance,false);
 const spent=await f.staff("/public/employee/cash/expenses","POST",expense());
 assert.equal(spent.status,201,JSON.stringify(spent.body));
 const summary=await f.staff("/public/employee/cash");
 assert.equal(summary.status,200);
 assert.deepEqual([summary.body.summary.advancesMinor,summary.body.summary.reportedSpentMinor,
  summary.body.summary.expectedMinor,summary.body.summary.pendingReviewMinor],[200000,85000,115000,85000]);
 assert.equal(summary.body.items.length,2);
 const managerBalances=await f.manager("/api/employee-self-service/cash");
 assert.equal(managerBalances.status,200);
 assert.equal(managerBalances.body.balances.length,1);
 assert.equal(managerBalances.body.balances[0].employee_id,EM_A);
 assert.equal(managerBalances.body.balances[0].expected_minor,115000);
 assert.equal(managerBalances.body.balances[0].pending_minor,85000);
 assert.equal(managerBalances.body.summary,undefined);
 assert.equal(summary.body.summary.accountingBalanceVerified,false);
 const count=await f.staff("/public/employee/cash/counts","POST",{countedMinor:115000,reportDate:day,note:"Checked with supervisor"});
 assert.equal(count.status,201,JSON.stringify(count.body));
 const counted=await f.staff("/public/employee/cash");
 assert.equal(counted.body.summary.varianceAtLastCountMinor,0);
 const review=await f.manager("/api/employee-self-service/cash/entries/"+spent.body.id+"/review","POST",{decision:"approve",note:"Receipt reviewed"});
 assert.equal(review.status,200,JSON.stringify(review.body));
 assert.equal((await f.manager("/api/employee-self-service/cash/entries/"+spent.body.id+"/review","POST",{decision:"approve"})).status,409);
 const approved=await f.manager("/api/employee-self-service/cash/counts/"+count.body.id+"/review","POST",{decision:"approve"});
 assert.equal(approved.status,200);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM employee_cash_events").get().n,5);
});
test("idempotent retry is not a second expense and altered key payload is rejected",async t=>{
 const f=fixture(t);
 const a=await f.manager("/api/employee-self-service/cash/advances","POST",advance());
 const repeat=await f.manager("/api/employee-self-service/cash/advances","POST",advance());
 assert.equal(a.status,201);assert.equal(repeat.status,200);assert.equal(repeat.body.replayed,true);
 assert.equal((await f.manager("/api/employee-self-service/cash/advances","POST",advance(EM_A,300000))).status,409);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM employee_cash_entries").get().n,1);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM employee_cash_events").get().n,1);
});
test("cross-tenant employee selection and review are denied",async t=>{
 const f=fixture(t);
 assert.equal((await f.manager("/api/employee-self-service/cash/advances","POST",advance(EM_B))).status,404);
 const issued=await f.manager("/api/employee-self-service/cash/advances","POST",advance());
 assert.equal(issued.status,201);
 const expenseCreated=await f.staff("/public/employee/cash/expenses","POST",expense());
 assert.equal((await f.manager("/api/employee-self-service/cash/entries/"+expenseCreated.body.id+"/review","POST",{decision:"approve"},B)).status,409);
 const other=await f.staff("/public/employee/cash", "GET",undefined,{tenant_id:B,employee_id:EM_B,account_id:"staff-bob",csrf_token:"bob"});
 assert.equal(other.body.items.length,0);
 assert.equal(other.body.summary.expectedMinor,0);
 const otherTenantManager=await f.manager("/api/employee-self-service/cash","GET",undefined,B);
 assert.equal(otherTenantManager.body.balances.length,1);
 assert.equal(otherTenantManager.body.balances[0].employee_id,EM_B);
 assert.equal(otherTenantManager.body.balances[0].expected_minor,0);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM employee_cash_entries WHERE tenant_id=?").get(B).n,0);
});
test("CSRF, amount validation, calendar validation and duplicate cash counts fail closed",async t=>{
 const f=fixture(t);
 assert.equal((await f.staff("/public/employee/cash/expenses","POST",expense(),undefined,false)).status,403);
 for(const n of [0,-100,1.25,10000001,Number.NaN]){
  assert.equal((await f.staff("/public/employee/cash/expenses","POST",expense(n,"invalid-"+String(n).replace(".","_")+"-request-000"))).status,400);
 }
 assert.equal((await f.staff("/public/employee/cash/expenses","POST",{...expense(),occurredOn:"2026-02-30"})).status,400);
 const first=await f.staff("/public/employee/cash/counts","POST",{countedMinor:500,reportDate:day,note:""});
 assert.equal(first.status,201);
 assert.equal((await f.staff("/public/employee/cash/counts","POST",{countedMinor:500,reportDate:day,note:""})).status,200);
 assert.equal((await f.staff("/public/employee/cash/counts","POST",{countedMinor:100,reportDate:day,note:""})).status,409);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM employee_cash_counts").get().n,1);
});
test("separate reporting module cannot write canonical Money or execute payments",()=>{
 const source=readFileSync(new URL("../cloudflare/src/employee-cash.js",import.meta.url),"utf8");
 assert.doesNotMatch(source,/env\.DB\.prepare\(\s*["'](?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?(?:finance_transactions|finance_accounts|payment_orders)/i);
 assert.match(source,/THEBE_EMPLOYEE_CASH_ENABLED==="true"/);
 assert.match(source,/tenant_id=\?/);
 const config=readFileSync(new URL("../cloudflare/wrangler.toml",import.meta.url),"utf8");
 assert.match(config,/THEBE_EMPLOYEE_CASH_ENABLED = "false"/);
});

test("rejected expense remains a cash outflow pending a separately documented recovery",async t=>{
 const f=fixture(t);
 await f.manager("/api/employee-self-service/cash/advances","POST",advance());
 const spent=await f.staff("/public/employee/cash/expenses","POST",expense());
 const rejected=await f.manager("/api/employee-self-service/cash/entries/"+spent.body.id+"/review","POST",{decision:"reject",note:"Receipt missing; employee must reconcile"});
 assert.equal(rejected.status,200,JSON.stringify(rejected.body));
 const state=await f.staff("/public/employee/cash");
 assert.equal(state.body.summary.reportedSpentMinor,85000);
 assert.equal(state.body.summary.expectedMinor,115000);
 assert.equal(state.body.summary.rejectedReviewMinor,85000);
 assert.equal(state.body.summary.pendingReviewMinor,0);
});

test("cash schema rejects cross-tenant employee identities and audit linkage",async t=>{
 const f=fixture(t);
 assert.throws(()=>f.sql.prepare("INSERT INTO employee_cash_entries(id,tenant_id,employee_id,actor_kind,actor_id,kind,amount_minor,category,purpose,occurred_on,idempotency_key,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
  .run(randomUUID(),A,EM_B,"employee","staff-b","expense",100,"fuel","Unauthorized cross-tenant spend",day,"tenant-mismatch-key-0001","submitted"),/employee_cash_tenant_mismatch/);
 assert.throws(()=>f.sql.prepare("INSERT INTO employee_cash_counts(id,tenant_id,employee_id,report_date,counted_minor) VALUES(?,?,?,?,?)")
  .run(randomUUID(),A,EM_B,day,100),/employee_cash_tenant_mismatch/);
 const created=await f.staff("/public/employee/cash/expenses","POST",expense());
 assert.equal(created.status,201);
 assert.throws(()=>f.sql.prepare("INSERT INTO employee_cash_events(id,tenant_id,employee_id,entry_id,actor_kind,actor_id,action) VALUES(?,?,?,?,?,?,?)")
  .run(randomUUID(),B,EM_B,created.body.id,"employee","staff-b","expense_submitted"),/employee_cash_audit_tenant_mismatch/);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM employee_cash_events").get().n,1);
});

test("manager cash overview retains inactive employee cash history",async t=>{
 const f=fixture(t);
 const issued=await f.manager("/api/employee-self-service/cash/advances","POST",advance());
 assert.equal(issued.status,201);
 const spent=await f.staff("/public/employee/cash/expenses","POST",expense());
 assert.equal(spent.status,201);
 f.sql.prepare("UPDATE employees SET status='inactive' WHERE id=?").run(EM_A);
 const overview=await f.manager("/api/employee-self-service/cash");
 assert.equal(overview.status,200);
 assert.equal(overview.body.balances.length,1);
 assert.equal(overview.body.balances[0].employee_id,EM_A);
 assert.equal(overview.body.balances[0].expected_minor,115000);
 assert.equal(overview.body.balances[0].pending_minor,85000);
 assert.equal((await f.manager("/api/employee-self-service/cash/advances","POST",advance(EM_A,20000,"no-cash-to-inactive-0001"))).status,404);
});

test("employee accommodation expenses retain category and idempotency",async t=>{
 const f=fixture(t);
 const input={...expense(35000,"accommodation-receipt-001"),category:"accommodation",purpose:"Overnight stay for installation"};
 const saved=await f.staff("/public/employee/cash/expenses","POST",input);
 assert.equal(saved.status,201);
 assert.equal((await f.staff("/public/employee/cash/expenses","POST",input)).status,200);
 const list=await f.staff("/public/employee/cash");
 assert.equal(list.body.items.length,1);
 assert.equal(list.body.items[0].category,"accommodation");
 assert.equal(list.body.summary.reportedSpentMinor,35000);
});
