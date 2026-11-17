import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';

function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT NOT NULL);
 CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE);
 CREATE TABLE memberships(tenant_id TEXT,user_id TEXT,role TEXT,status TEXT,PRIMARY KEY(tenant_id,user_id));
 CREATE TABLE operating_locations(id TEXT PRIMARY KEY,tenant_id TEXT,name TEXT,code TEXT,town TEXT,active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE daily_employee_reports(id TEXT PRIMARY KEY,tenant_id TEXT,location_id TEXT,report_date TEXT,work_summary TEXT,wins TEXT,blockers TEXT,incidents TEXT,next_plan TEXT,needs_attention INTEGER,submitted_at TEXT);
 CREATE TABLE workspace_manager_invites(id TEXT PRIMARY KEY,tenant_id TEXT,accepted_by_user_id TEXT,status TEXT);
 `);
 db.exec(fs.readFileSync(new URL('../db/drafts/manager-invitations-2578-location-grants.sql',import.meta.url),'utf8'));
 const run=(sql,...args)=>db.prepare(sql).run(...args);
 for(const id of ['tenant-a','tenant-b'])run('INSERT INTO tenants(id,name) VALUES(?,?)',id,id);
 for(const id of ['manager-a','manager-b','owner-a'])run('INSERT INTO users(id,email) VALUES(?,?)',id,id+'@example.invalid');
 for(const [tenant,id,role] of [['tenant-a','manager-a','manager'],['tenant-b','manager-b','manager'],['tenant-a','owner-a','owner']])run("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,?,'active')",tenant,id,role);
 for(const [id,tenant] of [['maun','tenant-a'],['gabs','tenant-a'],['other','tenant-b']])run('INSERT INTO operating_locations(id,tenant_id,name,active) VALUES(?,?,?,1)',id,tenant,id);
 for(const [id,tenant,loc] of [['maun-report','tenant-a','maun'],['gabs-report','tenant-a','gabs'],['other-report','tenant-b','other']])run("INSERT INTO daily_employee_reports(id,tenant_id,location_id,report_date,work_summary,wins,blockers,incidents,next_plan,needs_attention,submitted_at) VALUES(?,?,?,'2026-11-01','synthetic','','','','',0,'2026-11-01')",id,tenant,loc);
 run("INSERT INTO workspace_manager_invites(id,tenant_id,accepted_by_user_id,status) VALUES('invite','tenant-a','manager-a','accepted')");
 run("INSERT INTO workspace_manager_location_grants(tenant_id,manager_user_id,location_id,granted_by_user_id,status) VALUES('tenant-a','manager-a','maun','owner-a','active')");
 return db;
}
test('real SQLite tenant and location predicates reveal Maun only; revocation hides it',()=>{
 const db=setup();
 try{
 const q="SELECT r.id FROM daily_employee_reports r JOIN workspace_manager_location_grants g ON g.tenant_id=r.tenant_id AND g.location_id=r.location_id AND g.manager_user_id=? AND g.status='active' JOIN operating_locations l ON l.tenant_id=r.tenant_id AND l.id=r.location_id AND l.active=1 WHERE r.tenant_id=? ORDER BY r.report_date DESC,r.submitted_at DESC,r.id DESC LIMIT 50";
 assert.deepEqual(db.prepare(q).all('manager-a','tenant-a').map(x=>x.id),['maun-report']);
 assert.deepEqual(db.prepare(q).all('manager-a','tenant-b'),[]);
 db.prepare("UPDATE workspace_manager_location_grants SET status='revoked' WHERE tenant_id='tenant-a' AND manager_user_id='manager-a' AND location_id='maun'").run();
 assert.deepEqual(db.prepare(q).all('manager-a','tenant-a'),[]);
 }finally{db.close();}
});
