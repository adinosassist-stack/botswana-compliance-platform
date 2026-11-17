import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {issueManagerInviteD1,activateManagerInviteD1} from '../cloudflare/src/manager-invitations-d1.js';
import {suspendManagerMembershipD1} from '../cloudflare/src/manager-invitations-revocation.js';
import {grantManagerLocationD1,isManagerLocationAuthorized,revokeManagerLocationD1} from '../cloudflare/src/manager-invitations-location-grants.js';

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
 CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, public_id TEXT UNIQUE, user_id TEXT NOT NULL, tenant_id TEXT NOT NULL, role TEXT NOT NULL, session_generation INTEGER NOT NULL DEFAULT 0, csrf_token TEXT, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT, FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(tenant_id) REFERENCES tenants(id));
 CREATE TABLE operating_locations(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT NOT NULL,code TEXT,town TEXT,active INTEGER NOT NULL DEFAULT 1, FOREIGN KEY(tenant_id) REFERENCES tenants(id));
 CREATE TABLE audit_events(id INTEGER PRIMARY KEY AUTOINCREMENT,tenant_id TEXT NOT NULL,
 actor_user_id TEXT,event_type TEXT NOT NULL,entity_type TEXT,entity_id TEXT,
 event_data TEXT NOT NULL DEFAULT '{}',occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
 const ddl=fs.readFileSync(new URL('../db/drafts/manager-invitations-2578.sql',import.meta.url),'utf8');
 sql.exec(ddl);
 const grants=fs.readFileSync(new URL('../db/drafts/manager-invitations-2578-location-grants.sql',import.meta.url),'utf8');
 sql.exec(grants);
 sql.prepare("INSERT INTO tenants(id,name) VALUES(?,?)").run('tenant-a','Lovely Group');
 sql.prepare("INSERT INTO tenants(id,name) VALUES(?,?)").run('tenant-b','Other group');
 sql.prepare("INSERT INTO users(id,email) VALUES(?,?)").run('owner-a','owner@demo.invalid');
 sql.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,?,?)").run('tenant-a','owner-a','owner','active');
 const db={
  prepare(query){return {bind(...params){return {query,params,first:async()=>sql.prepare(query).get(...params),all:async()=>({results:sql.prepare(query).all(...params)})}}};},
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


test('synthetic activated manager is eligible for existing tenant-scoped login, then loses access on suspension',async()=>{
 const x=fixture();try{
  await issueManagerInviteD1(x.db,invite());
  await activateManagerInviteD1(x.db,{tokenHash:h('a'),passwordHash,userId:'manager-a',now});
  // These are the same eligibility conditions used by canonical /api/auth/login:
  // verified password, active membership, correct tenant and allowed role.
  const login=x.sql.prepare(`SELECT u.id,m.tenant_id,m.role FROM users u
    JOIN memberships m ON m.user_id=u.id AND m.status='active'
    WHERE u.email=? AND u.password_hash=? AND m.tenant_id=? AND m.role='manager'`);
  assert.deepEqual({...login.get('manager@demo.invalid',passwordHash,'tenant-a')},{
    id:'manager-a',tenant_id:'tenant-a',role:'manager'
  });
  assert.equal(login.get('manager@demo.invalid',passwordHash,'tenant-b'),undefined);
  assert.equal(login.get('manager@demo.invalid','incorrect-hash','tenant-a'),undefined);
  x.sql.prepare("UPDATE memberships SET status='suspended' WHERE tenant_id=? AND user_id=?").run('tenant-a','manager-a');
  assert.equal(login.get('manager@demo.invalid',passwordHash,'tenant-a'),undefined);
 }finally{x.close();}
});
test('canonical Worker login eligibility requires active tenant membership, not client-provided role',()=>{
 const worker=fs.readFileSync(new URL('../cloudflare/src/worker.js',import.meta.url),'utf8');
 const start=worker.indexOf('if(url.pathname==="/api/auth/login"');
 const end=worker.indexOf('if(url.pathname==="/api/auth/logout"',start);
 assert.ok(start>=0&&end>start);
 const login=worker.slice(start,end);
 assert.match(login,/verifyPassword\(password/);
 assert.match(login,/m\.status='active'/);
 assert.match(login,/m\.tenant_id/);
 assert.match(login,/createPasswordSession/);
});


test('synthetic activation, branch grant, revocation and session suspension preserve tenant isolation',async()=>{
 const x=fixture();try{
  x.sql.prepare("INSERT INTO operating_locations(id,tenant_id,name,town,active) VALUES(?,?,?,?,1)").run('maun-a','tenant-a','Maun','Maun');
  x.sql.prepare("INSERT INTO operating_locations(id,tenant_id,name,town,active) VALUES(?,?,?,?,1)").run('maun-b','tenant-b','Other Maun','Maun');
  await issueManagerInviteD1(x.db,invite());
  await activateManagerInviteD1(x.db,{tokenHash:h('a'),passwordHash,userId:'manager-a',now});
  x.sql.prepare("INSERT INTO sessions(token_hash,user_id,tenant_id,role,expires_at) VALUES(?,?,?,?,?)")
   .run('synthetic-session-a','manager-a','tenant-a','manager','2030-01-01');
  assert.equal(await isManagerLocationAuthorized(x.db,{tenantId:'tenant-a',managerId:'manager-a',locationId:'maun-a'}),false);
  await assert.rejects(()=>grantManagerLocationD1(x.db,{tenantId:'tenant-a',ownerId:'owner-a',managerId:'manager-a',locationId:'maun-b'}));
  await grantManagerLocationD1(x.db,{tenantId:'tenant-a',ownerId:'owner-a',managerId:'manager-a',locationId:'maun-a'});
  assert.equal(await isManagerLocationAuthorized(x.db,{tenantId:'tenant-a',managerId:'manager-a',locationId:'maun-a'}),true);
  assert.equal(await isManagerLocationAuthorized(x.db,{tenantId:'tenant-a',managerId:'manager-a',locationId:'maun-b'}),false);
  await revokeManagerLocationD1(x.db,{tenantId:'tenant-a',ownerId:'owner-a',managerId:'manager-a',locationId:'maun-a'});
  assert.equal(await isManagerLocationAuthorized(x.db,{tenantId:'tenant-a',managerId:'manager-a',locationId:'maun-a'}),false);
  assert.equal(x.sql.prepare("SELECT count(*) c FROM sessions WHERE user_id='manager-a'").get().c,0);
  x.sql.prepare("INSERT INTO sessions(token_hash,user_id,tenant_id,role,expires_at) VALUES(?,?,?,?,?)")
    .run('synthetic-session-b','manager-a','tenant-a','manager','2030-01-01');
  await suspendManagerMembershipD1(x.db,{tenantId:'tenant-a',actorId:'owner-a',managerUserId:'manager-a'});
  assert.equal(x.sql.prepare("SELECT status FROM memberships WHERE user_id='manager-a'").get().status,'suspended');
  assert.equal(x.sql.prepare("SELECT count(*) c FROM sessions WHERE user_id='manager-a'").get().c,0);
  assert.equal(x.sql.prepare("SELECT count(*) c FROM memberships WHERE tenant_id='tenant-b'").get().c,0);
 }finally{x.close();}
});
