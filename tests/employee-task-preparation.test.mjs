import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {fixture,workflow,proposal} from './helpers/employee-provenance-d1.mjs';
import {createEmployeeProposalReviewD1Store} from '../cloudflare/src/employee-proposal-review-d1-store.js';
import {handleEmployeeProposalReviewRequest as handle} from '../cloudflare/src/employee-proposal-review-api.js';

async function setup(t,{reviewer='manager',decision='approved'}={}){
 const f=fixture();t.after(f.close);
 for(const file of ['047_v81_delegated_authority.sql','064_v217_jit_execution_permits.sql'])f.sql.exec(readFileSync('cloudflare/migrations/'+file,'utf8'));
 f.sql.exec(`INSERT INTO agent_delegations(id,tenant_id,agent_key,action_key,max_autonomy_level,created_by_user_id,approved_by_user_id)
 VALUES('d1','t1','thebe','task.create',3,'author','author');
 INSERT INTO agent_execution_grants(id,tenant_id,delegation_id,action_key,approved_by_user_id) VALUES('g1','t1','d1','task.create','author');`);
 const store=createEmployeeProposalReviewD1Store(f.db);
 const {proposalKey}=await store.enqueueVersioned({tenantId:'t1',authorId:'author',sourceDefinition:JSON.stringify(workflow),proposal});
 if(decision)await store.decide({tenantId:'t1',proposalKey,reviewerId:reviewer,decision,reviewedAt:'2026-10-22T20:00:00.000Z'});
 const env={DB:f.db,THEBE_EMPLOYEE_TASK_PREPARATION_ENABLED:'true'};
 const call=async(body={},options={})=>handle({req:{method:'POST'},env,session:{tenant_id:'t1',user_id:'author',role:'owner'},readJson:async()=>({action:'prepare_task',proposalKey,delegationId:'d1',...body}),roleAllowed:(auth,...roles)=>roles.includes(auth.role),...options});
 return {...f,env,call,proposalKey};
}
const count=(f,table)=>f.sql.prepare('SELECT COUNT(*) n FROM '+table).get().n;
function noWrites(f){for(const table of ['agent_action_intents','agent_task_requests','agent_internal_tasks','agent_jit_execution_permits','agent_execution_receipts'])assert.equal(count(f,table),0,table);}

test('approved employee proposal prepares one exact task, with retry-safe audit linkage and no execution',async t=>{
 const f=await setup(t);const response=await f.call();assert.equal(response.status,201);
 const body=await response.json();assert.equal(body.approvalRequired,true);assert.equal(body.execution.performed,false);
 assert.deepEqual(body.request.payload,{title:proposal.title,description:'Employee: e1. Workflow: Onboarding reviews.',priority:2,dueAt:'2026-11-01T00:00:00.000Z'});
 const row=f.sql.prepare('SELECT * FROM agent_task_requests').get();assert.equal(row.status,'prepared');assert.equal(row.approved_by_user_id,null);assert.equal(row.approved_payload_hash,null);
 const intent=f.sql.prepare('SELECT * FROM agent_action_intents').get();assert.equal(intent.proposal_id,null);assert.equal(intent.mode,'shadow');assert.equal(intent.decision,'review_required');
 const audit=JSON.parse(f.sql.prepare("SELECT event_data FROM audit_events WHERE event_type='AGENT_TASK_PREPARED'").get().event_data);
 assert.equal(audit.employeeProposal.proposalKey,f.proposalKey);assert.equal(audit.employeeProposal.reviewerId,'manager');
 const replay=await f.call();assert.equal(replay.status,200);assert.equal((await replay.json()).request.id,row.id);
 assert.equal(count(f,'agent_task_requests'),1);assert.equal(count(f,'audit_events'),1);
 for(const table of ['agent_internal_tasks','agent_jit_execution_permits','agent_execution_receipts'])assert.equal(count(f,table),0);
});

test('preparation is disabled by default and requires literal true configuration',async t=>{
 const f=await setup(t);
 for(const flag of [undefined,false,true,'1','false']){
  f.env.THEBE_EMPLOYEE_TASK_PREPARATION_ENABLED=flag;
  const response=await f.call();assert.equal(response.status,409);assert.equal((await response.json()).error,'employee_task_preparation_disabled');noWrites(f);
 }
});

test('caller cannot replace the payload, identity, idempotency key or approval',async t=>{
 const f=await setup(t);
 for(const field of ['title','payload','tenantId','authorId','reviewerId','idempotencyKey','humanConfirmed','standingAuthorization']){
  assert.equal((await f.call({[field]:'forged'})).status,400);noWrites(f);
 }
});

