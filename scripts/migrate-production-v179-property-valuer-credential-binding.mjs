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
const spec=Object.freeze({number:63,path:'cloudflare/migrations/063_v179_property_valuer_credential_binding.sql',blob:'d1ac900198ff90e400949df07e3e4a7097c8f28b'});

function fail(message){throw new Error(`Production D1 migration 063 refused: ${message}`)}
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
async function requireColumns(table,required){const present=await columns(table),missing=required.filter(x=>!present.has(x));if(missing.length)fail(`${table} missing column(s): ${missing.join(',')}`)}
async function requireTrigger(name,patterns){const sql=await objectSql('trigger',name);if(!sql)fail(`missing trigger ${name}`);for(const pattern of patterns)if(!pattern.test(sql))fail(`trigger ${name} shape mismatch for ${pattern}`)}

async function verifyPrerequisites(){
  const tables=await names('table');
  for(const name of ['tenants','users','property_assets','property_professional_valuations','property_valuation_service_requests','property_valuation_service_events','service_orders','professional_profiles']){
    if(!tables.has(name))fail(`prerequisite schema through 062 is incomplete: missing ${name}`);
  }
}
async function verify063(){
  const tables=await names('table');
  if(!tables.has('professional_credential_events'))return false;
  await requireColumns('professional_profiles',[
    'registration_ref','registration_authority','registration_jurisdiction','registration_valid_until',
    'credential_verified_at','credential_verified_by_user_id','credential_verification_note'
  ]);
  const indexes=await names('index');
  if(!indexes.has('professional_verified_registration_uq')||!indexes.has('professional_credential_events_user_idx'))return false;
  const triggers=await names('trigger');
  for(const name of [
    'professional_valuer_verified_credential_guard_insert',
    'professional_valuer_verified_credential_guard_update',
    'property_valuation_service_assignment_credential_guard',
    'property_valuation_service_issued_credential_guard'
  ])if(!triggers.has(name))return false;
  await requireTrigger('professional_valuer_verified_credential_guard_insert',[/professional_valuer_credential_required/i,/credential_verified_at/i,/registration_valid_until/i]);
  await requireTrigger('professional_valuer_verified_credential_guard_update',[/professional_valuer_credential_expired/i,/credential_verified_at/i]);
  await requireTrigger('property_valuation_service_assignment_credential_guard',[/property_valuation_service_professional_credential_mismatch/i,/registration_authority/i,/registration_jurisdiction/i,/credential_verified_at/i]);
  await requireTrigger('property_valuation_service_issued_credential_guard',[/property_valuation_service_credential_mismatch/i,/valuer_registration_ref/i,/registration_ref/i,/credential_verified_at/i]);
  return true;
}
async function executeMigration(){
  const args=[wranglerJs,'d1','execute','DB','--remote',`--file=${spec.path}`,`--config=${wranglerConfig}`,'--yes'];
  try{
    const result=await execFile(process.execPath,args,{env:{...process.env,CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:accountId},maxBuffer:8*1024*1024});
    console.log(`Wrangler D1 migration 063 completed: ${safe(`${result?.stdout||''} ${result?.stderr||''}`)}`);
  }catch(error){throw new Error(`Migration 063 Wrangler D1 execution failed: ${safe(error?.stderr||error?.stdout||error?.message||error)}`)}
}

await verifyPrerequisites();
const sql=await readFile(spec.path,'utf8');
const actualBlob=createHash('sha1').update(`blob ${Buffer.byteLength(sql)}\0`).update(sql).digest('hex');
if(actualBlob!==spec.blob)fail(`reviewed migration blob changed expected=${spec.blob} actual=${actualBlob}`);
if(await verify063()){
  const fk=await query('PRAGMA foreign_key_check');if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);
  console.log('Production D1 migration 063 already present and verified; no mutation required.');process.exit(0);
}
const bookmarkBody=await cf(`/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`,{method:'GET'});
const bookmark=String(bookmarkBody?.result?.bookmark||'').trim();if(!bookmark)fail('could not capture a pre-migration Time Travel bookmark');
console.log(`Pre-migration Time Travel bookmark captured: ${bookmark}`);
await executeMigration();
if(!(await verify063()))fail('post-migration verification failed');
const fk=await query('PRAGMA foreign_key_check');if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);
console.log('Production D1 migration 063 verified successfully.');
console.log(`Rollback bookmark (Time Travel): ${bookmark}`);
