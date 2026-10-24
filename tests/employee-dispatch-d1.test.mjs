import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {fixture} from './helpers/employee-provenance-d1.mjs';
import {enqueueEmployeeDispatch,claimEmployeeDispatch,processEmployeeDispatch,runEmployeeDispatchSweep} from '../cloudflare/src/employee-dispatch.js';

import {seedDispatch} from './helpers/employee-dispatch-seed.mjs';

async function setup(t){
 const f=fixture();t.after(f.close);
 for(const file of ['047_v81_delegated_authority.sql','051_v117_persistent_agent_tasks.sql','056_v154_agent_control_plane.sql','064_v217_jit_execution_permits.sql','20261024_employee_dispatch.sql'])f.sql.exec(readFileSync('cloudflare/migrations/'+file,'utf8'));
 return {...f,...await seedDispatch(f.db)};
}
function enable(f){f.sql.exec("INSERT INTO employee_dispatch_controls(tenant_id,enabled,stopped) VALUES('t1',1,0)")}
function count(f,table){return f.sql.prepare('SELECT COUNT(*) n FROM '+table).get().n}
function noEffect(f){for(const table of ['agent_internal_tasks','agent_execution_receipts'])assert.equal(count(f,table),0,table);assert.equal(f.sql.prepare('SELECT status FROM agent_jit_execution_permits').get().status,'active')}

test('default-off flag and missing/stopped controls deny without task effects',async t=>{
 const f=await setup(t);
 for(const flag of [undefined,false,true,'1','false']){f.env.THEBE_EMPLOYEE_DISPATCH_ENABLED=flag;assert.equal((await f.enqueue()).status,409);assert.deepEqual(await runEmployeeDispatchSweep(f.env),{enabled:false,processed:0})}
 f.env.THEBE_EMPLOYEE_DISPATCH_ENABLED='true';assert.equal((await f.enqueue()).status,409);
 f.sql.exec("INSERT INTO employee_dispatch_controls(tenant_id) VALUES('t1')");assert.equal((await f.enqueue()).status,409);noEffect(f);
});

test('real owner approval and permit dispatch exactly one task, receipt and completion',async t=>{
 const f=await setup(t);enable(f);
 assert.equal((await f.enqueue()).status,201);assert.equal((await f.enqueue()).status,200);
 assert.equal((await f.taskCall('execute',{permitId:f.permitId})).status,500,'manual execution cannot bypass queued lease');
 assert.deepEqual(await runEmployeeDispatchSweep(f.env),{enabled:true,processed:1,completed:1});
 assert.equal(count(f,'agent_internal_tasks'),1);assert.equal(count(f,'agent_execution_receipts'),1);
 assert.equal(f.sql.prepare('SELECT state FROM employee_dispatch_queue').get().state,'completed');
 assert.equal(f.sql.prepare('SELECT status FROM agent_jit_execution_permits').get().status,'consumed');
 assert.deepEqual(await runEmployeeDispatchSweep(f.env),{enabled:true,processed:0,completed:0});
 assert.equal(count(f,'agent_internal_tasks'),1);
});

for(const [name,mutation] of [
 ['workflow revision',"UPDATE employee_ai_workflows SET definition=replace(definition,'Onboarding reviews','Changed')"],
 ['reviewer revoked',"UPDATE memberships SET status='inactive' WHERE user_id='manager'"],
 ['owner revoked',"UPDATE memberships SET status='inactive' WHERE user_id='author'"],
 ['session revoked',"DELETE FROM sessions"],
 ['session generation',"UPDATE users SET session_generation=session_generation+1 WHERE id='author'"],
 ['grant revoked',"UPDATE agent_execution_grants SET status='revoked'"],
 ['strong authentication required',"UPDATE agent_delegations SET strong_auth_required=1"],
 ['delegation revoked',"UPDATE agent_delegations SET status='revoked'"],
 ['employee inactive',"UPDATE employees SET status='inactive'"],
 ['operator stop',"UPDATE employee_dispatch_controls SET enabled=0,stopped=1,revision=revision+1"]
])test('atomic execution denies '+name+' changed after the worker read',async t=>{
 const f=await setup(t);enable(f);assert.equal((await f.enqueue()).status,201);
 const job=await claimEmployeeDispatch(f.env);assert.ok(job);
 f.db.beforeBatch=sql=>sql.exec(mutation);
 assert.equal((await processEmployeeDispatch(f.env,job)).ok,false);noEffect(f);
 assert.notEqual(f.sql.prepare('SELECT state FROM employee_dispatch_queue').get().state,'committing');
});

