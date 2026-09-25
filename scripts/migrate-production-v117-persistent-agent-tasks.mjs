import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {splitSqliteMigrationStatements} from './sqlite-migration-statements.mjs';

const API='https://api.cloudflare.com/client/v4';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();
const migrationPath='cloudflare/migrations/051_v117_persistent_agent_tasks.sql';
const expectedGitBlobSha='f05582d7dc9354710af43de2760e4786f8cab95c';
const targetTables=['agent_persistent_tasks','agent_persistent_task_events'];
const targetIndexes=['agent_persistent_tasks_due','agent_persistent_task_events_task'];
const targetTriggers=['agent_persistent_task_event_tenant_guard'];

function fail(message){throw new Error(`Production D1 migration 051 refused: ${message}`)}
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
  return String(rows[0]?.sql||'');
}
async function inspect(){
  const tables=await names('table'),indexes=await names('index'),triggers=await names('trigger');
  const prerequisites=['tenants','users','audit_events'];
  const missing=prerequisites.filter(name=>!tables.has(name));
  if(missing.length)fail(`earlier schema prerequisites are missing: ${missing.join(', ')}`);
  return {
    presentTables:targetTables.filter(name=>tables.has(name)),
    presentIndexes:targetIndexes.filter(name=>indexes.has(name)),
    presentTriggers:targetTriggers.filter(name=>triggers.has(name))
  };
}
const complete=s=>s.presentTables.length===targetTables.length&&s.presentIndexes.length===targetIndexes.length&&s.presentTriggers.length===targetTriggers.length;
const absent=s=>s.presentTables.length===0&&s.presentIndexes.length===0&&s.presentTriggers.length===0;

async function verifyShape(){
  const tasks=await columns('agent_persistent_tasks');
  for(const name of ['id','tenant_id','owner_user_id','agent_key','objective','status','trigger_kind','trigger_spec_json','allowed_tools_json','risk_policy_json','approval_policy_json','budget_json','checkpoint_json','last_verified_state_json','next_run_at','last_run_at','created_at','updated_at']){
    if(!tasks.has(name))fail(`agent_persistent_tasks missing column ${name}`);
  }
  const events=await columns('agent_persistent_task_events');
  for(const name of ['id','tenant_id','persistent_task_id','event_type','event_data','created_at']){
    if(!events.has(name))fail(`agent_persistent_task_events missing column ${name}`);
  }
  const taskSql=await objectSql('table','agent_persistent_tasks');
  if(!/CHECK\s*\(\s*agent_key\s*=\s*'thebe'\s*\)/i.test(taskSql))fail('single-agent CHECK(agent_key=thebe) is missing');
  if(!/CHECK\s*\(\s*status\s+IN\s*\(\s*'active'\s*,\s*'paused'\s*,\s*'completed'\s*,\s*'cancelled'\s*\)\s*\)/i.test(taskSql))fail('persistent-task status constraint is missing');
  const triggerSql=await objectSql('trigger','agent_persistent_task_event_tenant_guard');
  if(!/persistent_task_tenant_mismatch/.test(triggerSql))fail('tenant-integrity trigger body is missing');
}

const migration=await readFile(migrationPath,'utf8');
const gitBlobSha=createHash('sha1').update(`blob ${Buffer.byteLength(migration)}\0`).update(migration).digest('hex');
if(gitBlobSha!==expectedGitBlobSha)fail(`reviewed migration blob changed expected=${expectedGitBlobSha} actual=${gitBlobSha}`);

const before=await inspect();
if(complete(before)){
  await verifyShape();
  console.log('Production D1 migration 051 already present; no mutation required.');
  process.exit(0);
}
if(!absent(before)){
  fail(`partial migration detected tables=${before.presentTables.join(',')||'none'} indexes=${before.presentIndexes.join(',')||'none'} triggers=${before.presentTriggers.join(',')||'none'}`);
}

const bookmarkBody=await cf(`/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`,{method:'GET'});
const bookmark=String(bookmarkBody?.result?.bookmark||'').trim();
if(!bookmark)fail('could not capture a pre-migration Time Travel bookmark');
console.log(`Pre-migration Time Travel bookmark captured: ${bookmark}`);

const statements=splitSqliteMigrationStatements(migration);
if(statements.length!==6)fail(`reviewed migration parsed into unexpected statement count: ${statements.length}`);
console.log(`Applying reviewed idempotent forward-only migration 051 to production D1 (${statements.length} statements).`);
for(let index=0;index<statements.length;index+=1){
  try{await query(statements[index])}
  catch(error){throw new Error(`Migration 051 statement ${index+1}/${statements.length} failed: ${error.message}`)}
}

const after=await inspect();
if(!complete(after))fail(`post-migration verification incomplete tables=${after.presentTables.join(',')||'none'} indexes=${after.presentIndexes.join(',')||'none'} triggers=${after.presentTriggers.join(',')||'none'}`);
await verifyShape();
const fk=await query('PRAGMA foreign_key_check');
if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);
console.log('Production D1 migration 051 verified successfully.');
console.log(`Rollback bookmark (Time Travel): ${bookmark}`);
