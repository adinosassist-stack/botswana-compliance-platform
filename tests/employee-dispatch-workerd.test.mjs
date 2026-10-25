import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {splitSqliteMigrationStatements} from '../scripts/sqlite-migration-statements.mjs';
import {workflow} from './helpers/employee-provenance-d1.mjs';
import {seedDispatch} from './helpers/employee-dispatch-seed.mjs';
import {claimEmployeeDispatch,processEmployeeDispatch,runEmployeeDispatchSweep} from '../cloudflare/src/employee-dispatch.js';

async function setup(t){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("synthetic dispatcher verification")}}',compatibilityDate:'2026-09-03',d1Databases:{DB:'employee-dispatch-local'}}));
 t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');
 const base=splitSqliteMigrationStatements(readFileSync('cloudflare/schema.sql','utf8')).map(sql=>sql.replace(/--[^\n]*/g,'').trim()).filter(sql=>/^CREATE TABLE IF NOT EXISTS (tenants|users|memberships|sessions|employees|audit_events|agentic_runs|agentic_proposals)\(/.test(sql));
 assert.equal(base.length,8);for(const sql of base)await db.prepare(sql).run();
 for(const file of ['047_v81_delegated_authority.sql','048_v102_bounded_internal_task_execution.sql','051_v117_persistent_agent_tasks.sql','056_v154_agent_control_plane.sql','064_v217_jit_execution_permits.sql','20261021_employee_ai_workflows.sql','20261021_employee_ai_proposal_reviews.sql','20261022_employee_ai_proposal_provenance.sql','20261024_employee_dispatch.sql']){
  for(const sql of splitSqliteMigrationStatements(readFileSync('cloudflare/migrations/'+file,'utf8')))await db.prepare(sql).run();
 }
 await db.batch([
  db.prepare("INSERT INTO tenants(id,name) VALUES('t1','Synthetic tenant')"),
  db.prepare("INSERT INTO users(id,email) VALUES('author','author@example.test'),('manager','manager@example.test')"),
  db.prepare("INSERT INTO memberships(tenant_id,user_id,role,status) VALUES('t1','author','owner','active'),('t1','manager','manager','active')"),
  db.prepare("INSERT INTO employees(id,tenant_id,full_name,start_date,status) VALUES('e1','t1','Synthetic employee','2026-11-01','active')"),
  db.prepare("INSERT INTO employee_ai_workflows(tenant_id,owner_id,workflow_id,definition) VALUES('t1','author','w1',?)").bind(JSON.stringify(workflow))
 ]);
 return {db,...await seedDispatch(db)};
}

test('actual local D1: concurrent claims, atomic completion, audit rollback and retry',async t=>{
 const f=await setup(t);const {db}=f;
 assert.equal((await f.enqueue()).status,409,'new migration stays stopped');
 assert.equal((await f.call({action:'stop',expectedRevision:0})).status,200);
 assert.equal((await f.call({action:'stop',expectedRevision:0})).status,409);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM audit_events WHERE event_type='EMPLOYEE_DISPATCH_OWNER_STOP'").first()).n,1);
 await db.prepare("UPDATE employee_dispatch_controls SET enabled=1,stopped=0,revision=revision+1").run();
 const responses=await Promise.all(Array.from({length:4},()=>f.enqueue()));assert.deepEqual(responses.map(r=>r.status).sort(),[200,200,200,201]);
 const claims=await Promise.all(Array.from({length:4},()=>claimEmployeeDispatch(f.env)));
 assert.equal(claims.filter(Boolean).length,1);const job=claims.find(Boolean);
 const noEffect=async()=>{
  for(const table of ['agent_internal_tasks','agent_execution_receipts'])assert.equal((await db.prepare('SELECT COUNT(*) n FROM '+table).first()).n,0);
  assert.equal((await db.prepare('SELECT status FROM agent_jit_execution_permits').first()).status,'active');
 };
 await db.prepare("CREATE TRIGGER synthetic_completion_failure BEFORE INSERT ON audit_events WHEN NEW.event_type='EMPLOYEE_DISPATCH_TRANSITION' AND json_extract(NEW.event_data,'$.state')='completed' BEGIN SELECT RAISE(ABORT,'synthetic_completion_audit_failure'); END").run();
 assert.equal((await processEmployeeDispatch(f.env,job)).ok,false);await noEffect();
 assert.equal((await db.prepare('SELECT state FROM employee_dispatch_queue').first()).state,'queued');
 assert.equal(await claimEmployeeDispatch(f.env),null,'backoff applies');
 await db.prepare('DROP TRIGGER synthetic_completion_failure').run();
 await db.prepare('UPDATE employee_dispatch_queue SET available_at=unixepoch()-1').run();
 const retry=await claimEmployeeDispatch(f.env);assert.equal(retry.attempts,2);
 // Stop after service reads, immediately before its actual D1 effect batch.
 const raced={...f.env,DB:{prepare:sql=>db.prepare(sql),async batch(statements){
  await db.prepare("UPDATE employee_dispatch_controls SET stopped=1,enabled=0,revision=revision+1").run();return db.batch(statements);
 }}};
 assert.equal((await processEmployeeDispatch(raced,retry)).ok,false);await noEffect();
 await db.prepare('UPDATE employee_dispatch_controls SET stopped=0,enabled=1,revision=revision+1').run();
 await db.prepare('UPDATE employee_dispatch_queue SET available_at=unixepoch()-1').run();
 assert.deepEqual(await runEmployeeDispatchSweep(f.env),{enabled:true,processed:1,completed:1});
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM agent_internal_tasks').first()).n,1);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM agent_execution_receipts').first()).n,1);
 assert.equal((await db.prepare('SELECT state FROM employee_dispatch_queue').first()).state,'completed');
 assert.equal((await db.prepare('SELECT status FROM agent_jit_execution_permits').first()).status,'consumed');
 assert.deepEqual(await runEmployeeDispatchSweep(f.env),{enabled:true,processed:0,completed:0});
});

test('actual local D1: manual approved task succeeds with JIT trigger writes while dispatcher stays off',async t=>{
 const f=await setup(t);f.env.THEBE_EMPLOYEE_DISPATCH_ENABLED='false';
 const response=await f.taskCall('execute',{permitId:f.permitId});assert.equal(response.status,201);
 assert.equal((await response.json()).verified,true);
 assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM agent_internal_tasks').first()).n,1);
 assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM employee_dispatch_queue').first()).n,0);
 assert.equal((await f.db.prepare('SELECT status FROM agent_jit_execution_permits').first()).status,'consumed');
});
