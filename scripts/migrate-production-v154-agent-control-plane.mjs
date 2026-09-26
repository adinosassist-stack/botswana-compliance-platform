import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const API='https://api.cloudflare.com/client/v4';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();

const reviewedMigrations=Object.freeze([
  Object.freeze({number:51,path:'cloudflare/migrations/051_v117_persistent_agent_tasks.sql',blob:'f05582d7dc9354710af43de2760e4786f8cab95c'}),
  Object.freeze({number:52,path:'cloudflare/migrations/052_v122_agent_observation_checkpoints.sql',blob:'e1bfd2d73a372c880c905aabc77bd955198a12df'}),
  Object.freeze({number:53,path:'cloudflare/migrations/053_v132_agent_observation_claims.sql',blob:'f88f71e3d49e54ceea5b4bdfd5278673c5e3c8ad'}),
  Object.freeze({number:54,path:'cloudflare/migrations/054_v134_agent_observation_identity.sql',blob:'0d7cb2f2e4a90ea570d5dc5193c0507efbf00ab4'}),
  Object.freeze({number:55,path:'cloudflare/migrations/055_v151_finance_watch_scheduler_isolation.sql',blob:'0b5ea933afa9299d535a50b99c1e4fb9041aa674'}),
  Object.freeze({number:56,path:'cloudflare/migrations/056_v154_agent_control_plane.sql',blob:'86d033543e5eb47ec2da3fd5e4e44e82e25ec5cd'})
]);

const baselineTables=[
  'tenants','users','audit_events','agent_delegations','agent_action_intents','agent_execution_grants',
  'agent_task_requests','agent_internal_tasks','agent_execution_receipts','finance_customers','finance_invoices',
  'finance_invoice_allocations','manual_payment_submissions','manual_payment_events'
];
const target056Tables=['agent_registry','agent_authority_events','agent_authority_drift_findings'];
const target056Indexes=['idx_agent_authority_events_agent_created','idx_agent_authority_drift_agent_status','uq_agent_authority_drift_open'];
const target056Triggers=['trg_agent_registry_identity_immutable','trg_agent_registry_no_execution_escalation','trg_agent_registry_revoked_terminal'];

function fail(message){throw new Error(`Production D1 migrations 051-056 refused: ${message}`)}
if(!token)fail('CLOUDFLARE_API_TOKEN is empty');
if(!/^[0-9a-fA-F]{32}$/.test(accountId))fail('CLOUDFLARE_ACCOUNT_ID is invalid');
if(!/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(databaseId))fail('D1_DATABASE_ID is invalid');

