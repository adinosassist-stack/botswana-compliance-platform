import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {splitSqliteMigrationStatements} from '../scripts/sqlite-migration-statements.mjs';
import {createEmployeeProposalReviewD1Store} from '../cloudflare/src/employee-proposal-review-d1-store.js';
import {prepareEmployeeProposalTask} from '../cloudflare/src/agentic-task-execution.js';
import {workflow,proposal} from './helpers/employee-provenance-d1.mjs';

test('actual D1 prepares, replays and rolls back the guarded task batch without executing',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local task preparation contract")}}',compatibilityDate:'2026-09-03',d1Databases:{DB:'employee-task-preparation-local'}}));
 t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');
 const base=splitSqliteMigrationStatements(readFileSync('cloudflare/schema.sql','utf8')).map(statement=>statement.replace(/--[^\n]*/g,'').trim()).filter(statement=>/^CREATE TABLE IF NOT EXISTS (tenants|users|memberships|employees|audit_events|agentic_runs|agentic_proposals)\(/.test(statement));
 assert.equal(base.length,7);for(const statement of base)await db.prepare(statement).run();
 for(const file of ['047_v81_delegated_authority.sql','048_v102_bounded_internal_task_execution.sql','064_v217_jit_execution_permits.sql','20261021_employee_ai_workflows.sql','20261021_employee_ai_proposal_reviews.sql','20261022_employee_ai_proposal_provenance.sql']){
  for(const statement of splitSqliteMigrationStatements(readFileSync('cloudflare/migrations/'+file,'utf8')))await db.prepare(statement).run();
 }
 await db.batch([
  db.prepare("INSERT INTO tenants(id,name) VALUES('t1','Synthetic tenant')"),
  db.prepare("INSERT INTO users(id,email) VALUES('author','author@example.test'),('manager','manager@example.test')"),
  db.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES('t1','author','owner','active'),('t1','manager','manager','active')"),
  db.prepare("INSERT INTO employees(id,tenant_id,full_name,start_date,status) VALUES('e1','t1','Synthetic employee','2026-11-01','active')"),
  db.prepare("INSERT INTO employee_ai_workflows(tenant_id,owner_id,workflow_id,definition) VALUES('t1','author','w1',?)").bind(JSON.stringify(workflow)),
  db.prepare("INSERT INTO agent_delegations(id,tenant_id,agent_key,action_key,max_autonomy_level,created_by_user_id,approved_by_user_id) VALUES('d1','t1','thebe','task.create',3,'author','author')"),
  db.prepare("INSERT INTO agent_execution_grants(id,tenant_id,delegation_id,action_key,approved_by_user_id) VALUES('g1','t1','d1','task.create','author')")
 ]);
 const store=createEmployeeProposalReviewD1Store(db);
 const seed=async definition=>{
  const {proposalKey}=await store.enqueueVersioned({tenantId:'t1',authorId:'author',sourceDefinition:JSON.stringify(definition),proposal:{...proposal,workflowName:definition.name}});
  await store.decide({tenantId:'t1',proposalKey,reviewerId:'manager',decision:'approved',reviewedAt:'2026-10-22T20:00:00.000Z'});return proposalKey;
 };
 const firstKey=await seed(workflow);
 const args={env:{DB:db,THEBE_EMPLOYEE_TASK_PREPARATION_ENABLED:'true'},auth:{tenant_id:'t1',user_id:'author',role:'owner'},delegationId:'d1',proposalKey:firstKey};
 const concurrent=await Promise.all(Array.from({length:4},()=>prepareEmployeeProposalTask(args)));
 assert.deepEqual(concurrent.map(response=>response.status).sort(),[200,200,200,201]);
 const first=concurrent.find(response=>response.status===201);const saved=await first.json();
 assert.equal(saved.approvalRequired,true);assert.equal(saved.execution.performed,false);
 const replay=await prepareEmployeeProposalTask(args);assert.equal(replay.status,200);assert.equal((await replay.json()).request.id,saved.request.id);
 const changed={...workflow,name:'Revised workflow'};
 await db.prepare('UPDATE employee_ai_workflows SET definition=?').bind(JSON.stringify(changed)).run();
 assert.equal((await prepareEmployeeProposalTask(args)).status,409);
 const nextKey=await seed(changed);const next={...args,proposalKey:nextKey};
 await db.prepare("CREATE TRIGGER fail_task_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'synthetic_task_audit_failure'); END").run();
 assert.equal((await prepareEmployeeProposalTask(next)).status,500);
 for(const table of ['agent_action_intents','agent_task_requests','audit_events'])assert.equal((await db.prepare('SELECT COUNT(*) n FROM '+table).first()).n,1,table+' rolls back');
 await db.prepare('DROP TRIGGER fail_task_audit').run();
 // Mutate after the service read, immediately before its real D1 transaction.
 const racedDb={prepare:sql=>db.prepare(sql),async batch(statements){await db.prepare("UPDATE memberships SET status='inactive' WHERE user_id='manager'").run();return db.batch(statements)}};
 assert.equal((await prepareEmployeeProposalTask({...next,env:{...args.env,DB:racedDb}})).status,409);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM agent_task_requests').first()).n,1);
 await db.prepare("UPDATE memberships SET status='active' WHERE user_id='manager'").run();
 assert.equal((await prepareEmployeeProposalTask(next)).status,201);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM agent_task_requests').first()).n,2);
 for(const table of ['agent_internal_tasks','agent_jit_execution_permits','agent_execution_receipts'])assert.equal((await db.prepare('SELECT COUNT(*) n FROM '+table).first()).n,0);
});
