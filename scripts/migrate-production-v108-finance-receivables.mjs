import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {splitSqliteMigrationStatements} from './sqlite-migration-statements.mjs';

const API='https://api.cloudflare.com/client/v4';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();
const migrationPath='cloudflare/migrations/049_v108_finance_receivables.sql';
const expectedGitBlobSha='d89d634670665482955ab97f00ed57314a443e8c';
const targetTables=['finance_customers','finance_invoices','finance_invoice_allocations'];
const targetIndexes=[
  'finance_customers_tenant_idx',
  'finance_invoices_tenant_due_idx',
  'finance_invoices_customer_idx',
  'finance_invoice_allocations_invoice_idx',
  'finance_invoice_allocations_transaction_idx'
];
const targetTriggers=[
  'finance_invoices_customer_tenant_guard',
  'finance_invoice_allocations_apply_guard',
  'finance_invoice_allocations_reverse_guard',
  'finance_invoice_allocations_immutable_update',
  'finance_invoice_allocations_immutable_delete'
];

function fail(message){throw new Error(`Production D1 migration 049 refused: ${message}`)}
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
  const prerequisites=['tenants','users','finance_transactions','finance_lineage'];
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
const exactKnownPrefix=s=>s.presentTables.length===targetTables.length&&s.presentIndexes.length===targetIndexes.length&&s.presentTriggers.length===0;
async function assertKnownPrefixEmpty(){
  for(const table of targetTables){
    const rows=await query(`SELECT COUNT(*) count FROM ${table}`);
    const count=Number(rows[0]?.count||0);
    if(count!==0)fail(`cannot resume partial migration because ${table} contains ${count} row(s)`);
  }
}

const migration=await readFile(migrationPath,'utf8');
const gitBlobSha=createHash('sha1').update(`blob ${Buffer.byteLength(migration)}\0`).update(migration).digest('hex');
if(gitBlobSha!==expectedGitBlobSha)fail(`reviewed migration blob changed expected=${expectedGitBlobSha} actual=${gitBlobSha}`);

const before=await inspect();
if(complete(before)){console.log('Production D1 migration 049 already present; no mutation required.');process.exit(0)}
const resumeFromKnownPrefix=exactKnownPrefix(before);
if(!absent(before)&&!resumeFromKnownPrefix)fail(`partial migration detected tables=${before.presentTables.join(',')||'none'} indexes=${before.presentIndexes.join(',')||'none'} triggers=${before.presentTriggers.join(',')||'none'}`);
if(resumeFromKnownPrefix){
  await assertKnownPrefixEmpty();
  console.log('Detected exact empty migration-049 prefix (3 tables + 5 indexes, no triggers); resuming only the reviewed trigger suffix.');
}

const bookmarkBody=await cf(`/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`,{method:'GET'});
const bookmark=String(bookmarkBody?.result?.bookmark||'').trim();
if(!bookmark)fail('could not capture a pre-migration Time Travel bookmark');
console.log(`Pre-migration Time Travel bookmark captured: ${bookmark}`);
const statements=splitSqliteMigrationStatements(migration);
if(statements.length!==13)fail(`reviewed migration parsed into unexpected statement count: ${statements.length}`);
const startIndex=resumeFromKnownPrefix?8:0;
console.log(`Applying reviewed forward-only migration 049 to production D1 from statement ${startIndex+1}/${statements.length}.`);
for(let index=startIndex;index<statements.length;index+=1){
  try{await query(statements[index])}
  catch(error){throw new Error(`Migration 049 statement ${index+1}/${statements.length} failed: ${error.message}`)}
}

const after=await inspect();
if(!complete(after))fail(`post-migration verification incomplete tables=${after.presentTables.join(',')||'none'} indexes=${after.presentIndexes.join(',')||'none'} triggers=${after.presentTriggers.join(',')||'none'}`);
const fk=await query('PRAGMA foreign_key_check');
if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);
console.log('Production D1 migration 049 verified successfully.');
console.log(`Rollback bookmark (Time Travel): ${bookmark}`);