const headers={Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json'};
const safe=value=>String(value||'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,500);

async function cf(path,options={}){
  const response=await fetch(`${API}${path}`,{...options,headers:{...headers,...(options.headers||{})}});
  const raw=await response.text();let body=null;try{body=raw?JSON.parse(raw):null}catch{}
  if(!response.ok||body?.success===false){
    const errors=Array.isArray(body?.errors)?body.errors.map(e=>`${e?.code??'unknown'}:${e?.message??'unknown'}`).join(' | '):safe(raw);
    throw new Error(`Cloudflare API ${path} failed HTTP ${response.status}: ${errors}`);
  }
  return body;
}
async function query(sql,params=[]){
  const body=await cf(`/accounts/${accountId}/d1/database/${databaseId}/query`,{method:'POST',body:JSON.stringify({sql,params})});
  const results=Array.isArray(body?.result)?body.result:[];
  if(!results.length||results.some(r=>r?.success===false))fail(`D1 query failed: ${safe(sql)}`);
  return results.flatMap(r=>Array.isArray(r?.results)?r.results:[]);
}
async function names(type){
  const rows=await query('SELECT name FROM sqlite_master WHERE type=?',[type]);
  return new Set(rows.map(row=>String(row.name||'')));
}
async function columns(table){
  const rows=await query(`PRAGMA table_info(${table})`);
  return new Set(rows.map(row=>String(row.name||'')));
}
async function objectSql(type,name){
  const rows=await query('SELECT sql FROM sqlite_master WHERE type=? AND name=? LIMIT 1',[type,name]);
  return String(rows?.[0]?.sql||'');
}
async function hasObjects(type,required){
  const present=await names(type);
  return required.every(name=>present.has(name));
}
async function requireColumns(table,required){
  const present=await columns(table);
  const missing=required.filter(name=>!present.has(name));
  if(missing.length)fail(`${table} missing column(s): ${missing.join(',')}`);
}

async function verifyBaseline(){
  const tables=await names('table');
  const missing=baselineTables.filter(name=>!tables.has(name));
  if(missing.length)fail(`earlier schema baseline through migration 050 is incomplete: ${missing.join(',')}`);
}

async function verify051(){
  if(!(await hasObjects('table',['agent_persistent_tasks','agent_persistent_task_events'])))return false;
  if(!(await hasObjects('index',['agent_persistent_tasks_due','agent_persistent_task_events_task'])))return false;
  if(!(await hasObjects('trigger',['agent_persistent_task_event_tenant_guard'])))return false;
  await requireColumns('agent_persistent_tasks',['id','tenant_id','owner_user_id','agent_key','objective','status','trigger_kind','trigger_spec_json','allowed_tools_json','risk_policy_json','approval_policy_json','budget_json','next_run_at','last_run_at']);
  return true;
}
async function verify052(){
  if(!(await hasObjects('table',['agent_observation_checkpoints'])))return false;
  if(!(await hasObjects('index',['idx_agent_observation_checkpoints_task_time'])))return false;
  if(!(await hasObjects('trigger',['trg_agent_observation_checkpoint_tenant'])))return false;
  await requireColumns('agent_observation_checkpoints',['id','tenant_id','persistent_task_id','snapshot_hash','snapshot_json','exception_json','observed_at','created_at']);
  return true;
}
async function verify053(){
  if(!(await hasObjects('table',['agent_observation_claims'])))return false;
  if(!(await hasObjects('index',['idx_agent_observation_claims_task_time'])))return false;
  if(!(await hasObjects('trigger',['trg_agent_observation_claim_tenant'])))return false;
  await requireColumns('agent_observation_claims',['id','tenant_id','persistent_task_id','scheduled_for','status','attempts','checkpoint_id','error_code']);
  return true;
}
async function verify054(){
  const checkpointColumns=await columns('agent_observation_checkpoints');
  if(!checkpointColumns.has('scheduled_for'))return false;
  return hasObjects('index',['uq_agent_observation_checkpoint_occurrence']);
}
async function verify055(){
  return hasObjects('index',['agent_persistent_tasks_scheduler_due']);
}
async function verify056(){
  if(!(await hasObjects('table',target056Tables)))return false;
  if(!(await hasObjects('index',target056Indexes)))return false;
  if(!(await hasObjects('trigger',target056Triggers)))return false;
  await requireColumns('agent_registry',['agent_id','canonical_name','actor_type','purpose','risk_tier','authority_state','execution_capable','owner_scope','created_at','updated_at','last_authority_change_at']);

  const rows=await query(`SELECT agent_id,canonical_name,actor_type,purpose,risk_tier,authority_state,execution_capable,owner_scope
    FROM agent_registry WHERE agent_id IN ('THEBE-001','SYS-FIN-OBS-001') ORDER BY agent_id`);
  if(rows.length!==2)fail(`canonical registry row count mismatch: ${rows.length}`);
  const byId=new Map(rows.map(row=>[String(row.agent_id),row]));
  const thebe=byId.get('THEBE-001'),observer=byId.get('SYS-FIN-OBS-001');
  if(!thebe||String(thebe.canonical_name)!=='thebe'||String(thebe.actor_type)!=='agent'||String(thebe.risk_tier)!=='high'||Number(thebe.execution_capable)!==1||String(thebe.owner_scope)!=='platform')fail('THEBE-001 canonical descriptor mismatch');
  if(!observer||String(observer.canonical_name)!=='system_observer'||String(observer.actor_type)!=='system_observer'||String(observer.risk_tier)!=='low'||Number(observer.execution_capable)!==0||String(observer.owner_scope)!=='platform')fail('SYS-FIN-OBS-001 canonical descriptor mismatch');
  const validStates=new Set(['active','restricted','suspended','revoked']);
  if(!validStates.has(String(thebe.authority_state))||!validStates.has(String(observer.authority_state)))fail('canonical authority state outside reviewed enum');

  const immutable=await objectSql('trigger','trg_agent_registry_identity_immutable');
  const noEscalation=await objectSql('trigger','trg_agent_registry_no_execution_escalation');
  const revokedTerminal=await objectSql('trigger','trg_agent_registry_revoked_terminal');
  if(!/BEFORE UPDATE OF canonical_name,actor_type,purpose,risk_tier,owner_scope/i.test(immutable)||!/canonical agent identity is immutable/i.test(immutable))fail('identity immutability trigger shape mismatch');
  if(!/OLD\.execution_capable=0 AND NEW\.execution_capable=1/i.test(noEscalation)||!/cannot grant execution authority/i.test(noEscalation))fail('execution escalation trigger shape mismatch');
  if(!/OLD\.authority_state='revoked'/i.test(revokedTerminal)||!/revoked agent identity is terminal/i.test(revokedTerminal))fail('revoked-terminal trigger shape mismatch');
  return true;
}

const verifiers=new Map([[51,verify051],[52,verify052],[53,verify053],[54,verify054],[55,verify055],[56,verify056]]);

async function loadReviewedMigration(spec){
  const sql=await readFile(spec.path,'utf8');
  const blob=createHash('sha1').update(`blob ${Buffer.byteLength(sql)}\0`).update(sql).digest('hex');
  if(blob!==spec.blob)fail(`reviewed migration ${spec.number} blob changed expected=${spec.blob} actual=${blob}`);
  return sql;
}

async function applyStage(spec,sql){
  const verify=verifiers.get(spec.number);
  if(await verify()){
    console.log(`Migration ${spec.number} already present and verified; skipping.`);
    return;
  }

  if(spec.number===54){
    const checkpointColumns=await columns('agent_observation_checkpoints');
    if(!checkpointColumns.has('scheduled_for')){
      console.log('Applying migration 54 scheduled_for column.');
      await query('ALTER TABLE agent_observation_checkpoints ADD COLUMN scheduled_for TEXT');
    }else{
      console.log('Migration 54 scheduled_for column already exists; skipping non-idempotent ALTER TABLE.');
    }
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_observation_checkpoint_occurrence
      ON agent_observation_checkpoints(tenant_id,persistent_task_id,scheduled_for)
      WHERE scheduled_for IS NOT NULL`);
  }else{
    // D1 accepts a reviewed multi-statement SQL payload. Execute trigger-bearing
    // migrations intact so CASE/BEGIN/END bodies are never split incorrectly.
    console.log(`Applying reviewed migration ${spec.number} as one intact D1 SQL payload.`);
    await query(sql);
  }

  if(!(await verify()))fail(`post-migration verification failed for migration ${spec.number}`);
  console.log(`Migration ${spec.number} verified.`);
}

await verifyBaseline();
const loaded=[];
for(const spec of reviewedMigrations)loaded.push([spec,await loadReviewedMigration(spec)]);

let complete=true;
for(const [spec] of loaded){
  if(!(await verifiers.get(spec.number)())){complete=false;break}
}
if(complete){
  const fk=await query('PRAGMA foreign_key_check');
  if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);
  console.log('Production D1 migrations 051-056 already present and verified; no mutation required.');
  process.exit(0);
}

const bookmarkBody=await cf(`/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`,{method:'GET'});
const bookmark=String(bookmarkBody?.result?.bookmark||'').trim();
if(!bookmark)fail('could not capture a pre-migration Time Travel bookmark');
console.log(`Pre-catch-up Time Travel bookmark captured: ${bookmark}`);

for(const [spec,sql] of loaded)await applyStage(spec,sql);

const fk=await query('PRAGMA foreign_key_check');
if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);
console.log('Production D1 migrations 051-056 verified successfully.');
console.log(`Rollback bookmark (Time Travel): ${bookmark}`);
