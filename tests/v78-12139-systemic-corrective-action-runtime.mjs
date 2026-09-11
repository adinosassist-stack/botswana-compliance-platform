import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../cloudflare/src/worker.js';

class St{
  constructor(db,sql){this.db=db;this.sql=sql;this.args=[]}
  bind(...a){this.args=a;return this}
  first(){const r=this.db.prepare(this.sql).get(...this.args);return r?{...r}:null}
  all(){return {results:this.db.prepare(this.sql).all(...this.args).map(r=>({...r}))}}
  run(){const r=this.db.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes||0)}}}
}
class D1{
  constructor(db){this.db=db}
  prepare(sql){return new St(this.db,sql)}
  batch(ss){this.db.exec('BEGIN IMMEDIATE');try{const r=ss.map(s=>s.run());this.db.exec('COMMIT');return r}catch(e){this.db.exec('ROLLBACK');throw e}}
}

const sqlite=new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));
const DB=new D1(sqlite);
const secret='v78-12139-runtime-secret',raw='session-token',csrf='csrf-token',hash=createHmac('sha256',secret).update(raw).digest('hex');

sqlite.prepare('INSERT INTO tenants(id,name) VALUES(?,?)').run('t1','Tenant One');
sqlite.prepare('INSERT INTO users(id,email,display_name) VALUES(?,?,?)').run('u1','owner@example.com','Owner One');
sqlite.prepare('INSERT INTO users(id,email,display_name) VALUES(?,?,?)').run('u2','manager@example.com','Manager Two');
sqlite.prepare('INSERT INTO users(id,email,display_name) VALUES(?,?,?)').run('u3','reviewer@example.com','Reviewer Three');
sqlite.prepare('INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,?,?)').run('t1','u1','owner','active');
sqlite.prepare('INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,?,?)').run('t1','u2','manager','active');
sqlite.prepare('INSERT INTO memberships(tenant_id,user_id,role,status) VALUES(?,?,?,?)').run('t1','u3','reviewer','active');
sqlite.prepare("INSERT INTO sessions(token_hash,user_id,tenant_id,role,csrf_token,expires_at) VALUES(?,?,?,?,?,datetime('now','+1 day'))").run(hash,'u1','t1','owner',csrf);
sqlite.prepare("INSERT INTO regulatory_rules(id,rule_key,version,title,summary,status) VALUES('rule1','test.corrective',1,'Corrective test rule','Runtime test rule','published')").run();
sqlite.prepare("INSERT INTO compliance_obligations(id,tenant_id,rule_id,obligation_key,title,due_at,status,priority) VALUES('obl1','t1','rule1','runtime-corrective-obligation','Submit runtime statutory return',date('now','-1 day'),'open',1)").run();

const env={DB,SESSION_SECRET:secret,AUDIT_INTEGRITY_SECRET:'audit-secret',PUBLIC_ORIGIN:'https://app.example',PUBLIC_APP_URL:'https://app.example'};
const req=(path,o={})=>new Request(`https://app.example${path}`,{...o,headers:{cookie:`__Host-bw_session=${raw}`,'x-csrf-token':csrf,'content-type':'application/json',...(o.headers||{})}});
async function jsonReq(path,o={}){const r=await worker.fetch(req(path,o),env,{});const body=await r.json().catch(()=>({}));return {r,body}}
const future=d=>new Date(Date.now()+d*86400000).toISOString();

let q=await jsonReq('/api/executive-exceptions');assert.equal(q.r.status,200);
const ex=q.body.items.find(x=>x.key==='obligation:obl1');assert.ok(ex);

q=await jsonReq('/api/executive-interventions',{method:'POST',body:JSON.stringify({exceptionKey:'obligation:obl1',decision:'Recover filing',note:'Owner will correct the missed filing and verify the source record.',recoveryDueAt:future(2),attestation:true})});
assert.equal(q.r.status,200);const iid=q.body.id;assert.ok(iid);

// Two later recovery targets create the recurring-extension pattern.
for(const d of [3,4]){
  q=await jsonReq('/api/executive-interventions',{method:'POST',body:JSON.stringify({exceptionKey:'obligation:obl1',decision:'Extend recovery',note:`Recovery target moved to day ${d} with management rationale recorded.`,recoveryDueAt:future(d),attestation:true})});
  assert.equal(q.r.status,200);
}
let ir=sqlite.prepare('SELECT * FROM executive_exception_interventions WHERE id=?').get(iid);
assert.equal(ir.recovery_extension_count,2);

q=await jsonReq('/api/executive-exceptions');assert.equal(q.r.status,200);
let acc=q.body.accountability;let ai=acc.items.find(x=>x.interventionId===iid);
assert.ok(ai);assert.equal(ai.correctiveActionRequired,true);assert.equal(ai.correctiveAction,null);
assert.equal(acc.counts.correctiveActionsRequired,1);
assert.equal(acc.correctiveActionPolicy.maxTargetExtensions,1);
assert.equal(acc.correctiveActionPolicy.noEmployeeScoring,true);

