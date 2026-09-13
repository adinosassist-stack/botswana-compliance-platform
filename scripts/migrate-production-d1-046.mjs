import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const API = 'https://api.cloudflare.com/client/v4';
const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const databaseId = String(process.env.D1_DATABASE_ID || '').trim();
const migrationPath = 'cloudflare/migrations/046_v80_agentic_outcomes.sql';
const expectedGitBlobSha = '739d742c6918ef758aaab1a2b0c31e98e40e1626';
const targetTables = ['agentic_outcomes'];
const targetIndexes = ['agentic_outcomes_tenant_idx','agentic_outcomes_proposal_idx','agentic_outcomes_run_idx'];

function fail(message) { throw new Error(`Production D1 migration 046 refused: ${message}`); }
if (!token) fail('CLOUDFLARE_API_TOKEN is empty');
if (!/^[0-9a-fA-F]{32}$/.test(accountId)) fail('CLOUDFLARE_ACCOUNT_ID is invalid');
if (!/^[0-9a-fA-F-]{36}$/.test(databaseId)) fail('D1_DATABASE_ID is invalid');

const headers = {Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json'};
const safe=value=>String(value||'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,500);
async function cf(path,options={}){
  const response=await fetch(`${API}${path}`,{...options,headers:{...headers,...(options.headers||{})}});
  const text=await response.text();let body=null;try{body=text?JSON.parse(text):null}catch{}
  if(!response.ok||body?.success===false){
    const errors=Array.isArray(body?.errors)?body.errors.map(e=>`${e?.code??'unknown'}:${e?.message??'unknown'}`).join(' | '):safe(text);
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
async function names(type){const rows=await query('SELECT name FROM sqlite_master WHERE type=?',[type]);return new Set(rows.map(row=>String(row.name||'')))}
async function inspect(){
  const tables=await names('table'),indexes=await names('index');
  const prerequisiteTables=['tenants','users','agentic_runs','agentic_proposals','agentic_events','finance_accounts','finance_transactions','finance_reconciliation_runs','finance_lineage'];
  const missingPrerequisites=prerequisiteTables.filter(name=>!tables.has(name));
  if(missingPrerequisites.length)fail(`earlier schema prerequisites are missing: ${missingPrerequisites.join(', ')}`);
  return {tables,indexes,presentTables:targetTables.filter(name=>tables.has(name)),presentIndexes:targetIndexes.filter(name=>indexes.has(name))};
}
const targetComplete=state=>state.presentTables.length===targetTables.length&&state.presentIndexes.length===targetIndexes.length;
const targetAbsent=state=>state.presentTables.length===0&&state.presentIndexes.length===0;

const migration=await readFile(migrationPath,'utf8');
const gitBlobSha=createHash('sha1').update(`blob ${Buffer.byteLength(migration)}\0`).update(migration).digest('hex');
if(gitBlobSha!==expectedGitBlobSha)fail(`reviewed migration blob changed expected=${expectedGitBlobSha} actual=${gitBlobSha}`);
const before=await inspect();
if(targetComplete(before)){console.log('Production D1 migration 046 already present; no mutation required.');process.exit(0)}
if(!targetAbsent(before))fail(`partial migration detected tables=${before.presentTables.join(',')||'none'} indexes=${before.presentIndexes.join(',')||'none'}`);

const bookmarkBody=await cf(`/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`,{method:'GET'});
const bookmark=String(bookmarkBody?.result?.bookmark||'').trim();
if(!bookmark)fail('could not capture a pre-migration Time Travel bookmark');
console.log(`Pre-migration Time Travel bookmark captured: ${bookmark}`);
console.log('Applying reviewed forward-only migration 046 to production D1.');
await query(migration);
const after=await inspect();
if(!targetComplete(after))fail(`post-migration verification incomplete tables=${after.presentTables.join(',')} indexes=${after.presentIndexes.join(',')}`);
const foreignKeyViolations=await query('PRAGMA foreign_key_check');
if(foreignKeyViolations.length)fail(`foreign key verification failed with ${foreignKeyViolations.length} violation(s)`);
console.log('Production D1 migration 046 verified successfully.');
console.log(`Rollback bookmark (Time Travel): ${bookmark}`);
