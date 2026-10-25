import assert from 'node:assert/strict';
import {test} from 'node:test';
import {generateEmployeeWorkflowReviews} from '../cloudflare/src/employee-workflow-review-generation.js';
import {fixture,workflow} from './helpers/employee-provenance-d1.mjs';

test('manual generation uses only trusted tenant-owned workflows and active tenant employees',async t=>{
 const f=fixture();t.after(f.close);
 f.sql.prepare('INSERT INTO employees(id,tenant_id,full_name,start_date,status) VALUES (?,?,?,?,?)').run('foreign-employee','t2','Other synthetic employee','2026-11-01','active');
 const result=await generateEmployeeWorkflowReviews({db:f.db,tenantId:'t1',ownerId:'author',today:'2026-10-21'});
 assert.deepEqual(result,{ok:true,generated:1,inserted:1,duplicateCount:0,executed:0});
 const rows=f.sql.prepare('SELECT r.tenant_id,r.employee_id,p.author_id FROM employee_ai_proposal_reviews r JOIN employee_ai_proposal_provenance p USING(tenant_id,proposal_key)').all();
 assert.deepEqual(rows.map(row=>({...row})),[{tenant_id:'t1',employee_id:'e1',author_id:'author'}]);
});

test('invalid scope rejects before querying tenant records',async()=>{
 const db={prepare(){throw Error('queried')}};
 await assert.rejects(generateEmployeeWorkflowReviews({db,tenantId:'',ownerId:'author',today:'2026-10-21'}),/invalid_generation_scope/);
});

test('contract end dates are not misrepresented as contract-renewal deadlines',async t=>{
 const f=fixture();t.after(f.close);
 f.sql.prepare('UPDATE employee_ai_workflows SET definition=?').run(JSON.stringify({...workflow,routineType:'contract_renewal'}));
 f.sql.prepare("UPDATE employees SET start_date='2026-01-01',end_date='2026-11-01'").run();
 const result=await generateEmployeeWorkflowReviews({db:f.db,tenantId:'t1',ownerId:'author',today:'2026-10-21'});
 assert.equal(result.generated,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM employee_ai_proposal_reviews').get().n,0);
});

test('a stored workflow ID mismatch cannot generate proposals',async t=>{
 const f=fixture();t.after(f.close);
 f.sql.prepare('UPDATE employee_ai_workflows SET definition=?').run(JSON.stringify({...workflow,id:'different-id'}));
 await assert.rejects(generateEmployeeWorkflowReviews({db:f.db,tenantId:'t1',ownerId:'author',today:'2026-10-21'}),/workflow_source_mismatch/);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM employee_ai_proposal_reviews').get().n,0);
});
