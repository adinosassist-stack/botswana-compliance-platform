import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixture,workflow,proposal} from './helpers/employee-provenance-d1.mjs';
import {createEmployeeProposalReviewD1Store} from '../cloudflare/src/employee-proposal-review-d1-store.js';
import {generateEmployeeWorkflowReviews} from '../cloudflare/src/employee-workflow-review-generation.js';

async function seeded(f,authorId='author'){
 const store=createEmployeeProposalReviewD1Store(f.db);
 const result=await store.enqueueVersioned({tenantId:'t1',authorId,sourceDefinition:JSON.stringify(workflow),proposal});
 return {store,key:result.proposalKey};
}
async function approve(store,key,reviewerId='manager'){
 return store.decide({tenantId:'t1',proposalKey:key,reviewerId,decision:'approved',reviewedAt:'2026-10-22T20:00:00.000Z'});
}

test('generation persists author/revision and remains duplicate-safe without execution',async t=>{
 const f=fixture();t.after(f.close);
 const args={db:f.db,tenantId:'t1',ownerId:'author',today:'2026-10-22'};
 assert.deepEqual(await generateEmployeeWorkflowReviews(args),{ok:true,generated:1,inserted:1,duplicateCount:0,executed:0});
 assert.equal((await generateEmployeeWorkflowReviews(args)).duplicateCount,1);
 const row=f.sql.prepare('SELECT * FROM employee_ai_proposal_provenance').get();
 assert.equal(row.author_id,'author');assert.equal(row.workflow_definition,JSON.stringify(workflow));
 assert.equal(JSON.parse(row.proposal_key)[0],'employee-proposal-v2');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM employee_ai_proposal_reviews').get().n,1);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM agent_internal_tasks').get().n,0);
});

test('owners with the same workflow ID get separate immutable proposals',async t=>{
 const f=fixture();t.after(f.close);
 f.sql.prepare('INSERT INTO employee_ai_workflows(tenant_id,owner_id,workflow_id,definition) VALUES (?,?,?,?)').run('t1','other-author','w1',JSON.stringify(workflow));
 const first=await seeded(f),second=await seeded(f,'other-author');
 assert.notEqual(first.key,second.key);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM employee_ai_proposal_provenance').get().n,2);
});

test('approved snapshots require independent active reviewer and unchanged source',async t=>{
 const f=fixture();t.after(f.close);const {store,key}=await seeded(f);
 assert.equal(await store.loadApprovedProvenance({tenantId:'t1',proposalKey:key}),null);
 await approve(store,key);
 const approved=await store.loadApprovedProvenance({tenantId:'t1',proposalKey:key});
 assert.equal(approved.authorId,'author');assert.equal(approved.reviewerId,'manager');
 assert.equal(approved.payload.title,proposal.title);
 assert.equal(await store.loadApprovedProvenance({tenantId:'t2',proposalKey:key}),null);
 f.sql.prepare("UPDATE memberships SET status='inactive' WHERE user_id='manager'").run();
 assert.equal(await store.loadApprovedProvenance({tenantId:'t1',proposalKey:key}),null);
});

test('author self-approval and missing legacy provenance cannot qualify',async t=>{
 const f=fixture();t.after(f.close);const {store,key}=await seeded(f);
 await approve(store,key,'author');
 assert.equal(await store.loadApprovedProvenance({tenantId:'t1',proposalKey:key}),null);
 await store.enqueue({tenantId:'t1',proposal});await approve(store,proposal.proposalKey);
 assert.equal(await store.loadApprovedProvenance({tenantId:'t1',proposalKey:proposal.proposalKey}),null);
});

test('editing a workflow invalidates old approved provenance and creates a new pending review',async t=>{
 const f=fixture();t.after(f.close);const {store,key}=await seeded(f);await approve(store,key);
 f.sql.prepare('UPDATE employee_ai_workflows SET definition=?').run(JSON.stringify({...workflow,name:'Changed workflow'}));
 assert.equal(await store.loadApprovedProvenance({tenantId:'t1',proposalKey:key}),null);
 const generated=await generateEmployeeWorkflowReviews({db:f.db,tenantId:'t1',ownerId:'author',today:'2026-10-22'});
 assert.equal(generated.inserted,1);
 const pending=f.sql.prepare("SELECT proposal_key FROM employee_ai_proposal_reviews WHERE status='proposed'").get();
 assert.notEqual(pending.proposal_key,key);
 assert.equal(await store.loadApprovedProvenance({tenantId:'t1',proposalKey:pending.proposal_key}),null);
 await approve(store,pending.proposal_key);
 assert.notEqual((await store.loadApprovedProvenance({tenantId:'t1',proposalKey:pending.proposal_key})).workflowRevision,(await f.sql.prepare('SELECT workflow_revision FROM employee_ai_proposal_provenance WHERE proposal_key=?').get(key)).workflow_revision);
});

