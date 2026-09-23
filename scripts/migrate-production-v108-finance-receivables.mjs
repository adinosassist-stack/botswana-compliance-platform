import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const API='https://api.cloudflare.com/client/v4';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();
const migrationPath='cloudflare/migrations/049_v108_finance_receivables.sql';
const expectedGitBlobSha='a3f34d31f2d68798761942b54a4fdfb7ee5ba73e';
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

function splitMigrationStatements(sql){
  const statements=[];let buffer=[],trigger=false;
  for(const rawLine of String(sql||'').split(/\r?\n/)){
    const line=rawLine.trim();
    if(!buffer.length&&(!line||line.startsWith('--')))continue;
    if(!buffer.length&&/^CREATE\s+TRIGGER\b/i.test(line))trigger=true;
    buffer.push(rawLine);
    if(trigger){
      if(/^END;\s*$/i.test(line)){
        statements.push(buffer.join('\n').trim());buffer=[];trigger=false;
      }
    }else if(/;\s*$/.test(line)){
      statements.push(buffer.join('\n').trim());buffer=[];
    }
  }
  if(buffer.some(line=>String(line).trim()))fail('migration parser ended with incomplete SQL');
  return statements;
}
async function batch(statements){
  const payload={batch:statements.map(sql=>({sql,params:[]}))};
  const body=await cf(`/accounts/${accountId}/d1/database/${databaseId}/query`,{method:'POST',body:JSON.stringify(payload)});
  const results=Array.isArray(body?.result)?body.result:[];
  if(results.length!==statements.length||results.some(r=>r?.success===false)){
    fail(`D1 batch failed expected=${statements.length} results=${results.length}`);
  }
  return results;
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

const migration=await readFile(migrationPath,'utf8');
const gitBlobSha=createHash('sha1').update(`blob ${Buffer.byteLength(migration)}\0`).update(migration).digest('hex');
if(gitBlobSha!==expectedGitBlobSha)fail(`reviewed migration blob changed expected=${expectedGitBlobSha} actual=${gitBlobSha}`);

const before=await inspect();
if(complete(before)){console.log('Production D1 migration 049 already present; no mutation required.');process.exit(0)}
if(!absent(before))fail(`partial migration detected tables=${before.presentTables.join(',')||'none'} indexes=${before.presentIndexes.join(',')||'none'} triggers=${before.presentTriggers.join(',')||'none'}`);

const bookmarkBody=await cf(`/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`,{method:'GET'});
const bookmark=String(bookmarkBody?.result?.bookmark||'').trim();
if(!bookmark)fail('could not capture a pre-migration Time Travel bookmark');
console.log(`Pre-migration Time Travel bookmark captured: ${bookmark}`);
const statements=splitMigrationStatements(migration);
if(statements.length!==13)fail(`reviewed migration parser expected 13 statements, got ${statements.length}`);
console.log(`Applying reviewed forward-only migration 049 to production D1 as ${statements.length} complete statements.`);
await batch(statements);

const after=await inspect();
if(!complete(after))fail(`post-migration verification incomplete tables=${after.presentTables.join(',')||'none'} indexes=${after.presentIndexes.join(',')||'none'} triggers=${after.presentTriggers.join(',')||'none'}`);
const fk=await query('PRAGMA foreign_key_check');
if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);
console.log('Production D1 migration 049 verified successfully.');
console.log(`Rollback bookmark (Time Travel): ${bookmark}`);
