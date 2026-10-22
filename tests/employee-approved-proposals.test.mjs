import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixture,workflow,proposal} from './helpers/employee-provenance-d1.mjs';
import {createEmployeeProposalReviewD1Store} from '../cloudflare/src/employee-proposal-review-d1-store.js';
import {handleEmployeeProposalReviewRequest as handle} from '../cloudflare/src/employee-proposal-review-api.js';

async function setup(t){
 const f=fixture();t.after(f.close);const store=createEmployeeProposalReviewD1Store(f.db);
 const {proposalKey}=await store.enqueueVersioned({tenantId:'t1',authorId:'author',sourceDefinition:JSON.stringify(workflow),proposal});
 await store.decide({tenantId:'t1',proposalKey,reviewerId:'manager',decision:'approved',reviewedAt:'2026-10-22T20:00:00.000Z'});
 const env={DB:f.db,THEBE_EMPLOYEE_TASK_PREPARATION_ENABLED:'true'};
 const call=(query='?view=approved',session={tenant_id:'t1',user_id:'author',role:'owner'})=>handle({req:{method:'GET',url:'https://thebe.test/api/employee-workflow-reviews'+query},env,session,roleAllowed:(auth,...roles)=>roles.includes(auth.role)});
 return {...f,store,proposalKey,env,call};
}

test('approved view exposes hash-verified tenant proposals and does not write tasks',async t=>{
 const f=await setup(t);const response=await f.call();assert.equal(response.status,200);const data=await response.json();
 assert.equal(data.proposals.length,1);assert.equal(data.proposals[0].proposalKey,f.proposalKey);assert.equal(data.proposals[0].payload.title,proposal.title);assert.equal(data.nextCursor,null);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM agent_task_requests').get().n,0);
 assert.equal((await (await f.call('',{tenant_id:'t1',user_id:'manager',role:'manager'})).json()).taskPreparationEnabled,true);
 assert.equal((await (await f.call('?view=approved',{tenant_id:'t2',user_id:'author',role:'owner'})).json()).proposals.length,0);
 assert.equal((await f.call('?view=approved',{tenant_id:'t1',user_id:'author',role:'reviewer'})).status,403);
});

test('approved view remains unavailable when preparation is disabled',async t=>{
 const f=await setup(t);delete f.env.THEBE_EMPLOYEE_TASK_PREPARATION_ENABLED;
 assert.equal((await f.call()).status,409);
 assert.equal((await (await f.call('')).json()).taskPreparationEnabled,false);
});

for(const [name,mutation] of [
 ['changed workflow',"UPDATE employee_ai_workflows SET definition=replace(definition,'Onboarding reviews','Changed')"],
 ['revoked reviewer',"UPDATE memberships SET status='inactive' WHERE user_id='manager'"],
 ['changed deadline',"UPDATE employees SET start_date='2026-11-02'"]
])test('approved view excludes '+name,async t=>{
 const f=await setup(t);f.sql.exec(mutation);assert.equal((await (await f.call()).json()).proposals.length,0);
});

test('approved view excludes legacy and self-approved proposals',async t=>{
 const f=await setup(t);
 await f.store.enqueue({tenantId:'t1',proposal});await f.store.decide({tenantId:'t1',proposalKey:proposal.proposalKey,reviewerId:'manager',decision:'approved',reviewedAt:'2026-10-22T20:00:00.000Z'});
 f.sql.prepare('UPDATE employee_ai_proposal_reviews SET reviewed_by=? WHERE proposal_key=?').run('author',f.proposalKey);
 assert.equal((await (await f.call()).json()).proposals.length,0);
});

test('approved pagination is stable, bounded and never duplicates tenant proposals',async t=>{
 const f=await setup(t);
 for(let index=0;index<28;index++){
  const employeeId='extra-'+String(index).padStart(2,'0');
  f.sql.prepare('INSERT INTO employees(id,tenant_id,full_name,start_date,status) VALUES (?,?,?,?,?)').run(employeeId,'t1','Synthetic employee','2026-11-01','active');
  const candidate={...proposal,employeeId,proposalKey:JSON.stringify(['t1','w1',employeeId,proposal.type,proposal.dueDate])};
  const {proposalKey}=await f.store.enqueueVersioned({tenantId:'t1',authorId:'author',sourceDefinition:JSON.stringify(workflow),proposal:candidate});
  await f.store.decide({tenantId:'t1',proposalKey,reviewerId:'manager',decision:'approved',reviewedAt:'2026-10-22T20:00:00.000Z'});
 }
 const first=await (await f.call()).json();assert.equal(first.proposals.length,25);assert.equal(typeof first.nextCursor,'string');
 const second=await (await f.call('?view=approved&after='+encodeURIComponent(first.nextCursor))).json();
 assert.equal(second.proposals.length,4);assert.equal(second.nextCursor,null);
 assert.equal(new Set([...first.proposals,...second.proposals].map(p=>p.proposalKey)).size,29);
});

test('invalid view or oversized cursor is rejected',async t=>{
 const f=await setup(t);assert.equal((await f.call('?view=all-tenants')).status,400);
 assert.equal((await f.call('?view=approved&after='+'x'.repeat(2049))).status,400);
});

test('stored content-hash forgery is omitted even when its review metadata is consistent',async t=>{
 const f=await setup(t);const original=f.sql.prepare('SELECT * FROM employee_ai_proposal_provenance WHERE proposal_key=?').get(f.proposalKey);
 const keyParts=JSON.parse(f.proposalKey);keyParts[4]='0'.repeat(64);const forgedKey=JSON.stringify(keyParts);
 f.sql.prepare('INSERT INTO employee_ai_proposal_reviews(tenant_id,proposal_key,workflow_id,employee_id,task_type,due_date) VALUES (?,?,?,?,?,?)').run('t1',forgedKey,'w1','e1','onboarding_checklist','2026-11-01');
 f.sql.prepare('INSERT INTO employee_ai_proposal_provenance(tenant_id,proposal_key,author_id,workflow_id,workflow_revision,proposal_revision,workflow_definition,proposal_json) VALUES (?,?,?,?,?,?,?,?)').run('t1',forgedKey,'author','w1',keyParts[4],original.proposal_revision,original.workflow_definition,original.proposal_json);
 await f.store.decide({tenantId:'t1',proposalKey:forgedKey,reviewerId:'manager',decision:'approved',reviewedAt:'2026-10-22T20:00:00.000Z'});
 const data=await (await f.call()).json();assert.deepEqual(data.proposals.map(source=>source.proposalKey),[f.proposalKey]);
});