// Reviewers cannot access leadership corrective-action endpoints.
sqlite.prepare("UPDATE sessions SET user_id='u3',role='reviewer' WHERE token_hash=?").run(hash);
q=await jsonReq('/api/executive-corrective-actions');assert.equal(q.r.status,403);
q=await jsonReq('/api/executive-corrective-actions',{method:'POST',body:JSON.stringify({interventionId:iid,rootCause:'The filing workflow has no authority-confirmation checkpoint.',correctiveAction:'Add a mandatory filing confirmation checkpoint and same-day ownership review.',targetDueAt:future(8),attestation:true})});assert.equal(q.r.status,403);

// Manager who does not own the intervention cannot take the corrective action.
sqlite.prepare("UPDATE sessions SET user_id='u2',role='manager' WHERE token_hash=?").run(hash);
q=await jsonReq('/api/executive-corrective-actions',{method:'POST',body:JSON.stringify({interventionId:iid,rootCause:'The filing workflow has no authority-confirmation checkpoint.',correctiveAction:'Add a mandatory filing confirmation checkpoint and same-day ownership review.',targetDueAt:future(8),attestation:true})});
assert.equal(q.r.status,403);assert.equal(q.body.error,'intervention_owned_by_another_manager');

// Owner creates a systemic corrective action.
sqlite.prepare("UPDATE sessions SET user_id='u1',role='owner' WHERE token_hash=?").run(hash);
q=await jsonReq('/api/executive-corrective-actions',{method:'POST',body:JSON.stringify({interventionId:iid,rootCause:'The filing workflow has no mandatory authority-confirmation checkpoint after submission.',correctiveAction:'Add a mandatory filing confirmation checkpoint, named backup owner and daily exception review.',targetDueAt:future(8),attestation:true})});
assert.equal(q.r.status,201);const cid=q.body.id;assert.ok(cid);

let ca=sqlite.prepare('SELECT * FROM executive_corrective_actions WHERE id=?').get(cid);
assert.equal(ca.status,'open');assert.equal(ca.owner_user_id,'u1');assert.equal(ca.target_extension_count,0);
assert.match(ca.root_cause,/confirmation checkpoint/);assert.match(ca.corrective_action,/backup owner/);

q=await jsonReq('/api/executive-exceptions');assert.equal(q.r.status,200);
acc=q.body.accountability;ai=acc.items.find(x=>x.interventionId===iid);assert.ok(ai.correctiveAction);assert.equal(ai.correctiveAction.status,'open');assert.equal(ai.correctiveActionRequired,false);
assert.equal(acc.counts.openCorrectiveActions,1);

// An open corrective action cannot be closed while the underlying intervention is unresolved.
q=await jsonReq(`/api/executive-corrective-actions/${cid}/close`,{method:'POST',body:JSON.stringify({closureEvidence:'Updated SOP and control test reference CA-001.',closureNote:'The new filing confirmation control has been implemented and tested.',successCriteria:'No confirmation checkpoint is missed during the monitoring period.',monitoringDays:14,attestation:true})});
assert.equal(q.r.status,409);assert.equal(q.body.error,'underlying_intervention_not_closed');

// A manager acting as the same user cannot extend the corrective target; only account-owner authority may do so.
sqlite.prepare("UPDATE memberships SET role='manager' WHERE tenant_id='t1' AND user_id=(SELECT user_id FROM sessions WHERE token_hash=?)").run(hash);
q=await jsonReq('/api/executive-corrective-actions',{method:'POST',body:JSON.stringify({interventionId:iid,rootCause:'The filing workflow has no mandatory authority-confirmation checkpoint after submission.',correctiveAction:'Add a mandatory filing confirmation checkpoint, named backup owner and daily exception review.',targetDueAt:future(9),extensionReason:'Testing manager extension guard.',attestation:true})});
assert.equal(q.r.status,403);assert.equal(q.body.error,'corrective_target_extension_owner_only');

// Owner may extend the corrective target once, with a recorded reason.
sqlite.prepare("UPDATE memberships SET role='owner' WHERE tenant_id='t1' AND user_id=(SELECT user_id FROM sessions WHERE token_hash=?)").run(hash);
q=await jsonReq('/api/executive-corrective-actions',{method:'POST',body:JSON.stringify({interventionId:iid,rootCause:'The filing workflow has no mandatory authority-confirmation checkpoint after submission.',correctiveAction:'Add a mandatory filing confirmation checkpoint, named backup owner and daily exception review.',targetDueAt:future(9),extensionReason:'External control-owner availability requires one documented target extension.',attestation:true})});
assert.equal(q.r.status,200);assert.equal(q.body.targetExtended,true);
ca=sqlite.prepare('SELECT * FROM executive_corrective_actions WHERE id=?').get(cid);assert.equal(ca.target_extension_count,1);

