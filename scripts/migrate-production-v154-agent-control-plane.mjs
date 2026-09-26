import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {splitSqliteMigrationStatements} from './sqlite-migration-statements.mjs';

const API='https://api.cloudflare.com/client/v4';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();
const migrationPath='cloudflare/migrations/056_v154_agent_control_plane.sql';
const expectedGitBlobSha='86d033543e5eb47ec2da3fd5e4e44e82e25ec5cd';

const targetTables=['agent_registry','agent_authority_events','agent_authority_drift_findings'];
const targetIndexes=['idx_agent_authority_events_agent_created','idx_agent_authority_drift_agent_status','uq_agent_authority_drift_open'];
const targetTriggers=['trg_agent_registry_identity_immutable','trg_agent_registry_no_execution_escalation','trg_agent_registry_revoked_terminal'];
const prerequisiteTables=[
  'tenants','users','audit_events','agent_delegations','agent_action_intents','agent_execution_grants',
  'agent_task_requests','agent_internal_tasks','agent_execution_receipts','agent_persistent_tasks',
  'agent_observation_checkpoints','agent_observation_claims','finance_customers','finance_invoices','finance_invoice_allocations'
];
const prerequisiteIndexes=['uq_agent_observation_checkpoint_occurrence','agent_persistent_tasks_scheduler_due'];

function fail(message){throw new Error(`Production D1 migration 056 refused: ${message}`)}
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
async function objectSql(type,name){
  const rows=await query('SELECT sql FROM sqlite_master WHERE type=? AND name=? LIMIT 1',[type,name]);
  return String(rows?.[0]?.sql||'');
}
async function inspect(){
  const tables=await names('table'),indexes=await names('index'),triggers=await names('trigger');
  const missingTables=prerequisiteTables.filter(name=>!tables.has(name));
  const missingIndexes=prerequisiteIndexes.filter(name=>!indexes.has(name));
  if(missingTables.length||missingIndexes.length){
    fail(`earlier schema prerequisites are missing tables=${missingTables.join(',')||'none'} indexes=${missingIndexes.join(',')||'none'}`);
  }
  return {
    presentTables:targetTables.filter(name=>tables.has(name)),
    presentIndexes:targetIndexes.filter(name=>indexes.has(name)),
    presentTriggers:targetTriggers.filter(name=>triggers.has(name))
  };
}
const complete=s=>s.presentTables.length===targetTables.length&&s.presentIndexes.length===targetIndexes.length&&s.presentTriggers.length===targetTriggers.length;

async function verifyCanonicalShape(){
  const rows=await query(`SELECT agent_id,canonical_name,actor_type,purpose,risk_tier,authority_state,execution_capable,owner_scope
    FROM agent_registry WHERE agent_id IN ('THEBE-001','SYS-FIN-OBS-001') ORDER BY agent_id`);
  if(rows.length!==2)fail(`canonical registry row count mismatch: ${rows.length}`);
  const byId=new Map(rows.map(row=>[String(row.agent_id),row]));
  const thebe=byId.get('THEBE-001'),observer=byId.get('SYS-FIN-OBS-001');
  if(!thebe||String(thebe.canonical_name)!=='thebe'||String(thebe.actor_type)!=='agent'||String(thebe.risk_tier)!=='high'||Number(thebe.execution_capable)!==1||String(thebe.owner_scope)!=='platform'){
    fail('THEBE-001 canonical descriptor mismatch');
  }
  if(!observer||String(observer.canonical_name)!=='system_observer'||String(observer.actor_type)!=='system_observer'||String(observer.risk_tier)!=='low'||Number(observer.execution_capable)!==0||String(observer.owner_scope)!=='platform'){
    fail('SYS-FIN-OBS-001 canonical descriptor mismatch');
  }
  const validStates=new Set(['active','restricted','suspended','revoked']);
  if(!validStates.has(String(thebe.authority_state))||!validStates.has(String(observer.authority_state)))fail('canonical authority state outside reviewed enum');

  const immutable=await objectSql('trigger','trg_agent_registry_identity_immutable');
  const noEscalation=await objectSql('trigger','trg_agent_registry_no_execution_escalation');
  const revokedTerminal=await objectSql('trigger','trg_agent_registry_revoked_terminal');
  if(!/BEFORE UPDATE OF canonical_name,actor_type,purpose,risk_tier,owner_scope/i.test(immutable)||!/canonical agent identity is immutable/i.test(immutable))fail('identity immutability trigger shape mismatch');
  if(!/OLD\.execution_capable=0 AND NEW\.execution_capable=1/i.test(noEscalation)||!/cannot grant execution authority/i.test(noEscalation))fail('execution escalation trigger shape mismatch');
  if(!/OLD\.authority_state='revoked'/i.test(revokedTerminal)||!/revoked agent identity is terminal/i.test(revokedTerminal))fail('revoked-terminal trigger shape mismatch');
}

const migration=await readFile(migrationPath,'utf8');
const gitBlobSha=createHash('sha1').update(`blob ${Buffer.byteLength(migration)}\0`).update(migration).digest('hex');
if(gitBlobSha!==expectedGitBlobSha)fail(`reviewed migration blob changed expected=${expectedGitBlobSha} actual=${gitBlobSha}`);

const before=await inspect();
if(complete(before)){
  await verifyCanonicalShape();
  const fk=await query('PRAGMA foreign_key_check');
  if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);
  console.log('Production D1 migration 056 already present and verified; no mutation required.');
  process.exit(0);
}

const bookmarkBody=await cf(`/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`,{method:'GET'});
const bookmark=String(bookmarkBody?.result?.bookmark||'').trim();
if(!bookmark)fail('could not capture a pre-migration Time Travel bookmark');
console.log(`Pre-migration Time Travel bookmark captured: ${bookmark}`);

const statements=splitSqliteMigrationStatements(migration);
if(statements.length<10)fail(`reviewed migration parsed into unexpectedly few statements: ${statements.length}`);
console.log(`Applying reviewed idempotent forward-only migration 056 to production D1 (${statements.length} statements).`);
for(let index=0;index<statements.length;index+=1){
  try{await query(statements[index])}
  catch(error){throw new Error(`Migration 056 statement ${index+1}/${statements.length} failed: ${error.message}`)}
}

const after=await inspect();
if(!complete(after))fail(`post-migration verification incomplete tables=${after.presentTables.join(',')||'none'} indexes=${after.presentIndexes.join(',')||'none'} triggers=${after.presentTriggers.join(',')||'none'}`);
await verifyCanonicalShape();
const fk=await query('PRAGMA foreign_key_check');
if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);
console.log('Production D1 migration 056 verified successfully.');
console.log(`Rollback bookmark (Time Travel): ${bookmark}`);
