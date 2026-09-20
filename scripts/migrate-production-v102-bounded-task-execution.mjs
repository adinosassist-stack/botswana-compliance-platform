import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const API='https://api.cloudflare.com/client/v4';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();
const migrationPath='cloudflare/migrations/048_v102_bounded_internal_task_execution.sql';
const expectedGitBlobSha='c716b937a63e91a127bda5b3425cbd0b1e17c969';
const targetTables=['agent_execution_grants','agent_task_requests','agent_internal_tasks','agent_execution_receipts'];
const targetIndexes=['agent_execution_grants_lookup_idx','agent_task_requests_tenant_idx','agent_internal_tasks_tenant_idx','agent_execution_receipts_tenant_idx'];
const targetTriggers=['agent_execution_grants_delegation_guard','agent_task_requests_intent_guard','agent_task_requests_grant_guard','agent_execution_receipts_tenant_guard'];

function fail(message){throw new Error(`Production D1 migration 048 refused: ${message}`)}
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
async function inspect(){
  const tables=await names('table'),indexes=await names('index'),triggers=await names('trigger');
  const prerequisites=['tenants','users','audit_events','agent_delegations','agent_action_intents','agent_delegation_events'];
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

const migration=await readFile(migrationPath,'utf8');
const gitBlobSha=createHash('sha1').update(`blob ${Buffer.byteLength(migration)}\0`).update(migration).digest('hex');
if(gitBlobSha!==expectedGitBlobSha)fail(`reviewed migration blob changed expected=${expectedGitBlobSha} actual=${gitBlobSha}`);

const before=await inspect();
if(complete(before)){console.log('Production D1 migration 048 already present; no mutation required.');process.exit(0)}
if(!absent(before))fail(`partial migration detected tables=${before.presentTables.join(',')||'none'} indexes=${before.presentIndexes.join(',')||'none'} triggers=${before.presentTriggers.join(',')||'none'}`);

const bookmarkBody=await cf(`/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`,{method:'GET'});
const bookmark=String(bookmarkBody?.result?.bookmark||'').trim();
if(!bookmark)fail('could not capture a pre-migration Time Travel bookmark');
console.log(`Pre-migration Time Travel bookmark captured: ${bookmark}`);
console.log('Applying reviewed forward-only migration 048 to production D1.');
await query(migration);

const after=await inspect();
if(!complete(after))fail(`post-migration verification incomplete tables=${after.presentTables.join(',')||'none'} indexes=${after.presentIndexes.join(',')||'none'} triggers=${after.presentTriggers.join(',')||'none'}`);
const fk=await query('PRAGMA foreign_key_check');
if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);
console.log('Production D1 migration 048 verified successfully.');
console.log(`Rollback bookmark (Time Travel): ${bookmark}`);