test('audit failure rolls back task, permit, completion and queue transitions; retry delay is enforced',async t=>{
 const f=await setup(t);enable(f);await f.enqueue();const job=await claimEmployeeDispatch(f.env);
 f.sql.exec("CREATE TRIGGER reject_effect_audit BEFORE INSERT ON audit_events WHEN NEW.event_type='AGENT_TASK_EXECUTED' BEGIN SELECT RAISE(ABORT,'synthetic_audit_failure'); END");
 assert.equal((await processEmployeeDispatch(f.env,job)).ok,false);noEffect(f);
 assert.equal(f.sql.prepare('SELECT state FROM employee_dispatch_queue').get().state,'queued');assert.equal(await claimEmployeeDispatch(f.env),null);
 f.sql.exec("DROP TRIGGER reject_effect_audit; UPDATE employee_dispatch_queue SET available_at=unixepoch()-1");
 assert.equal((await processEmployeeDispatch(f.env,await claimEmployeeDispatch(f.env))).ok,true);assert.equal(count(f,'agent_internal_tasks'),1);
});

test('expired leases rotate tokens, reject old workers, and dead-letter the third crash',async t=>{
 const f=await setup(t);enable(f);await f.enqueue();const old=await claimEmployeeDispatch(f.env);
 f.sql.exec('UPDATE employee_dispatch_queue SET lease_until=unixepoch()-1');const second=await claimEmployeeDispatch(f.env);
 assert.equal(second.attempts,2);assert.notEqual(second.lease_token,old.lease_token);
 assert.equal((await processEmployeeDispatch(f.env,old)).ok,false);assert.equal(f.sql.prepare('SELECT lease_token FROM employee_dispatch_queue').get().lease_token,second.lease_token);noEffect(f);
 f.sql.exec('UPDATE employee_dispatch_queue SET lease_until=unixepoch()-1');assert.equal((await claimEmployeeDispatch(f.env)).attempts,3);
 f.sql.exec('UPDATE employee_dispatch_queue SET lease_until=unixepoch()-1');assert.equal(await claimEmployeeDispatch(f.env),null);
 assert.equal(f.sql.prepare('SELECT state FROM employee_dispatch_queue').get().state,'dead_letter');noEffect(f);
});

test('API rejects forged identity, resume, cross tenant, CSRF and stale stop revision',async t=>{
 const f=await setup(t);enable(f);
 assert.equal((await f.call({action:'enqueue',requestId:f.requestId,permitId:f.permitId,proposalKey:f.proposalKey,tenantId:'t2'})).status,400);
 assert.equal((await f.call({action:'resume'})).status,400);
 assert.equal((await f.call({action:'tick'},{'x-csrf-token':'wrong'})).status,403);
 assert.equal((await f.call({action:'tick'},{cookie:'bw_session=wrong'})).status,401);
 assert.equal((await enqueueEmployeeDispatch({env:f.env,auth:{...f.auth,tenant_id:'t2'},requestId:f.requestId,permitId:f.permitId,proposalKey:f.proposalKey})).status,409);
 assert.equal((await f.call({action:'stop',expectedRevision:0})).status,409);
 assert.equal((await f.call({action:'stop',expectedRevision:1})).status,200);
 assert.equal(f.sql.prepare('SELECT stopped FROM employee_dispatch_controls').get().stopped,1);
 assert.equal((await f.call({action:'stop',expectedRevision:1})).status,409);
 assert.equal(count(f,'employee_dispatch_queue'),0);noEffect(f);
});

test('lease expiration between effect creation and completion rolls the entire transaction back',async t=>{
 const f=await setup(t);enable(f);await f.enqueue();const job=await claimEmployeeDispatch(f.env);
 f.sql.exec("CREATE TRIGGER expire_before_completion AFTER INSERT ON audit_events WHEN NEW.event_type='AGENT_TASK_EXECUTED' BEGIN UPDATE employee_dispatch_queue SET lease_until=unixepoch()-1; END");
 assert.equal((await processEmployeeDispatch(f.env,job)).ok,false);noEffect(f);
 assert.equal(f.sql.prepare('SELECT state FROM employee_dispatch_queue').get().state,'queued');
});

test('owner stop rolls back on provenance audit failure and rechecks live session in its transaction',async t=>{
 const f=await setup(t);enable(f);
 f.sql.exec("CREATE TRIGGER reject_owner_stop BEFORE INSERT ON audit_events WHEN NEW.event_type='EMPLOYEE_DISPATCH_OWNER_STOP' BEGIN SELECT RAISE(ABORT,'synthetic_owner_audit_failure'); END");
 assert.equal((await f.call({action:'stop',expectedRevision:1})).status,503);
 assert.equal(f.sql.prepare('SELECT stopped FROM employee_dispatch_controls').get().stopped,0);
 f.sql.exec('DROP TRIGGER reject_owner_stop');
 f.db.beforeBatch=sql=>sql.exec('DELETE FROM sessions');
 assert.equal((await f.call({action:'stop',expectedRevision:1})).status,409);
 assert.equal(f.sql.prepare('SELECT revision FROM employee_dispatch_controls').get().revision,1);
});
