import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {execFile as execFileCallback} from 'node:child_process';
import {promisify} from 'node:util';

const API='https://api.cloudflare.com/client/v4';
const token=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const accountId=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const databaseId=String(process.env.D1_DATABASE_ID||'').trim();
const wranglerJs=String(process.env.WRANGLER_JS||'').trim();
const wranglerConfig=String(process.env.WRANGLER_CONFIG||'').trim();
const execFile=promisify(execFileCallback);
const spec=Object.freeze({number:59,path:'cloudflare/migrations/059_v168_jobs_linking.sql',blob:'988488b0021b921261ebb4d255f6c620cbbf59ba'});

function fail(message){throw new Error(`Production D1 migration 059 refused: ${message}`)}
if(!token)fail('CLOUDFLARE_API_TOKEN is empty');
if(!/^[0-9a-fA-F]{32}$/.test(accountId))fail('CLOUDFLARE_ACCOUNT_ID is invalid');
if(!/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(databaseId))fail('D1_DATABASE_ID is invalid');
if(!wranglerJs||!wranglerConfig)fail('Wrangler migration transport is incomplete');

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
async function names(type){return new Set((await query('SELECT name FROM sqlite_master WHERE type=?',[type])).map(r=>String(r.name||'')))}
async function columns(table){return new Set((await query(`PRAGMA table_info(${table})`)).map(r=>String(r.name||'')))}
async function objectSql(type,name){const rows=await query('SELECT sql FROM sqlite_master WHERE type=? AND name=? LIMIT 1',[type,name]);return String(rows?.[0]?.sql||'')}
async function requireColumns(table,required){const present=await columns(table);const missing=required.filter(x=>!present.has(x));if(missing.length)fail(`${table} missing column(s): ${missing.join(',')}`)}

async function verifyPrerequisites(){
  const tables=await names('table');
  for(const name of ['tenants','users','finance_suppliers','finance_payables','finance_payable_allocations','business_memory_items','business_memory_events']){
    if(!tables.has(name))fail(`prerequisite schema through 058 is incomplete: missing ${name}`);
  }
}
async function verify059(){
  const tables=await names('table');
  if(!tables.has('job_openings')||!tables.has('job_applications'))return false;
  const indexes=await names('index');
  for(const name of ['job_openings_tenant_status_idx','job_applications_job_status_idx'])if(!indexes.has(name))return false;
  const triggers=await names('trigger');
  for(const name of ['job_applications_tenant_guard','job_applications_open_guard'])if(!triggers.has(name))return false;
  await requireColumns('job_openings',['id','tenant_id','title','location','employment_type','description','status','closes_on','public_token_hash','created_by_user_id','created_at','updated_at']);
  await requireColumns('job_applications',['id','tenant_id','job_id','full_name','contact_type','contact_value','contact_hash','summary','status','consent_at','created_at','updated_at']);
  const openings=await objectSql('table','job_openings'),apps=await objectSql('table','job_applications');
  if(!/public_token_hash\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(openings))fail('public job token hash uniqueness missing');
  if(!/UNIQUE\s*\(\s*tenant_id\s*,\s*job_id\s*,\s*contact_hash\s*\)/i.test(apps))fail('application contact dedupe constraint missing');
  const tenantGuard=await objectSql('trigger','job_applications_tenant_guard');
  const openGuard=await objectSql('trigger','job_applications_open_guard');
  if(!/job_opening_tenant_mismatch/i.test(tenantGuard)||!/NEW\.tenant_id/i.test(tenantGuard))fail('job application tenant guard shape mismatch');
  if(!/job_opening_not_accepting_applications/i.test(openGuard)||!/status='open'/i.test(openGuard))fail('job application open-role guard shape mismatch');
  return true;
}
async function executeMigration(){
  const args=[wranglerJs,'d1','execute','DB','--remote',`--file=${spec.path}`,`--config=${wranglerConfig}`,'--yes'];
  try{
    const result=await execFile(process.execPath,args,{env:{...process.env,CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:accountId},maxBuffer:8*1024*1024});
    console.log(`Wrangler D1 migration 059 completed: ${safe(`${result?.stdout||''} ${result?.stderr||''}`)}`);
  }catch(error){throw new Error(`Migration 059 Wrangler D1 execution failed: ${safe(error?.stderr||error?.stdout||error?.message||error)}`)}
}
await verifyPrerequisites();
const sql=await readFile(spec.path,'utf8');
const actual=createHash('sha1').update(`blob ${Buffer.byteLength(sql)}\0`).update(sql).digest('hex');
if(actual!==spec.blob)fail(`reviewed migration blob changed expected=${spec.blob} actual=${actual}`);
if(await verify059()){
  const fk=await query('PRAGMA foreign_key_check');if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);
  console.log('Production D1 migration 059 already present and verified; no mutation required.');process.exit(0);
}
const bookmarkBody=await cf(`/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`,{method:'GET'});
const bookmark=String(bookmarkBody?.result?.bookmark||'').trim();if(!bookmark)fail('could not capture a pre-migration Time Travel bookmark');
console.log(`Pre-migration Time Travel bookmark captured: ${bookmark}`);
await executeMigration();
if(!(await verify059()))fail('post-migration verification failed');
const fk=await query('PRAGMA foreign_key_check');if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);
console.log('Production D1 migration 059 verified successfully.');
console.log(`Rollback bookmark (Time Travel): ${bookmark}`);
