import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {splitSqliteMigrationStatements} from '../scripts/sqlite-migration-statements.mjs';
import {createEmployeeDispatchD1Admission} from '../cloudflare/src/employee-dispatch-d1-admission.js';
import {createEmployeeDispatchD1Preflight} from '../cloudflare/src/employee-dispatch-d1-preflight.js';
import {createEmployeeProposalReviewD1Store} from '../cloudflare/src/employee-proposal-review-d1-store.js';
import {generateEmployeeWorkflowReviews} from '../cloudflare/src/employee-workflow-review-generation.js';

test('actual workerd D1 preflight denies stale or unapproved provenance without effects',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local D1 preflight")}}',compatibilityDate:'2026-09-03',d1Databases:{DB:'employee-dispatch-preflight-local'}}));
 t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB');
 const canonical=splitSqliteMigrationStatements(readFileSync('cloudflare/schema.sql','utf8'));
 const base=canonical.map(s=>s.replace(/--[^\n]*/g,'').trim()).filter(s=>/^CREATE TABLE IF NOT EXISTS (tenants|users|memberships|employees)\(/.test(s));
 assert.equal(base.length,4);
 for(const statement of base)await db.prepare(statement).run();
 for(const name of ['20261021_employee_ai_workflows.sql','20261021_employee_ai_proposal_reviews.sql','20261022_employee_ai_proposal_provenance.sql']){
  for(const statement of splitSqliteMigrationStatements(readFileSync('cloudflare/migrations/'+name,'utf8')))await db.prepare(statement).run();
 }
 const workflow={id:'w1',name:'Onboarding reviews',routineType:'onboarding_checklist',trigger:'manual',effect:'propose_internal_task',enabled:true};
 await db.batch([
  db.prepare("INSERT INTO tenants(id,name) VALUES('t1','Synthetic tenant')"),
  db.prepare("INSERT INTO users(id,email) VALUES('author','author@example.test'),('manager','manager@example.test')"),
  db.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES('t1','author','owner','active'),('t1','manager','manager','active')"),
  db.prepare("INSERT INTO employees(id,tenant_id,full_name,start_date,status) VALUES('e1','t1','Synthetic employee','2026-11-01','active')"),
  db.prepare("INSERT INTO employee_ai_workflows(tenant_id,owner_id,workflow_id,definition) VALUES('t1','author','w1',?)").bind(JSON.stringify(workflow))
 ]);
 const generated=await generateEmployeeWorkflowReviews({db,tenantId:'t1',ownerId:'author',today:'2026-10-22'});
 assert.equal(generated.inserted,1);
 const saved=await db.prepare('SELECT proposal_key FROM employee_ai_proposal_provenance').first();
 const preflight=createEmployeeDispatchD1Preflight(db);
 const controls={tenantId:'t1',proposalKey:saved.proposal_key,featureEnabled:true,killSwitch:false,auditAvailable:true};
 assert.equal((await preflight.check(controls)).eligible,false,'unapproved provenance');
 const reviews=createEmployeeProposalReviewD1Store(db);
 assert.equal(await reviews.decide({tenantId:'t1',proposalKey:saved.proposal_key,reviewerId:'manager',decision:'approved',reviewedAt:'2026-10-22T20:00:00.000Z'}),true);
 for(const statement of splitSqliteMigrationStatements(readFileSync('db/drafts/employee-dispatch-d1-intent.sql','utf8'))) { const executable=statement.replace(/--[^\n]*/g,'').trim(); if(executable) await db.prepare(executable).run(); }
 const admission=createEmployeeDispatchD1Admission(db);
 const admit={...controls,dispatchId:'dispatch-00000000001',idempotencyKey:'idem-000000000000001',actorId:'author',action:'internal.task.create'};
 assert.equal((await admission.admit({...admit,featureEnabled:false})).ok,false,'default-off');
 assert.equal((await admission.admit({...admit,actorId:'manager'})).ok,false,'manager cannot grant owner admission');
 assert.equal((await admission.admit({...admit,tenantId:'other-tenant'})).ok,false,'tenant isolation');
 assert.equal((await admission.admit(admit)).ok,true,'approved intent admitted');
 assert.equal((await admission.admit({...admit,dispatchId:'dispatch-00000000002'})).ok,false,'duplicate idempotency');
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM employee_dispatch_d1_intents').first()).n,1);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM employee_dispatch_d1_audit').first()).n,1);
 // Concurrent duplicate admissions must never produce a second durable intent.
 const race=await Promise.all([
  admission.admit({...admit,dispatchId:'dispatch-00000000003',idempotencyKey:'idem-concurrent-000001'}),
  admission.admit({...admit,dispatchId:'dispatch-00000000004',idempotencyKey:'idem-concurrent-000001'})
 ]);
 assert.equal(race.filter(x=>x.ok).length,1,'one concurrent winner');
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM employee_dispatch_d1_intents').first()).n,2);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM employee_dispatch_d1_audit').first()).n,2);
 // Denied admission must not leave an unaudited intent.
 await db.prepare("UPDATE memberships SET status='inactive' WHERE tenant_id='t1' AND user_id='manager'").run();
 assert.equal((await admission.admit({...admit,dispatchId:'dispatch-00000000005',idempotencyKey:'idem-revoked-00000001'})).ok,false);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM employee_dispatch_d1_intents').first()).n,2);
 await db.prepare("UPDATE memberships SET status='active' WHERE tenant_id='t1' AND user_id='manager'").run();

 const approved=await preflight.check(controls);
 assert.equal(approved.eligible,true);
 assert.equal(approved.reason,'snapshot_only_no_execution_authority');
 assert.equal((await preflight.check({...controls,tenantId:'another-tenant'})).eligible,false);
 await db.prepare("UPDATE memberships SET status='inactive' WHERE tenant_id='t1' AND user_id='manager'").run();
 assert.equal((await preflight.check(controls)).eligible,false,'reviewer deactivation must deny');
 await db.prepare("UPDATE memberships SET status='active' WHERE tenant_id='t1' AND user_id='manager'").run();
 await db.prepare("UPDATE memberships SET status='inactive' WHERE tenant_id='t1' AND user_id='author'").run();
 assert.equal((await preflight.check(controls)).eligible,false,'inactive author must deny');
 await db.prepare("UPDATE memberships SET status='active' WHERE tenant_id='t1' AND user_id='author'").run();
 await db.prepare("UPDATE employees SET status='inactive' WHERE tenant_id='t1' AND id='e1'").run();
 assert.equal((await preflight.check(controls)).eligible,false,'inactive employee must deny');
 await db.prepare("UPDATE employees SET status='active' WHERE tenant_id='t1' AND id='e1'").run();
 assert.equal((await preflight.check(controls)).eligible,true,'restored eligibility');
 await db.prepare("UPDATE employee_ai_workflows SET definition=? WHERE tenant_id='t1' AND owner_id='author' AND workflow_id='w1'").bind(JSON.stringify({...workflow,name:'Changed'})).run();
 assert.equal((await preflight.check(controls)).eligible,false,'changed workflow must deny');
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM employee_ai_proposal_provenance').first()).n,1,'no dispatch side effects');
});
