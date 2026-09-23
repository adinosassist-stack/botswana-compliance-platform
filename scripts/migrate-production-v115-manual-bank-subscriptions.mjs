import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {splitSqliteMigrationStatements} from './sqlite-migration-statements.mjs';

const API='https://api.cloudflare.com/client/v4';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();
const migrationPath='cloudflare/migrations/050_v115_manual_bank_subscriptions.sql';
const expectedGitBlobSha='9fc8a50b365e20eb313166912b7b42a266f1322b';
const targetTables=['manual_payment_submissions','manual_payment_events'];
const targetIndexes=[
  'manual_payment_submissions_queue_idx',
  'manual_payment_submissions_tenant_idx',
  'manual_payment_events_submission_idx'
];

function fail(message){throw new Error(`Production D1 migration 050 refused: ${message}`)}
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
async function inspect(){
  const tables=await names('table'),indexes=await names('index');
  const prerequisites=['tenants','payment_orders'];
  const missing=prerequisites.filter(name=>!tables.has(name));
  if(missing.length)fail(`earlier schema prerequisites are missing: ${missing.join(', ')}`);
  return {
    presentTables:targetTables.filter(name=>tables.has(name)),
    presentIndexes:targetIndexes.filter(name=>indexes.has(name))
  };
}
async function verifyShape(){
  const submissions=await columns('manual_payment_submissions');
  for(const name of ['id','payment_order_id','tenant_id','bank_reference','status','submitted_at','reviewed_at','reviewed_by_user_id','rejection_reason']){
    if(!submissions.has(name))fail(`manual_payment_submissions missing column ${name}`);
  }
  const events=await columns('manual_payment_events');
  for(const name of ['id','submission_id','payment_order_id','tenant_id','event_type','actor_user_id','event_data','created_at']){
    if(!events.has(name))fail(`manual_payment_events missing column ${name}`);
  }
}
const complete=s=>s.presentTables.length===targetTables.length&&s.presentIndexes.length===targetIndexes.length;

const migration=await readFile(migrationPath,'utf8');
const gitBlobSha=createHash('sha1').update(`blob ${Buffer.byteLength(migration)}\0`).update(migration).digest('hex');
if(gitBlobSha!==expectedGitBlobSha)fail(`reviewed migration blob changed expected=${expectedGitBlobSha} actual=${gitBlobSha}`);

const before=await inspect();
if(complete(before)){
  await verifyShape();
  console.log('Production D1 migration 050 already present; no mutation required.');
  process.exit(0);
}
const bookmarkBody=await cf(`/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`,{method:'GET'});
const bookmark=String(bookmarkBody?.result?.bookmark||'').trim();
if(!bookmark)fail('could not capture a pre-migration Time Travel bookmark');
console.log(`Pre-migration Time Travel bookmark captured: ${bookmark}`);

const statements=splitSqliteMigrationStatements(migration);
if(statements.length!==5)fail(`reviewed migration parsed into unexpected statement count: ${statements.length}`);
console.log(`Applying reviewed idempotent forward-only migration 050 to production D1 (${statements.length} statements).`);
for(let index=0;index<statements.length;index+=1){
  try{await query(statements[index])}
  catch(error){throw new Error(`Migration 050 statement ${index+1}/${statements.length} failed: ${error.message}`)}
}
const after=await inspect();
if(!complete(after))fail(`post-migration verification incomplete tables=${after.presentTables.join(',')||'none'} indexes=${after.presentIndexes.join(',')||'none'}`);
await verifyShape();
const fk=await query('PRAGMA foreign_key_check');
if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);
console.log('Production D1 migration 050 verified successfully.');
console.log(`Rollback bookmark (Time Travel): ${bookmark}`);