test('source changes before the atomic insert leave no review or provenance',async t=>{
 const f=fixture();t.after(f.close);
 f.db.beforeBatch=sql=>sql.prepare('UPDATE employee_ai_workflows SET definition=?').run(JSON.stringify({...workflow,name:'Raced update'}));
 await assert.rejects(seeded(f),/source_revision_stale/);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM employee_ai_proposal_reviews').get().n,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM employee_ai_proposal_provenance').get().n,0);
});

test('provenance insert failure rolls back review creation',async t=>{
 const f=fixture();t.after(f.close);
 f.sql.exec("CREATE TRIGGER fail_provenance BEFORE INSERT ON employee_ai_proposal_provenance BEGIN SELECT RAISE(ABORT,'synthetic provenance failure'); END");
 await assert.rejects(seeded(f),/synthetic provenance failure/);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM employee_ai_proposal_reviews').get().n,0);
});

test('provenance snapshots cannot be updated or deleted',async t=>{
 const f=fixture();t.after(f.close);await seeded(f);
 assert.throws(()=>f.sql.exec("UPDATE employee_ai_proposal_provenance SET author_id='other-author'"),/provenance_immutable/);
 assert.throws(()=>f.sql.exec('DELETE FROM employee_ai_proposal_provenance'),/provenance_immutable/);
});

test('employee deadline changes and author revocation invalidate approved provenance',async t=>{
 const f=fixture();t.after(f.close);const {store,key}=await seeded(f);await approve(store,key);
 f.sql.prepare("UPDATE employees SET start_date='2026-11-02' WHERE id='e1'").run();
 assert.equal(await store.loadApprovedProvenance({tenantId:'t1',proposalKey:key}),null);
 f.sql.prepare("UPDATE employees SET start_date='2026-11-01' WHERE id='e1'").run();
 f.sql.prepare("UPDATE memberships SET status='inactive' WHERE user_id='author'").run();
 assert.equal(await store.loadApprovedProvenance({tenantId:'t1',proposalKey:key}),null);
});

test('missing provenance migration cannot leave a newly created review behind',async t=>{
 const f=fixture();t.after(f.close);f.sql.exec('DROP TABLE employee_ai_proposal_provenance');
 await assert.rejects(seeded(f),/no such table/);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM employee_ai_proposal_reviews').get().n,0);
});

test('review metadata or event mismatches cannot qualify as approved provenance',async t=>{
 const f=fixture();t.after(f.close);const {store,key}=await seeded(f);await approve(store,key);
 f.sql.prepare("UPDATE employee_ai_proposal_reviews SET reviewed_by='other-author'").run();
 assert.equal(await store.loadApprovedProvenance({tenantId:'t1',proposalKey:key}),null);
 f.sql.prepare("UPDATE employee_ai_proposal_reviews SET reviewed_by='manager',due_date='2026-11-02'").run();
 assert.equal(await store.loadApprovedProvenance({tenantId:'t1',proposalKey:key}),null);
});

test('a forged content hash is rejected even when stored key fields are consistent',async t=>{
 const f=fixture();t.after(f.close);const {store,key}=await seeded(f);
 const original=f.sql.prepare('SELECT * FROM employee_ai_proposal_provenance WHERE proposal_key=?').get(key);
 const parts=JSON.parse(key);parts[4]='0'.repeat(64);const forgedKey=JSON.stringify(parts);
 f.sql.prepare('INSERT INTO employee_ai_proposal_reviews(tenant_id,proposal_key,workflow_id,employee_id,task_type,due_date) VALUES (?,?,?,?,?,?)').run('t1',forgedKey,'w1','e1','onboarding_checklist','2026-11-01');
 f.sql.prepare('INSERT INTO employee_ai_proposal_provenance(tenant_id,proposal_key,author_id,workflow_id,workflow_revision,proposal_revision,workflow_definition,proposal_json) VALUES (?,?,?,?,?,?,?,?)').run('t1',forgedKey,'author','w1',parts[4],original.proposal_revision,original.workflow_definition,original.proposal_json);
 await approve(store,forgedKey);
 assert.equal(await store.loadApprovedProvenance({tenantId:'t1',proposalKey:forgedKey}),null);
});
