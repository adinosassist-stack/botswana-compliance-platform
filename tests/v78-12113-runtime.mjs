import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../cloudflare/src/worker.js';
class St{constructor(db,sql){this.db=db;this.sql=sql;this.args=[]}bind(...a){this.args=a;return this}first(){const r=this.db.prepare(this.sql).get(...this.args);return r?{...r}:null}all(){return {results:this.db.prepare(this.sql).all(...this.args).map(r=>({...r}))}}run(){const r=this.db.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes||0)}}}}
class D1{constructor(db){this.db=db}prepare(sql){return new St(this.db,sql)}batch(ss){this.db.exec('BEGIN IMMEDIATE');try{const r=ss.map(s=>s.run());this.db.exec('COMMIT');return r}catch(e){this.db.exec('ROLLBACK');throw e}}}
const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));const DB=new D1(sqlite);
const secret='v78-12113-session-secret',raw='session-token',csrf='csrf-token',hash=createHmac('sha256',secret).update(raw).digest('hex');
for(const [id,name] of [['t1','Tenant One'],['t2','Tenant Two']])sqlite.prepare('INSERT INTO tenants(id,name) VALUES(?,?)').run(id,name);
sqlite.prepare('INSERT INTO users(id,email,display_name) VALUES(?,?,?)').run('u1','owner@example.com','Owner');
sqlite.prepare('INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,?,?)').run('t1','u1','owner','active');
sqlite.prepare("INSERT INTO sessions(token_hash,user_id,tenant_id,role,csrf_token,expires_at) VALUES(?,?,?,?,?,datetime('now','+1 day'))").run(hash,'u1','t1','owner',csrf);
sqlite.prepare('INSERT INTO subscriptions(tenant_id,plan,status) VALUES(?,?,?)').run('t1','business','active');
for(const feature of ['licenceos','business_event_engine','institutional_passport'])sqlite.prepare("INSERT INTO plan_entitlements(plan,feature_key,enabled,limit_value) VALUES(?,?,1,?) ON CONFLICT(plan,feature_key) DO UPDATE SET enabled=1,limit_value=excluded.limit_value").run('business',feature,feature==='licenceos'?10:null);
sqlite.prepare("INSERT INTO operating_locations(id,tenant_id,name,active) VALUES('s1','t1','T1 Site',1),('s2','t2','T2 Site',1)").run();
const env={DB,SESSION_SECRET:secret,AUDIT_INTEGRITY_SECRET:'audit-secret',PUBLIC_ORIGIN:'https://app.example'};
const req=(path,o={})=>new Request(`https://app.example${path}`,{...o,headers:{cookie:`__Host-bw_session=${raw}`,'x-csrf-token':csrf,'content-type':'application/json',...(o.headers||{})}});
let r=await worker.fetch(req('/api/licences',{method:'POST',body:JSON.stringify({licenceType:'Trade',issuedAt:'2028-05-10',renewalDueAt:'2028-05-09'})}),env,{});assert.equal(r.status,400);assert.equal((await r.json()).error,'renewal_before_issue');
r=await worker.fetch(req('/api/licences',{method:'POST',body:JSON.stringify({licenceType:'Trade',siteId:'s2'})}),env,{});assert.equal(r.status,400);assert.equal((await r.json()).error,'invalid_site');
r=await worker.fetch(req('/api/licences',{method:'POST',body:JSON.stringify({licenceType:'Trade',authority:'Council',siteId:'s1',issuedAt:'2028-01-01',renewalDueAt:'2028-12-31'})}),env,{});assert.equal(r.status,201);const lic=(await r.json()).id;
r=await worker.fetch(req(`/api/licences/${lic}/renew`,{method:'POST',body:JSON.stringify({renewalDueAt:'2028-12-31'})}),env,{});assert.equal(r.status,409);assert.equal((await r.json()).error,'renewal_date_not_after_current');
r=await worker.fetch(req(`/api/licences/${lic}/renew`,{method:'POST',body:JSON.stringify({renewalDueAt:'2028-06-30'})}),env,{});assert.equal(r.status,409);assert.equal(sqlite.prepare("SELECT count(*) n FROM licence_events WHERE licence_id=? AND event_type='LICENCE_RENEWED'").get(lic).n,0);
r=await worker.fetch(req(`/api/licences/${lic}/renew`,{method:'POST',body:JSON.stringify({renewalDueAt:'2029-12-31'})}),env,{});assert.equal(r.status,200);assert.equal(sqlite.prepare("SELECT count(*) n FROM licence_events WHERE licence_id=? AND event_type='LICENCE_RENEWED'").get(lic).n,1);
r=await worker.fetch(req(`/api/licences/${lic}/renew`,{method:'POST',body:JSON.stringify({renewalDueAt:'2029-12-31'})}),env,{});assert.equal(r.status,409);assert.equal(sqlite.prepare("SELECT count(*) n FROM licence_events WHERE licence_id=? AND event_type='LICENCE_RENEWED'").get(lic).n,1);
// Owner passport remains share-management capable.
r=await worker.fetch(req('/api/passport'),env,{});let p=await r.json();assert.equal(r.status,200);assert.equal(p.shareManagementAllowed,true);assert.ok(Array.isArray(p.shares));
// Reviewer gets read-only passport data and cannot enumerate share-management records or hidden risk-engine APIs.
sqlite.prepare("UPDATE memberships SET role='reviewer' WHERE tenant_id='t1' AND user_id=(SELECT user_id FROM sessions WHERE token_hash=?)").run(hash);
r=await worker.fetch(req('/api/passport'),env,{});p=await r.json();assert.equal(r.status,200);assert.equal(p.shareManagementAllowed,false);assert.deepEqual(p.shares,[]);assert.ok(Number.isInteger(p.activeShareCount));
r=await worker.fetch(req('/api/passport/shares'),env,{});assert.equal(r.status,403);
r=await worker.fetch(req('/api/business-events'),env,{});assert.equal(r.status,403);
r=await worker.fetch(req('/api/business-events/not-real'),env,{});assert.equal(r.status,403);
r=await worker.fetch(req('/api/business-events/not-real/retry',{method:'POST',body:'{}'}),env,{});assert.equal(r.status,403);
// Auditor gets the same read-only passport boundary.
sqlite.prepare("UPDATE memberships SET role='auditor' WHERE tenant_id='t1' AND user_id=(SELECT user_id FROM sessions WHERE token_hash=?)").run(hash);
r=await worker.fetch(req('/api/passport'),env,{});p=await r.json();assert.equal(r.status,200);assert.equal(p.shareManagementAllowed,false);assert.deepEqual(p.shares,[]);
r=await worker.fetch(req('/api/passport/shares'),env,{});assert.equal(r.status,403);
r=await worker.fetch(req('/api/business-events'),env,{});assert.equal(r.status,403);
console.log('v78 1.21.13 runtime adversarial: PASS');
