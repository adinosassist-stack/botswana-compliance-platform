import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {splitSqliteMigrationStatements} from '../scripts/sqlite-migration-statements.mjs';
import {createEmployeeProposalReviewD1Store} from '../cloudflare/src/employee-proposal-review-d1-store.js';
import {generateEmployeeWorkflowReviews} from '../cloudflare/src/employee-workflow-review-generation.js';

test('actual local D1 binding preserves provenance atomicity, replay and stale-source checks',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local provenance contract")}}',compatibilityDate:'2026-09-03',d1Databases:{DB:'employee-provenance-local'}}));
 t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB');
 const canonical=splitSqliteMigrationStatements(readFileSync('cloudflare/schema.sql','utf8'));
 const base=canonical.map(statement=>statement.replace(/--[^\n]*/g,'').trim()).filter(statement=>/^CREATE TABLE IF NOT EXISTS (tenants|users|memberships|employees)\(/.test(statement));
 assert.equal(base.length,4,'use the actual production definitions of required base tables');
 for(const statement of base)await db.prepare(statement).run();
 for(const file of ['20261021_employee_ai_workflows.sql','20261021_employee_ai_proposal_reviews.sql','20261022_employee_ai_proposal_provenance.sql']){
  for(const statement of splitSqliteMigrationStatements(readFileSync('cloudflare/migrations/'+file,'utf8')))await db.prepare(statement).run();
 }
 const workflow={id:'w1',name:'Onboarding reviews',routineType:'onboarding_checklist',trigger:'manual',effect:'propose_internal_task',enabled:true};
 await db.batch([
  db.prepare("INSERT INTO tenants(id,name) VALUES('t1','Synthetic tenant')"),
  db.prepare("INSERT INTO users(id,email) VALUES('author','author@example.test'),('manager','manager@example.test')"),
  db.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES('t1','author','owner','active'),('t1','manager','manager','active')"),
  db.prepare("INSERT INTO employees(id,tenant_id,full_name,start_date,status) VALUES('e1','t1','Synthetic employee','2026-11-01','active')"),
  db.prepare("INSERT INTO employee_ai_workflows(tenant_id,owner_id,workflow_id,definition) VALUES('t1','author','w1',?)").bind(JSON.stringify(workflow))
 ]);
 const args={db,tenantId:'t1',ownerId:'author',today:'2026-10-22'};
 assert.deepEqual(await generateEmployeeWorkflowReviews(args),{ok:true,generated:1,inserted:1,duplicateCount:0,executed:0});
 assert.equal((await generateEmployeeWorkflowReviews(args)).duplicateCount,1);
 const saved=await db.prepare('SELECT proposal_key,author_id FROM employee_ai_proposal_provenance').first();
 assert.equal(saved.author_id,'author');
 const store=createEmployeeProposalReviewD1Store(db);
 assert.equal(await store.decide({tenantId:'t1',proposalKey:saved.proposal_key,reviewerId:'manager',decision:'approved',reviewedAt:'2026-10-22T20:00:00.000Z'}),true);
 assert.equal((await store.loadApprovedProvenance({tenantId:'t1',proposalKey:saved.proposal_key})).authorId,'author');
 await db.prepare("INSERT INTO employees(id,tenant_id,full_name,start_date,status) VALUES('e2','t1','Second synthetic employee','2026-11-01','active')").run();
 await db.prepare("CREATE TRIGGER fail_provenance BEFORE INSERT ON employee_ai_proposal_provenance BEGIN SELECT RAISE(ABORT,'synthetic_provenance_outage'); END").run();
 await assert.rejects(generateEmployeeWorkflowReviews(args),/synthetic_provenance_outage/);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM employee_ai_proposal_reviews').first()).n,1,'failed D1 batch must roll back the second review');
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM employee_ai_proposal_provenance').first()).n,1);
 await db.prepare('DROP TRIGGER fail_provenance').run();
 await db.prepare('UPDATE employee_ai_workflows SET definition=?').bind(JSON.stringify({...workflow,name:'Updated onboarding reviews'})).run();
 assert.equal(await store.loadApprovedProvenance({tenantId:'t1',proposalKey:saved.proposal_key}),null);
 assert.equal((await generateEmployeeWorkflowReviews(args)).inserted,2,'changed workflow requires new review keys for both employees');
});
