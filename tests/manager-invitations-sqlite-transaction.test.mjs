import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {issueManagerInviteD1,activateManagerInviteD1} from '../cloudflare/src/manager-invitations-d1.js';

// Real SQLite engine with transactional D1-like batch shim; NOT a remote D1 Worker test.
// Model actual base tables' relevant NOT NULL, keys and foreign key constraints.
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT NOT NULL);
 CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,display_name TEXT,
 password_hash TEXT,onboarding_complete INTEGER NOT NULL DEFAULT 0,
 session_generation INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE memberships(tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','manager','reviewer','auditor')),
 status TEXT NOT NULL DEFAULT 'active',PRIMARY KEY(tenant_id,user_id),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(user_id) REFERENCES users(id));
 CREATE TABLE audit_events(id INTEGER PRIMARY KEY AUTOINCREMENT,tenant_id TEXT NOT NULL,
 actor_user_id TEXT,event_type TEXT NOT NULL,entity_type TEXT,entity_id TEXT,
 event_data TEXT NOT NULL DEFAULT '{}',occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
 const ddl=fs.readFileSync(new URL('../db/drafts/manager-invitations-2578.sql',import.meta.url),'utf8');
 sql.exec(ddl);
 sql.prepare("INSERT INTO tenants(id,name) VALUES(?,?)").run('tenant-a','Lovely Group');
 sql.prepare("INSERT INTO tenants(id,name) VALUES(?,?)").run('tenant-b','Other group');
 sql.prepare("INSERT INTO users(id,email) VALUES(?,?)").run('owner-a','owner@demo.invalid');
 sql.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,?,?)").run('tenant-a','owner-a','owner','active');
 const db={
  prepare(query){return {bind(...params){return {query,params}}};},
  async batch(commands){
   sql.exec('BEGIN IMMEDIATE');
   try{
    const results=commands.map(x=>{const stmt=sql.prepare(x.query);return stmt.columns().length?stmt.all(...x.params):stmt.run(...x.params);});
    sql.exec('COMMIT');return results;
   }catch(e){sql.exec('ROLLBACK');throw e;}
  }
 };
 return {sql,db,close:()=>sql.close()};
}
const h=(n)=>n.repeat(64);
const passwordHash='pbkdf2$100000$'+Buffer.alloc(16).toString('base64')+'$'+Buffer.alloc(32).toString('base64');
const expiry='2030-01-01T00:00:00.000Z',now='2027-01-01T00:00:00.000Z';
const invite=(override={})=>({tenantId:'tenant-a',actorId:'owner-a',email:'manager@demo.invalid',
 branch:'Maun',tokenHash:h('a'),expiresAt:expiry,id:'invite-a',...override});
test('issue then activate creates exact tenant manager and an audit event',async()=>{
 const x=fixture();try{
  await issueManagerInviteD1(x.db,invite());
  const result=await activateManagerInviteD1(x.db,{tokenHash:h('a'),passwordHash,userId:'manager-a',now});
  assert.equal(result.ok,true);
  assert.equal(x.sql.prepare("SELECT role FROM memberships WHERE tenant_id='tenant-a' AND user_id='manager-a'").get().role,'manager');
  assert.equal(x.sql.prepare("SELECT count(*) c FROM memberships WHERE tenant_id='tenant-b'").get().c,0);
  assert.equal(x.sql.prepare("SELECT status FROM workspace_manager_invites WHERE id='invite-a'").get().status,'accepted');
  assert.equal(x.sql.prepare("SELECT count(*) c FROM audit_events").get().c,1);
 }finally{x.close();}
});
test('used token fails atomically without extra account or audit',async()=>{
 const x=fixture();try{
  await issueManagerInviteD1(x.db,invite());
  await activateManagerInviteD1(x.db,{tokenHash:h('a'),passwordHash,userId:'manager-a',now});
  await assert.rejects(()=>activateManagerInviteD1(x.db,{tokenHash:h('a'),passwordHash,userId:'manager-b',now}));
  assert.equal(x.sql.prepare("SELECT count(*) c FROM users").get().c,2);
  assert.equal(x.sql.prepare("SELECT count(*) c FROM audit_events").get().c,1);
 }finally{x.close();}
});
test('expired token and existing user are rejected without partial writes',async()=>{
 const x=fixture();try{
  await issueManagerInviteD1(x.db,invite());
  await assert.rejects(()=>activateManagerInviteD1(x.db,{tokenHash:h('a'),passwordHash,userId:'expired',now:'2031-01-01T00:00:00.000Z'}));
  assert.equal(x.sql.prepare("SELECT count(*) c FROM users").get().c,1);
  x.sql.prepare('INSERT INTO users(id,email) VALUES(?,?)').run('existing','manager@demo.invalid');
  await assert.rejects(()=>activateManagerInviteD1(x.db,{tokenHash:h('a'),passwordHash,userId:'overwrite',now}));
  assert.equal(x.sql.prepare("SELECT count(*) c FROM memberships").get().c,1);
  assert.equal(x.sql.prepare("SELECT status FROM workspace_manager_invites").get().status,'pending');
 }finally{x.close();}
});
test('revoked owner, wrong tenant and failed duplicate issue roll back changes',async()=>{
 const x=fixture();try{
  await issueManagerInviteD1(x.db,invite());
  await assert.rejects(()=>issueManagerInviteD1(x.db,invite({actorId:'owner-b',tokenHash:h('b'),id:'other'})));
  assert.equal(x.sql.prepare("SELECT status FROM workspace_manager_invites WHERE id='invite-a'").get().status,'pending');
  await assert.rejects(()=>issueManagerInviteD1(x.db,invite({tokenHash:h('a'),id:'duplicate'})));
  assert.equal(x.sql.prepare("SELECT status FROM workspace_manager_invites WHERE id='invite-a'").get().status,'pending');
 }finally{x.close();}
});
