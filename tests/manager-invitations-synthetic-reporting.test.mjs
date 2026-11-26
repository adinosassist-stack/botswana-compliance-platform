import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createManagerScopedReadHttp} from '../cloudflare/src/manager-invitations-scoped-read.js';
import {createManagerDailyReportReview,managerDailyReviewEnabled,readStaffDailyReviewNotices,readOwnerDailyReviewOverview} from '../cloudflare/src/manager-daily-report-review.js';
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

test('revision-bound manager decisions are append-only, scoped and idempotent in isolated SQLite',async()=>{
 const {d,db}=fixture();
 try{
  d.exec(read('db/drafts/manager-daily-report-review.sql'));
  let sequence=0;
  const review=createManagerDailyReportReview({db,id:()=>String(++sequence)});
  const manager={tenantId:'a',userId:'manager-a',role:'manager'};
  const other={tenantId:'b',userId:'manager-b',role:'manager'};
  const input={reportId:'report-a',expectedRevision:0};
  const decide=(action,note='',actor=manager,extra={})=>review.decide(actor,{...input,action,note,...extra});
  assert.equal((await review.inspect(manager,'report-a')).reviewStatus,'pending');
  assert.equal((await review.inspect(other,'report-a')).status,404);
  assert.equal((await decide('approve','',other)).status,404);
  assert.equal((await decide('return','no')).status,400);
  assert.equal((await decide('acknowledge')).status,201);
  assert.equal((await decide('acknowledge')).idempotent,true);
  assert.equal((await review.inspect(manager,'report-a')).reviewStatus,'acknowledged');
  assert.equal((await decide('return','Please correct installation details')).status,201);
  assert.equal((await decide('approve')).status,409);
  assert.equal((await review.inspect(manager,'report-a')).reviewStatus,'correction_requested');
  assert.equal((await decide('return','Please correct installation details')).idempotent,true);
  assert.equal((await decide('return','Different reason')).status,409);
  d.prepare("UPDATE daily_employee_reports SET revision_count=1,work_summary='Corrected' WHERE id='report-a'").run();
  assert.equal((await review.inspect(manager,'report-a')).reviewStatus,'pending');
  assert.equal((await decide('approve')).status,409);
  assert.equal((await decide('approve','',manager,{expectedRevision:1})).status,201);
  assert.equal((await review.inspect(manager,'report-a')).reviewStatus,'approved');
  assert.equal(d.prepare("SELECT COUNT(*) n FROM daily_report_manager_reviews WHERE report_id='report-a'").get().n,3);
  assert.equal(d.prepare("SELECT work_summary FROM daily_employee_reports WHERE id='report-a'").get().work_summary,'Corrected');
  d.prepare("UPDATE workspace_manager_location_grants SET status='revoked' WHERE tenant_id='a' AND manager_user_id='manager-a'").run();
  assert.equal((await review.inspect(manager,'report-a')).status,404);
  assert.equal((await decide('approve','',manager,{expectedRevision:1})).status,404);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM daily_report_manager_reviews").get().n,3);
 }finally{d.close()}
});

test('review activation is default off, staging only and requires every readiness flag',()=>{
 const flags=['MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED','MANAGER_INVITATIONS_SCHEMA_READY','MANAGER_INVITATIONS_ACCESS_READY','MANAGER_DAILY_REPORT_REVIEW_ENABLED','MANAGER_DAILY_REPORT_REVIEW_SCHEMA_READY'];
 const enabled={APP_ENV:'staging',...Object.fromEntries(flags.map(k=>[k,'true']))};
 assert.equal(managerDailyReviewEnabled({}),false);
 assert.equal(managerDailyReviewEnabled({...enabled,APP_ENV:'production'}),false);
 assert.equal(managerDailyReviewEnabled(enabled),true);
 for(const k of flags)assert.equal(managerDailyReviewEnabled({...enabled,[k]:'false'}),false,k);
});
test('enabled manager reads and employee notices reflect only the current scoped revision',async()=>{
 const {d,db}=fixture();
 try{
  d.exec(read('db/drafts/manager-daily-report-review.sql'));
  const review=createManagerDailyReportReview({db,id:()=>'review-a'});
  const actor={tenantId:'a',userId:'manager-a',role:'manager'};
  const reportId='report-a',reason='Please correct delivery evidence';
  assert.equal((await review.decide(actor,{reportId,expectedRevision:0,action:'return',note:reason})).status,201);
  const request=new Request('https://private.example.invalid/api/workspace/managers/my-reports');
  const enabled=createManagerScopedReadHttp({db,reviewEnabled:true});
  const off=createManagerScopedReadHttp({db});
  let result=await (await enabled(request,actor)).json();
  assert.equal(result.reviewEnabled,true);assert.equal(result.reports[0].review_status,'correction_requested');assert.equal(result.reports[0].review_note,reason);
  result=await (await off(request,actor)).json();
  assert.equal(result.reviewEnabled,false);assert.equal(result.reports[0].review_status,undefined);
  assert.equal((await readStaffDailyReviewNotices(db,'a','employee-a'))[0].note,reason);
  assert.deepEqual(await readStaffDailyReviewNotices(db,'b','employee-b'),[]);
  assert.deepEqual(await readStaffDailyReviewNotices(db,'a','employee-b'),[]);
  d.prepare("UPDATE daily_employee_reports SET revision_count=1 WHERE id=?").run(reportId);
  assert.deepEqual(await readStaffDailyReviewNotices(db,'a','employee-a'),[]);
  result=await (await enabled(request,actor)).json();
  assert.equal(result.reports[0].review_status,'pending');
 }finally{d.close()}
});

test('owner review oversight isolates companies, honors branch/date and counts current revisions',async()=>{
 const {d,db}=fixture();
 try{
  d.exec(read('db/drafts/manager-daily-report-review.sql'));
  d.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'owner','active')").run('a','owner-a');
  d.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,'owner','active')").run('b','owner-b');
  const svc=createManagerDailyReportReview({db,id:()=>'owner-overview-review'});
  const actor={tenantId:'a',userId:'manager-a',role:'manager'};
  const result=await svc.decide(actor,{reportId:'report-a',expectedRevision:0,action:'return',note:'Correct the installation details'});
  assert.equal(result.status,201);
  const get=(extra={})=>readOwnerDailyReviewOverview(db,{tenantId:'a',userId:'owner-a',role:'owner',date:'2027-01-01',...extra});
  const overview=await get();
  assert.equal(overview.available,true);assert.equal(overview.total,1);
  assert.deepEqual(overview.counts,{pending:0,acknowledged:0,approved:0,correction_requested:1});
  assert.equal(overview.items[0].id,'report-a');assert.equal(overview.items[0].review_note,'Correct the installation details');
  assert.equal(overview.branches[0].correction_requested,1);
  assert.equal((await get({locationId:'location-a'})).total,1);
  assert.equal((await get({locationId:'location-b'})).total,0);
  assert.equal((await get({date:'2027-01-02'})).total,0);
  assert.equal((await get({role:'manager',userId:'manager-a'})).available,false);
  assert.equal((await get({userId:'owner-b'})).available,false);
  d.prepare("UPDATE daily_employee_reports SET revision_count=1 WHERE id='report-a'").run();
  const reopened=await get();
  assert.equal(reopened.counts.pending,1);assert.equal(reopened.counts.correction_requested,0);assert.equal(reopened.items[0].review_note,null);
  d.prepare("UPDATE memberships SET status='suspended' WHERE user_id='owner-a'").run();
  assert.equal((await get()).available,false);
 }finally{d.close()}
});