for(const options of [{reviewer:'author'},{decision:null},{decision:'rejected'}])test('unapproved or self-approved source cannot prepare: '+JSON.stringify(options),async t=>{
 const f=await setup(t,options);assert.equal((await f.call()).status,409);noWrites(f);
});

test('cross-tenant source, missing delegation and legacy key cannot prepare',async t=>{
 const f=await setup(t);
 assert.equal((await f.call({proposalKey:proposal.proposalKey})).status,409);
 assert.equal((await f.call({delegationId:'missing'})).status,409);
 assert.equal((await f.call({}, {session:{tenant_id:'t2',user_id:'author',role:'owner'}})).status,409);noWrites(f);
});

for(const [name,sql] of [
 ['workflow edit',"UPDATE employee_ai_workflows SET definition=replace(definition,'Onboarding reviews','Changed workflow')"],
 ['reviewer revoked',"UPDATE memberships SET status='inactive' WHERE user_id='manager'"],
 ['author revoked',"UPDATE memberships SET status='inactive' WHERE user_id='author'"],
 ['employee date changed',"UPDATE employees SET start_date='2026-11-02'"],
 ['grant revoked',"UPDATE agent_execution_grants SET status='revoked'"],
 ['delegation paused',"UPDATE agent_delegations SET status='paused'"],
 ['review metadata changed',"UPDATE employee_ai_proposal_reviews SET reviewed_at='2026-10-22T21:00:00.000Z'"]
])test('atomic preparation refuses raced '+name,async t=>{
 const f=await setup(t);f.db.beforeBatch=db=>db.exec(sql);
 assert.equal((await f.call()).status,409);noWrites(f);assert.equal(count(f,'audit_events'),0);
});

test('audit failure rolls back intent and task preparation; retry can succeed',async t=>{
 const f=await setup(t);f.sql.exec("CREATE TRIGGER fail_task_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'synthetic_audit_failure'); END");
 assert.equal((await f.call()).status,500);noWrites(f);
 f.sql.exec('DROP TRIGGER fail_task_audit');assert.equal((await f.call()).status,201);
});

test('revoked sources cannot replay an existing preparation',async t=>{
 const f=await setup(t);assert.equal((await f.call()).status,201);
 f.sql.exec("UPDATE memberships SET status='inactive' WHERE user_id='manager'");
 assert.equal((await f.call()).status,409);assert.equal(count(f,'agent_task_requests'),1);
});

test('a manager can prepare but cannot supply owner approval',async t=>{
 const f=await setup(t);const response=await f.call({}, {session:{tenant_id:'t1',user_id:'manager',role:'manager'}});
 assert.equal(response.status,201);assert.equal((await response.json()).approvalRequired,true);
 assert.equal(f.sql.prepare('SELECT requested_by_user_id FROM agent_task_requests').get().requested_by_user_id,'manager');
 });

test('a requesting owner revoked during preparation cannot write',async t=>{
 const f=await setup(t);f.db.beforeBatch=db=>db.exec("UPDATE memberships SET status='inactive' WHERE user_id='other-author'");
 assert.equal((await f.call({}, {session:{tenant_id:'t1',user_id:'other-author',role:'owner'}})).status,409);noWrites(f);
 });

test('retry cannot switch the original delegation',async t=>{
 const f=await setup(t);assert.equal((await f.call()).status,201);
 f.sql.exec(`UPDATE agent_delegations SET status='revoked';
 INSERT INTO agent_delegations(id,tenant_id,agent_key,action_key,max_autonomy_level,created_by_user_id,approved_by_user_id) VALUES('d2','t1','thebe','task.create',3,'author','author');
 INSERT INTO agent_execution_grants(id,tenant_id,delegation_id,action_key,approved_by_user_id) VALUES('g2','t1','d2','task.create','author');`);
 assert.equal((await f.call({delegationId:'d2'})).status,409);assert.equal(count(f,'agent_task_requests'),1);
 });

test('pre-existing idempotency record without employee provenance audit cannot be adopted',async t=>{
 const f=await setup(t);assert.equal((await f.call()).status,201);
 f.sql.exec("DELETE FROM audit_events WHERE event_type='AGENT_TASK_PREPARED'");
 assert.equal((await f.call()).status,409);assert.equal(count(f,'agent_task_requests'),1);
 });
