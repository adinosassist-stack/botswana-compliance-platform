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
const spec=Object.freeze({number:57,path:'cloudflare/migrations/057_v157_business_memory_money_intelligence.sql',blob:'4f8c775d1efba705900d6495ba660c6268d4aa8f'});

function fail(message){throw new Error(`Production D1 migration 057 refused: ${message}`)}
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
  for(const name of ['tenants','users','agent_registry','agent_authority_events','agent_authority_drift_findings']){
    if(!tables.has(name))fail(`prerequisite schema through 056 is incomplete: missing ${name}`);
  }
}
async function verify057(){
  const tables=await names('table');
  if(!tables.has('business_memory_items')||!tables.has('business_memory_events'))return false;
  const indexes=await names('index');
  for(const name of ['uq_business_memory_active_key','idx_business_memory_tenant_status','idx_business_memory_events_tenant_created'])if(!indexes.has(name))return false;
  const triggers=await names('trigger');
  if(!triggers.has('trg_business_memory_source_immutable'))return false;
  await requireColumns('business_memory_items',['id','tenant_id','namespace','memory_key','value_json','value_type','source_kind','confidence','status','created_by_user_id','created_at','updated_at','superseded_at']);
  await requireColumns('business_memory_events',['id','tenant_id','memory_item_id','event_type','actor_user_id','value_hash','created_at']);
  const trigger=await objectSql('trigger','trg_business_memory_source_immutable');
  if(!/BEFORE UPDATE OF source_kind,tenant_id,namespace,memory_key,value_type,value_json/i.test(trigger)||!/business memory facts are immutable; supersede instead/i.test(trigger))fail('business memory immutability trigger shape mismatch');
  return true;
}
async function executeMigration(){
  const args=[wranglerJs,'d1','execute','DB','--remote',`--file=${spec.path}`,`--config=${wranglerConfig}`,'--yes'];
  try{
    const result=await execFile(process.execPath,args,{env:{...process.env,CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:accountId},maxBuffer:8*1024*1024});
    console.log(`Wrangler D1 migration 057 completed: ${safe(`${result?.stdout||''} ${result?.stderr||''}`)}`);
  }catch(error){throw new Error(`Migration 057 Wrangler D1 execution failed: ${safe(error?.stderr||error?.stdout||error?.message||error)}`)}
}

await verifyPrerequisites();
const sql=await readFile(spec.path,'utf8');
const blob=createHash('sha1').update(`blob ${Buffer.byteLength(sql)}\0`).update(sql).digest('hex');
if(blob!==spec.blob)fail(`reviewed migration blob changed expected=${spec.blob} actual=${blob}`);
if(await verify057()){
  const fk=await query('PRAGMA foreign_key_check');if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);
  console.log('Production D1 migration 057 already present and verified; no mutation required.');
  process.exit(0);
}
const bookmarkBody=await cf(`/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`,{method:'GET'});
const bookmark=String(bookmarkBody?.result?.bookmark||'').trim();
if(!bookmark)fail('could not capture a pre-migration Time Travel bookmark');
console.log(`Pre-migration Time Travel bookmark captured: ${bookmark}`);
await executeMigration();
if(!(await verify057()))fail('post-migration verification failed');
const fk=await query('PRAGMA foreign_key_check');if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);
console.log('Production D1 migration 057 verified successfully.');
console.log(`Rollback bookmark (Time Travel): ${bookmark}`);
