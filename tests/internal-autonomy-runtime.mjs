import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHmac} from 'node:crypto';
import {installShadowTelemetrySchema,seedShadowTelemetryFixtures} from './helpers/agent-shadow-telemetry.mjs';
import {handleInternalAutonomyRequest,runInternalAutonomyPolicy,runDueInternalAutonomy} from '../cloudflare/src/agent-internal-autonomy.js';
import {handleAgenticTaskExecutionRequest} from '../cloudflare/src/agentic-task-execution.js';

function fixture(){
  const db=new DatabaseSync(':memory:');
  installShadowTelemetrySchema(db);seedShadowTelemetryFixtures(db);
  db.exec(`UPDATE agent_registry SET authority_state='active' WHERE agent_id='THEBE-001';
    INSERT INTO agent_delegations(id,tenant_id,agent_key,action_key,max_autonomy_level,max_daily_actions,max_amount_minor,created_by_user_id,approved_by_user_id)
      VALUES('delegation-a','t1','thebe','task.create',3,5,0,'u1','u1');
    INSERT INTO agent_execution_grants(id,tenant_id,delegation_id,action_key,approved_by_user_id) VALUES('grant-a','t1','delegation-a','task.create','u1');`);
  const secret='test-secret-internal-autonomy',token='fixture-session';
  const tokenHash=createHmac('sha256',secret).update(token).digest('hex');
  db.prepare("INSERT INTO sessions(user_id,tenant_id,role,token_hash,csrf_token,expires_at,session_generation) VALUES('u1','t1','owner',?,'csrf-fixture',datetime('now','+1 day'),0)").run(tokenHash);
  let beforeBatch=null;
  class Statement{
    constructor(sql){this.sql=sql;this.values=[];}
    bind(...values){this.values=values;return this;}
    first(){return db.prepare(this.sql).get(...this.values)||null;}
    all(){return {results:db.prepare(this.sql).all(...this.values)};}
    run(){return {meta:{changes:Number(db.prepare(this.sql).run(...this.values).changes)}};}
  }
  const env={SESSION_SECRET:secret,PUBLIC_ORIGIN:'https://thebe.test',THEBE_INTERNAL_AUTONOMY_ENABLED:'true',AGENT_BOUNDED_TASK_EXECUTION_MODE:'owner_bounded',DB:{prepare:sql=>new Statement(sql),batch(statements){beforeBatch?.(statements);db.exec('BEGIN IMMEDIATE');try{const r=statements.map(s=>s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}}};
  const policyBody={scopes:['tasks','drafts','records'],delegationId:'delegation-a',taskTemplate:{title:'Review the operations evidence report',description:'Check the observed figures before taking further action.',priority:2},expiresAt:new Date(Date.now()+7*86400000).toISOString(),intervalHours:24,maxDailyRuns:5};
  async function request(path='',body,headers={}){
    return handleInternalAutonomyRequest({request:new Request('https://thebe.test/api/agentic/internal-autonomy'+path,{method:body===undefined?'GET':'POST',headers:{cookie:'bw_session='+token,origin:'https://thebe.test','x-csrf-token':'csrf-fixture','content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)}),env});
  }
  async function taskRequest(path,body,headers={}){
    return handleAgenticTaskExecutionRequest({request:new Request('https://thebe.test/api/agentic/task-execution/'+path,{method:'POST',headers:{cookie:'bw_session='+token,origin:'https://thebe.test','x-csrf-token':'csrf-fixture','content-type':'application/json',...headers},body:JSON.stringify(body)}),env});
  }
  async function create(body=policyBody){const r=await request('',body);assert.equal(r.status,201,JSON.stringify(await r.clone().json()));const p=await r.json();return db.prepare('SELECT * FROM agent_persistent_tasks WHERE id=?').get(p.id);}
  const count=table=>Number(db.prepare('SELECT COUNT(*) c FROM '+table).get().c);
  return {db,env,request,taskRequest,create,policyBody,count,setBeforeBatch:fn=>{beforeBatch=fn;}};
}

{
 const f=fixture(),row=await f.create();
 const result=await runInternalAutonomyPolicy(f.env,row);
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.report.status,'draft');assert.equal(result.record.kind,'managed_operational_summary');assert.ok(result.task.id);
 assert.equal(f.count('agent_internal_tasks'),1);assert.equal(f.count('agent_execution_receipts'),1);
 assert.equal(f.db.prepare('SELECT status,use_count FROM agent_jit_execution_permits').get().use_count,1);
 const audit=f.db.prepare("SELECT event_data FROM audit_events WHERE event_type='AGENT_TASK_APPROVED'").get();assert.equal(JSON.parse(audit.event_data).approvalSource,'owner_approved_standing_template');
 const again=await runInternalAutonomyPolicy(f.env,row);assert.equal(again.ok,false);assert.equal(f.count('agent_internal_tasks'),1);
 assert.equal((await f.request()).status,200);
 assert.equal((await f.request('/'+row.id+'/revoke',{})).status,200);
 assert.equal((await runInternalAutonomyPolicy(f.env,row)).ok,false);
 f.db.close();
}
for(const mutation of [
 f=>{f.env.AGENT_RUNTIME_KILL_SWITCH='true';},
 f=>{f.env.AGENT_RUNTIME_BUDGET_STATUS='exceeded';},
 f=>{f.env.THEBE_INTERNAL_AUTONOMY_ENABLED='false';},
 f=>{f.db.exec("UPDATE memberships SET role='manager' WHERE tenant_id='t1'");},
 f=>{f.db.exec("UPDATE agent_registry SET authority_state='suspended' WHERE agent_id='THEBE-001'");},
 f=>{f.db.exec("UPDATE agent_execution_grants SET status='revoked'");}
]){
 const f=fixture(),row=await f.create();mutation(f);
 assert.equal((await runInternalAutonomyPolicy(f.env,row)).ok,false);assert.equal(f.count('agent_internal_tasks'),0);f.db.close();
}
{
 const f=fixture();assert.equal((await f.request('',f.policyBody,{'x-csrf-token':'wrong'})).status,403);
 assert.equal((await f.request('',f.policyBody,{origin:'https://other.test'})).status,403);
 f.db.exec("UPDATE memberships SET role='manager' WHERE tenant_id='t1'");assert.equal((await f.request()).status,403);f.db.close();
}
{
 const f=fixture(),row=await f.create();row.tenant_id='t2';assert.equal((await runInternalAutonomyPolicy(f.env,row)).ok,false);assert.equal(f.count('agent_internal_tasks'),0);f.db.close();
}
{
 const f=fixture(),row=await f.create();
 f.setBeforeBatch(statements=>{if(statements[0].sql.includes("SET status='executed'"))f.db.exec("UPDATE agent_persistent_tasks SET status='cancelled'");});
 assert.equal((await runInternalAutonomyPolicy(f.env,row)).ok,false);assert.equal(f.count('agent_internal_tasks'),0);assert.equal(f.count('agent_execution_receipts'),0);f.db.close();
}
{
 const f=fixture(),row=await f.create();
 f.db.exec("CREATE TRIGGER fail_execution_audit BEFORE INSERT ON audit_events WHEN NEW.event_type='AGENT_TASK_EXECUTED' BEGIN SELECT RAISE(ABORT,'injected audit outage'); END;");
 assert.equal((await runInternalAutonomyPolicy(f.env,row)).ok,false);assert.equal(f.count('agent_internal_tasks'),0);assert.equal(f.count('agent_execution_receipts'),0);assert.equal(f.db.prepare('SELECT use_count FROM agent_jit_execution_permits').get().use_count,0);f.db.close();
}
{
 const f=fixture(),row=await f.create({...f.policyBody,scopes:['drafts','records'],delegationId:undefined,taskTemplate:undefined});
 assert.equal((await runDueInternalAutonomy(f.env)).processed,1);assert.equal(f.count('agent_internal_tasks'),0);f.db.close();
}
{
 const f=fixture(),row=await f.create();
 const altered=JSON.parse(row.approval_policy_json);altered.taskTemplate.title='Changed unapproved task';
 row.approval_policy_json=JSON.stringify(altered);f.db.prepare('UPDATE agent_persistent_tasks SET approval_policy_json=? WHERE id=?').run(row.approval_policy_json,row.id);
 assert.equal((await runInternalAutonomyPolicy(f.env,row)).ok,false);assert.equal(f.count('agent_internal_tasks'),0);f.db.close();
}
{
 const f=fixture(),row=await f.create();f.db.exec('DROP TABLE daily_operations_summaries');
 assert.equal((await runInternalAutonomyPolicy(f.env,row)).reason,'authoritative_source_unavailable');assert.equal(f.count('agent_internal_tasks'),0);f.db.close();
}
{
 const f=fixture(),row=await f.create();
 const results=await Promise.all([runInternalAutonomyPolicy(f.env,row),runInternalAutonomyPolicy(f.env,row)]);
 assert.equal(results.filter(r=>r.ok).length,1);assert.equal(f.count('agent_internal_tasks'),1);assert.equal(f.count('agent_execution_receipts'),1);
 assert.equal(f.db.prepare("SELECT COUNT(*) c FROM agent_persistent_task_events WHERE event_type='AUTONOMY_RUN'").get().c,1);f.db.close();
}
{
 const f=fixture(),row=await f.create();
 f.db.exec("CREATE TRIGGER fail_report_audit BEFORE INSERT ON audit_events WHEN NEW.event_type='AGENT_AUTONOMY_RUN' BEGIN SELECT RAISE(ABORT,'injected report audit outage'); END;");
 await assert.rejects(runInternalAutonomyPolicy(f.env,row));assert.equal(f.count('agent_internal_tasks'),1);
 assert.equal(f.db.prepare("SELECT COUNT(*) c FROM agent_persistent_task_events WHERE event_type='AUTONOMY_RUN'").get().c,0);
 f.db.exec('DROP TRIGGER fail_report_audit');
 assert.equal((await runInternalAutonomyPolicy(f.env,row)).ok,true);assert.equal(f.count('agent_internal_tasks'),1);f.db.close();
}
{
 const f=fixture();f.db.exec('UPDATE agent_delegations SET max_daily_actions=1');
 const a=await f.create(),b=await f.create();assert.equal((await runInternalAutonomyPolicy(f.env,a)).ok,true);
 assert.equal((await runInternalAutonomyPolicy(f.env,b)).ok,false);assert.equal(f.count('agent_internal_tasks'),1);f.db.close();
}
{
 const f=fixture(),row=await f.create({...f.policyBody,maxDailyRuns:1});
 assert.equal((await runInternalAutonomyPolicy(f.env,row)).ok,true);
 f.db.prepare("UPDATE agent_persistent_tasks SET next_run_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(row.id);
 const again=f.db.prepare('SELECT * FROM agent_persistent_tasks WHERE id=?').get(row.id);
 assert.equal((await runInternalAutonomyPolicy(f.env,again)).reason,'daily_run_limit');f.db.close();
}
{
 const f=fixture(),row=await f.create();assert.equal((await runInternalAutonomyPolicy(f.env,row)).ok,true);
 f.db.exec('UPDATE agent_delegations SET max_daily_actions=1');
 const prepared=await (await f.taskRequest('prepare',{title:'Another exact owner-approved task',delegationId:'delegation-a'},{'idempotency-key':'manual-cap-race'})).json();
 const id=prepared.request.id;assert.equal((await f.taskRequest('requests/'+id+'/approve',{})).status,200);
 const issued=await (await f.taskRequest('requests/'+id+'/jit-permit',{})).json();
 const original=f.env.DB.prepare;
 f.env.DB.prepare=sql=>sql.startsWith('SELECT COUNT(*) count FROM agent_execution_receipts')?{bind(){return this;},first(){return {count:0};}}:original(sql);
 const denied=await f.taskRequest('requests/'+id+'/execute',{permitId:issued.permit.id});
 assert.equal((await denied.json()).error,'task_execution_failed','write-time shared cap rejects a stale pre-read');assert.equal(f.count('agent_internal_tasks'),1);f.db.close();
}
console.log('internal autonomy production-schema lifecycle, concurrency, exact-template binding, budgets, revocation and audit rollback: PASS');