// A second extension is rejected.
q=await jsonReq('/api/executive-corrective-actions',{method:'POST',body:JSON.stringify({interventionId:iid,rootCause:'The filing workflow has no mandatory authority-confirmation checkpoint after submission.',correctiveAction:'Add a mandatory filing confirmation checkpoint, named backup owner and daily exception review.',targetDueAt:future(10),extensionReason:'Attempting another extension must be blocked.',attestation:true})});
assert.equal(q.r.status,409);assert.equal(q.body.error,'corrective_target_extension_limit');

// Resolve the underlying obligation and close the intervention first.
sqlite.prepare("UPDATE compliance_obligations SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE id='obl1'").run();
q=await jsonReq('/api/executive-exceptions');assert.equal(q.r.status,200);
ir=sqlite.prepare('SELECT * FROM executive_exception_interventions WHERE id=?').get(iid);assert.equal(ir.status,'ready_to_close');

q=await jsonReq(`/api/executive-interventions/${iid}/close`,{method:'POST',body:JSON.stringify({closureEvidence:'Authority receipt REF-123 confirms the statutory filing was completed.',closureNote:'The underlying filing exception is cleared and verified.',attestation:true})});
assert.equal(q.r.status,200);assert.equal(q.body.status,'closed');

// Now the systemic corrective action can close with root-cause remediation evidence.
q=await jsonReq(`/api/executive-corrective-actions/${cid}/close`,{method:'POST',body:JSON.stringify({closureEvidence:'SOP v2 approved; confirmation checkpoint tested in control run TEST-CA-001.',closureNote:'The filing process now requires confirmation evidence and backup ownership before closure.',successCriteria:'No confirmation checkpoint is missed during the effectiveness monitoring period.',monitoringDays:14,attestation:true})});
assert.equal(q.r.status,200);assert.equal(q.body.status,'closed');assert.equal(q.body.verification.underlyingInterventionClosed,true);

ca=sqlite.prepare('SELECT * FROM executive_corrective_actions WHERE id=?').get(cid);assert.equal(ca.status,'closed');assert.ok(ca.closure_counts_json);assert.match(ca.closure_evidence,/SOP v2/);

// Closed corrective action resolves the current recurring pattern snapshot.
q=await jsonReq('/api/executive-exceptions');assert.equal(q.r.status,200);
acc=q.body.accountability;ai=acc.items.find(x=>x.interventionId===iid);assert.ok(ai);assert.equal(ai.correctiveActionResolved,true);assert.equal(ai.correctiveActionRequired,false);assert.equal(ai.correctiveAction.status,'closed');
assert.equal(acc.counts.resolvedCorrectiveActions,1);

// Duplicate corrective action is blocked while the closed snapshot still covers current counts.
q=await jsonReq('/api/executive-corrective-actions',{method:'POST',body:JSON.stringify({interventionId:iid,rootCause:'Duplicate action should not be opened for the same unchanged pattern.',correctiveAction:'This duplicate action must be rejected while the closure snapshot still covers counts.',targetDueAt:future(8),attestation:true})});
assert.equal(q.r.status,409);assert.equal(q.body.error,'corrective_action_already_resolved_for_current_pattern');

// Simulate a later recurrence by advancing a durable recurring-pattern counter.
sqlite.prepare("UPDATE executive_exception_interventions SET reopen_count=reopen_count+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(iid);
q=await jsonReq('/api/executive-exceptions');assert.equal(q.r.status,200);
acc=q.body.accountability;ai=acc.items.find(x=>x.interventionId===iid);assert.ok(ai);assert.equal(ai.correctiveActionRequired,true);assert.equal(ai.correctiveActionReopenedNeeded,true);assert.equal(ai.correctiveAction,null);

// A fresh corrective action may now be opened for the new recurrence.
q=await jsonReq('/api/executive-corrective-actions',{method:'POST',body:JSON.stringify({interventionId:iid,rootCause:'A later recurrence shows the original control needs a second systemic remediation cycle.',correctiveAction:'Add independent monthly control testing and escalation if confirmation evidence is missing.',targetDueAt:future(12),attestation:true})});
assert.equal(q.r.status,201);assert.notEqual(q.body.id,cid);

// History remains leadership-only and contains no email data.
q=await jsonReq('/api/executive-corrective-actions');assert.equal(q.r.status,200);assert.ok(q.body.items.length>=2);assert.equal(q.body.policy.noEmployeeScoring,true);assert.equal(q.body.policy.noManagerRanking,true);assert.equal(JSON.stringify(q.body).includes('owner@example.com'),false);

// Corrective actions do not create routine notifications.
const outboxCount=sqlite.prepare('SELECT count(*) n FROM notification_outbox').get().n;assert.equal(Number(outboxCount),0);

// Reviewer remains denied after the full lifecycle.
sqlite.prepare("UPDATE sessions SET user_id='u3',role='reviewer' WHERE token_hash=?").run(hash);
q=await jsonReq('/api/executive-corrective-actions');assert.equal(q.r.status,403);
q=await jsonReq('/api/executive-exceptions');assert.equal(q.r.status,403);

console.log('v78 1.21.39 systemic corrective-action runtime: PASS');
