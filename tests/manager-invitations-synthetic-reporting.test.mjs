import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createManagerScopedReadHttp} from '../cloudflare/src/manager-invitations-scoped-read.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('db/drafts/manager-invitations-2578-synthetic-reporting.sql');
function fixture(){
 const d=new DatabaseSync(':memory:');
 d.exec("PRAGMA foreign_keys=ON;CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT NOT NULL);CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE);CREATE TABLE memberships(tenant_id TEXT,user_id TEXT,role TEXT,status TEXT,PRIMARY KEY(tenant_id,user_id));");
 d.exec(read('db/drafts/manager-invitations-2578-synthetic-bootstrap.sql'));
 d.exec(read('db/drafts/manager-invitations-2578.sql'));
 d.exec(read('db/drafts/manager-invitations-2578-location-grants.sql'));
 d.exec(sql);
 const insert=(q,...args)=>d.prepare(q).run(...args);
 for(const t of ['a','b']){insert('INSERT INTO tenants(id,name) VALUES(?,?)',t,'Tenant '+t);insert('INSERT INTO users(id,email) VALUES(?,?)','manager-'+t,'manager-'+t+'@example.invalid');insert('INSERT INTO users(id,email) VALUES(?,?)','owner-'+t,'owner-'+t+'@example.invalid');insert("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'manager','active')",t,'manager-'+t);insert('INSERT INTO employees(id,tenant_id,full_name) VALUES(?,?,?)','employee-'+t,t,'Synthetic employee');insert('INSERT INTO operating_locations(id,tenant_id,name) VALUES(?,?,?)','location-'+t,t,'Location '+t);insert("INSERT INTO workspace_manager_invites(id,tenant_id,email,branch_name,token_hash,status,invited_by_user_id,accepted_by_user_id,expires_at,accepted_at) VALUES(?,?,?,?,?,'accepted',?,?,?,?)",'invite-'+t,t,'manager-'+t+'@example.invalid','Maun',t.repeat(64),'owner-'+t,'manager-'+t,'2030-01-01','2027-01-01');insert("INSERT INTO daily_employee_reports(id,tenant_id,employee_id,location_id,report_date,work_summary,needs_attention) VALUES(?,?,?,?,?,?,?)",'report-'+t,t,'employee-'+t,'location-'+t,'2027-01-01','Work '+t,1);}
 insert("INSERT INTO workspace_manager_location_grants(tenant_id,manager_user_id,location_id,granted_by_user_id) VALUES(?,?,?,?)",'a','manager-a','location-a','owner-a');
 const db={prepare(q){return {bind(...v){const st=d.prepare(q);return {first:async()=>st.get(...v),all:async()=>({results:st.all(...v)})}}}}};
 return {d,db};
}
test('synthetic reporting SQL matches canonical report and employee fields without data writes',()=>{
 const canonical=read('cloudflare/schema.sql');
 for(const col of ['employee_id','location_id','report_date','work_summary','wins','blockers','incidents','next_plan','needs_attention','submitted_at'])assert.match(sql,new RegExp('\\b'+col+'\\b'));
 assert.match(canonical,/CREATE TABLE IF NOT EXISTS daily_employee_reports/);
 assert.doesNotMatch(sql,/\b(?:INSERT INTO|UPDATE\s|DELETE FROM|DROP TABLE)\b/i);
});
test('real sqlite scoped dashboard and reports reject foreign and ungranted rows',async()=>{
 const {d,db}=fixture();
 try{
  const handler=createManagerScopedReadHttp({db});
  const identity={tenantId:'a',userId:'manager-a',role:'manager'};
  const get=async path=>{const res=await handler(new Request('https://private.example.invalid'+path),identity);return {status:res.status,body:await res.json()}};
  let dashboard=await get('/api/workspace/managers/my-dashboard');
  assert.equal(dashboard.status,200);
  assert.equal(dashboard.body.reports,1);
  assert.equal(dashboard.body.needsAttention,1);
  assert.deepEqual(dashboard.body.locations.map(x=>x.id),['location-a']);
  let reports=await get('/api/workspace/managers/my-reports');
  assert.deepEqual(reports.body.reports.map(x=>x.id),['report-a']);
  assert.equal(reports.body.reports[0].employee_name,'Synthetic employee');
  assert.equal(reports.body.reports[0].location_name,'Location a');
  assert.equal(reports.body.reports[0].revision_count,0);
  assert.equal(reports.body.reports[0].needs_attention,1);
  // A corrupt cross-tenant employee association must not disclose its identity or increase totals.
  d.prepare("INSERT INTO daily_employee_reports(id,tenant_id,employee_id,location_id,report_date,work_summary) VALUES(?,?,?,?,?,?)").run('invalid-association','a','employee-b','location-a','2027-01-02','Invalid association');
  assert.deepEqual((await get('/api/workspace/managers/my-reports')).body.reports.map(x=>x.id),['report-a']);
  assert.equal((await get('/api/workspace/managers/my-dashboard')).body.reports,1);
  const denied=await handler(new Request('https://private.example.invalid/api/workspace/managers/my-reports',{method:'POST'}),identity);
  assert.equal(denied.status,404,'review screen remains read-only');
  d.prepare("UPDATE workspace_manager_location_grants SET status='revoked' WHERE tenant_id=? AND manager_user_id=?").run('a','manager-a');
  dashboard=await get('/api/workspace/managers/my-dashboard');
  assert.equal(dashboard.body.reports,0);
  reports=await get('/api/workspace/managers/my-reports');
  assert.deepEqual(reports.body.reports,[]);
  d.prepare("UPDATE memberships SET status='suspended' WHERE user_id=?").run('manager-a');
  assert.equal((await get('/api/workspace/managers/my-dashboard')).status,403);
 }finally{d.close();}
});
