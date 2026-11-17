import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto as crypto} from 'node:crypto';
import {createManagerRequestCodeD1} from '../cloudflare/src/manager-request-codes.js';
import {createManagerAccessRequestsHttp} from '../cloudflare/src/manager-access-requests-http.js';

const origin='https://manager-staging.thebedesk.com';
function harness(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(`
 PRAGMA foreign_keys=ON;
 CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT);
 CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE);
 CREATE TABLE memberships(tenant_id TEXT,user_id TEXT,role TEXT,status TEXT,PRIMARY KEY(tenant_id,user_id));
 CREATE TABLE operating_locations(id TEXT PRIMARY KEY,tenant_id TEXT,name TEXT,active INTEGER);
 CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT);
 CREATE TABLE audit_events(tenant_id TEXT,actor_user_id TEXT,event_type TEXT,entity_type TEXT,entity_id TEXT,event_data TEXT);
 CREATE TABLE workspace_manager_location_grants(tenant_id TEXT,manager_user_id TEXT,location_id TEXT,granted_by_user_id TEXT,status TEXT,revoked_at TEXT,PRIMARY KEY(tenant_id,manager_user_id,location_id));
 CREATE TABLE workspace_manager_access_requests(id TEXT PRIMARY KEY,tenant_id TEXT,requester_user_id TEXT,location_id TEXT,reason TEXT,status TEXT DEFAULT 'pending',reviewed_by_user_id TEXT,reviewed_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE UNIQUE INDEX one_pending ON workspace_manager_access_requests(tenant_id,requester_user_id) WHERE status='pending';
 CREATE TABLE workspace_manager_request_codes(id TEXT PRIMARY KEY,tenant_id TEXT,location_id TEXT,code_hash TEXT,created_by_user_id TEXT,expires_at TEXT,revoked_at TEXT);
 INSERT INTO tenants VALUES('personal-a','Individual Company'),('business-b','Target Business');
 INSERT INTO users VALUES('registered-a','registered@example.com'),('owner-b','owner@example.com');
 INSERT INTO memberships VALUES('personal-a','registered-a','owner','active'),('business-b','owner-b','owner','active');
 INSERT INTO operating_locations VALUES('branch-b','business-b','Target Branch',1);
 INSERT INTO sessions VALUES('old-session','registered-a');
 `);
 const db={
  prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this;},
   async first(){return sqlite.prepare(this.sql).get(...this.args)||null},
   async all(){return {results:sqlite.prepare(this.sql).all(...this.args)}},
   async run(){return sqlite.prepare(this.sql).run(...this.args)}
  };},
  async batch(stmts){
   sqlite.exec('BEGIN');
   try{const results=stmts.map(s=>s.sql.trimStart().toUpperCase().startsWith('SELECT')?sqlite.prepare(s.sql).get(...s.args):sqlite.prepare(s.sql).run(...s.args));
    sqlite.exec('COMMIT');return results;
   }catch(error){sqlite.exec('ROLLBACK');throw error;}
  }
 };
 const handler=(actor,provisioningEnabled=false)=>createManagerAccessRequestsHttp({db,origin,newId:()=>crypto.randomUUID(),provisioningEnabled,authenticate:async()=>actor,verifyCsrf:async()=>true,rateLimit:async()=>true});
 const ownerA={tenantId:'personal-a',userId:'registered-a',role:'owner'};
 const ownerB={tenantId:'business-b',userId:'owner-b',role:'owner'};
 const post=(path,body)=>new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 return {sqlite,db,handler,ownerA,ownerB,post};
}
test('registered owner of A requests external business B manager access; B owner approves and provisions only B branch',async()=>{
 const x=harness();
 const secret=await createManagerRequestCodeD1(x.db,{tenantId:'business-b',ownerId:'owner-b',locationId:'branch-b',cryptoApi:crypto});
 const request=await x.handler(x.ownerA)(x.post('/api/workspace/managers/access-requests',{businessCode:secret.code,reason:'Assigned by store owner'}));
 assert.equal(request.status,201);
 const id=(await request.json()).id;
 assert.equal(x.sqlite.prepare('SELECT tenant_id FROM workspace_manager_access_requests WHERE id=?').get(id).tenant_id,'business-b');
 const decision=await x.handler(x.ownerB)(x.post('/api/workspace/managers/access-requests/decide',{requestId:id,decision:'approve'}));
 assert.equal(decision.status,200);
 assert.equal(x.sqlite.prepare("SELECT COUNT(*) n FROM memberships WHERE tenant_id='business-b' AND user_id='registered-a'").get().n,0);
 const denied=await x.handler(x.ownerA,true)(x.post('/api/workspace/managers/access-requests/provision',{requestId:id}));
 assert.equal(denied.status,409);
 const completed=await x.handler(x.ownerB,true)(x.post('/api/workspace/managers/access-requests/provision',{requestId:id}));
 assert.equal(completed.status,200);
 assert.equal((await completed.json()).reauthenticationRequired,true);
 assert.equal(x.sqlite.prepare("SELECT role FROM memberships WHERE tenant_id='business-b' AND user_id='registered-a'").get().role,'manager');
 assert.equal(x.sqlite.prepare("SELECT role FROM memberships WHERE tenant_id='personal-a' AND user_id='registered-a'").get().role,'owner');
 assert.equal(x.sqlite.prepare("SELECT location_id FROM workspace_manager_location_grants WHERE tenant_id='business-b' AND manager_user_id='registered-a' AND status='active'").get().location_id,'branch-b');
 assert.equal(x.sqlite.prepare("SELECT COUNT(*) n FROM sessions WHERE user_id='registered-a'").get().n,0);
 assert.equal(x.sqlite.prepare("SELECT status FROM workspace_manager_access_requests WHERE id=?").get(id).status,'provisioned');
 assert.equal(x.sqlite.prepare("SELECT COUNT(*) n FROM audit_events WHERE event_type='manager_access_request_provisioned'").get().n,1);
 const replay=await x.handler(x.ownerB,true)(x.post('/api/workspace/managers/access-requests/provision',{requestId:id}));
 assert.notEqual(replay.status,200);
 x.sqlite.close();
});
test('expired business code cannot enroll and cannot create request or membership',async()=>{
 const x=harness();
 const secret=await createManagerRequestCodeD1(x.db,{tenantId:'business-b',ownerId:'owner-b',locationId:'branch-b',cryptoApi:crypto});
 x.sqlite.exec("UPDATE workspace_manager_request_codes SET expires_at='2000-01-01T00:00:00.000Z'");
 const res=await x.handler(x.ownerA)(x.post('/api/workspace/managers/access-requests',{businessCode:secret.code}));
 assert.equal(res.status,409);
 assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM workspace_manager_access_requests').get().n,0);
 x.sqlite.close();
});
