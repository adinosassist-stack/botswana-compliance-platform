import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../cloudflare/src/worker.js';
class St{constructor(db,sql){this.db=db;this.sql=sql;this.args=[]}bind(...a){this.args=a;return this}first(){const r=this.db.prepare(this.sql).get(...this.args);return r?{...r}:null}all(){return {results:this.db.prepare(this.sql).all(...this.args).map(r=>({...r}))}}run(){const r=this.db.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes||0)}}}}
class D1{constructor(db){this.db=db}prepare(sql){return new St(this.db,sql)}batch(ss){this.db.exec('BEGIN IMMEDIATE');try{const r=ss.map(s=>s.run());this.db.exec('COMMIT');return r}catch(e){this.db.exec('ROLLBACK');throw e}}}
const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));const DB=new D1(sqlite);
const secret='v78-12138-runtime-secret',raw='session-token',csrf='csrf-token',hash=createHmac('sha256',secret).update(raw).digest('hex');
sqlite.prepare('INSERT INTO tenants(id,name) VALUES(?,?)').run('t1','Tenant One');
sqlite.prepare('INSERT INTO users(id,email,display_name) VALUES(?,?,?)').run('u1','owner@example.com','Owner One');
sqlite.prepare('INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,?,?)').run('t1','u1','owner','active');
sqlite.prepare("INSERT INTO sessions(token_hash,user_id,tenant_id,role,csrf_token,expires_at) VALUES(?,?,?,?,?,datetime('now','+1 day'))").run(hash,'u1','t1','owner',csrf);
sqlite.prepare("INSERT INTO regulatory_rules(id,rule_key,version,title,summary,status) VALUES('rule1','test.accountability',1,'Accountability test rule','Runtime test rule','published')").run();
sqlite.prepare("INSERT INTO compliance_obligations(id,tenant_id,rule_id,obligation_key,title,due_at,status,priority) VALUES('obl1','t1','rule1','runtime-obligation','Submit runtime statutory return',date('now','-1 day'),'open',1)").run();
const env={DB,SESSION_SECRET:secret,AUDIT_INTEGRITY_SECRET:'audit-secret',PUBLIC_ORIGIN:'https://app.example',PUBLIC_APP_URL:'https://app.example'};
const req=(path,o={})=>new Request(`https://app.example${path}`,{...o,headers:{cookie:`__Host-bw_session=${raw}`,'x-csrf-token':csrf,'content-type':'application/json',...(o.headers||{})}});
async function jsonReq(path,o={}){const r=await worker.fetch(req(path,o),env,{});const body=await r.json().catch(()=>({}));return {r,body}}
let q=await jsonReq('/api/executive-exceptions');assert.equal(q.r.status,200);const ex=q.body.items.find(x=>x.key==='obligation:obl1');assert.ok(ex,'missed statutory obligation should be a leadership exception');
const future=d=>new Date(Date.now()+d*86400000).toISOString();
q=await jsonReq('/api/executive-interventions',{method:'POST',body:JSON.stringify({exceptionKey:'obligation:obl1',decision:'Recover filing',note:'Owner will correct the missed filing and verify the source record.',recoveryDueAt:future(2),attestation:true})});assert.equal(q.r.status,200);const iid=q.body.id;assert.ok(iid);
for(const d of [3,4]){q=await jsonReq('/api/executive-interventions',{method:'POST',body:JSON.stringify({exceptionKey:'obligation:obl1',decision:'Extend recovery',note:`Recovery target moved to day ${d} with management rationale recorded.`,recoveryDueAt:future(d),attestation:true})});assert.equal(q.r.status,200)}
let row=sqlite.prepare('SELECT * FROM executive_exception_interventions WHERE id=?').get(iid);assert.equal(row.recovery_extension_count,2,'two later recovery targets should count as two extensions');
for(const [status,note] of [['blocked','Blocked by missing external filing confirmation.'],['on_track','External confirmation requested and recovery work resumed.'],['blocked','Blocked again because the authority confirmation is still unavailable.']]){q=await jsonReq(`/api/executive-interventions/${iid}/progress`,{method:'POST',body:JSON.stringify({progressStatus:status,progressNote:note})});assert.equal(q.r.status,200)}
row=sqlite.prepare('SELECT * FROM executive_exception_interventions WHERE id=?').get(iid);assert.equal(row.blocked_checkpoint_count,2,'two distinct blocked episodes should count');
// A missed target is counted once even when the dashboard is first opened after the miss.
sqlite.prepare("UPDATE executive_exception_interventions SET recovery_due_at=datetime('now','-2 day'),last_missed_recovery_due_at=NULL WHERE id=?").run(iid);
q=await jsonReq('/api/executive-exceptions');assert.equal(q.r.status,200);row=sqlite.prepare('SELECT * FROM executive_exception_interventions WHERE id=?').get(iid);assert.equal(row.missed_recovery_count,1);const firstMiss=row.last_missed_recovery_due_at;
q=await jsonReq('/api/executive-exceptions');assert.equal(q.r.status,200);row=sqlite.prepare('SELECT * FROM executive_exception_interventions WHERE id=?').get(iid);assert.equal(row.missed_recovery_count,1,'same missed target must not double count');assert.equal(row.last_missed_recovery_due_at,firstMiss);
// Extending an already recorded missed target must not erase or duplicate it.
q=await jsonReq('/api/executive-interventions',{method:'POST',body:JSON.stringify({exceptionKey:'obligation:obl1',decision:'Second recovery plan',note:'Management records a fresh recovery commitment after the first target was missed.',recoveryDueAt:future(1),attestation:true})});assert.equal(q.r.status,200);row=sqlite.prepare('SELECT * FROM executive_exception_interventions WHERE id=?').get(iid);assert.equal(row.missed_recovery_count,1);
// A distinct later target can be missed and counted once.
sqlite.prepare("UPDATE executive_exception_interventions SET recovery_due_at=datetime('now','-1 hour') WHERE id=?").run(iid);
q=await jsonReq('/api/executive-exceptions');assert.equal(q.r.status,200);row=sqlite.prepare('SELECT * FROM executive_exception_interventions WHERE id=?').get(iid);assert.equal(row.missed_recovery_count,2);
// Reappearing after a ready-to-close state is a durable reopen, not a silent reset.
for(let i=0;i<2;i++){sqlite.prepare("UPDATE executive_exception_interventions SET status='ready_to_close',underlying_cleared_at=CURRENT_TIMESTAMP WHERE id=?").run(iid);q=await jsonReq('/api/executive-exceptions');assert.equal(q.r.status,200)}
row=sqlite.prepare('SELECT * FROM executive_exception_interventions WHERE id=?').get(iid);assert.equal(row.reopen_count,2);assert.equal(row.status,'claimed');
q=await jsonReq('/api/executive-exceptions');assert.equal(q.r.status,200);const acc=q.body.accountability;assert.equal(acc.policy.noEmployeeScoring,true);assert.equal(acc.policy.noManagerRanking,true);assert.equal(acc.policy.interventionLevelOnly,true);const ai=acc.items.find(x=>x.interventionId===iid);assert.ok(ai,'repeated execution patterns should appear in accountability');assert.equal(ai.severity,'critical');assert.ok(ai.patterns.some(x=>x.kind==='repeated_extensions'));assert.ok(ai.patterns.some(x=>x.kind==='repeated_blocks'));assert.ok(ai.patterns.some(x=>x.kind==='repeated_reopens'));assert.ok(ai.patterns.some(x=>x.kind==='repeated_missed_commitments'));assert.equal(ai.ownerName,'Owner One');assert.equal('email' in ai,false);
// History exposes the intervention-level accountability snapshot without contact data.
q=await jsonReq('/api/executive-interventions');assert.equal(q.r.status,200);const hi=q.body.items.find(x=>x.id===iid);assert.ok(hi.accountability);assert.equal(q.body.policy.noEmployeeScoring,true);assert.equal(q.body.policy.noManagerRanking,true);assert.equal(JSON.stringify(q.body).includes('owner@example.com'),false);
// Reviewers cannot read leadership accountability endpoints.
sqlite.prepare("UPDATE memberships SET role='reviewer' WHERE tenant_id='t1' AND user_id=(SELECT user_id FROM sessions WHERE token_hash=?)").run(hash);
q=await jsonReq('/api/executive-exceptions');assert.equal(q.r.status,403);q=await jsonReq('/api/executive-interventions');assert.equal(q.r.status,403);
console.log('v78 1.21.38 management accountability runtime: PASS');
