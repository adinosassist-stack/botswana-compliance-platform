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
const spec=Object.freeze({
  number:65,
  path:'cloudflare/migrations/065_v243_business_goal_observer.sql',
  blob:'7652d1367899300f24f2c65e0f761bffa5681761'
});

function fail(message){throw new Error(`Production D1 migration 065 refused: ${message}`)}
if(!token)fail('CLOUDFLARE_API_TOKEN is empty');
if(!/^[0-9a-fA-F]{32}$/.test(accountId))fail('CLOUDFLARE_ACCOUNT_ID is invalid');
if(!/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(databaseId))fail('D1_DATABASE_ID is invalid');
if(!wranglerJs||!wranglerConfig)fail('Wrangler migration transport is incomplete');

const headers={Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json'};
const safe=value=>String(value||'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').slice(0,500);

async function cf(path,options={}){
  const response=await fetch(`${API}${path}`,{...options,headers:{...headers,...(options.headers||{})}});
  const raw=await response.text();
  let body=null;try{body=raw?JSON.parse(raw):null}catch{}
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
async function objectSql(type,name){
  const rows=await query('SELECT sql FROM sqlite_master WHERE type=? AND name=? LIMIT 1',[type,name]);
  return String(rows?.[0]?.sql||'');
}

async function verifyPrerequisites(){
  const tables=await names('table');
  for(const name of ['agent_registry','agent_persistent_tasks','agent_observation_checkpoints','agent_observation_claims','agent_jit_execution_permits']){
    if(!tables.has(name))fail(`prerequisite schema through 064 is incomplete: missing ${name}`);
  }
  const requestColumns=await columns('agent_task_requests');
  if(!requestColumns.has('jit_permit_id'))fail('prerequisite migration 064 is incomplete: agent_task_requests.jit_permit_id missing');
}

async function verify065(){
  const rows=await query(`SELECT agent_id,canonical_name,actor_type,purpose,risk_tier,authority_state,execution_capable,owner_scope
    FROM agent_registry WHERE agent_id='SYS-BIZ-OBS-001' LIMIT 1`);
  const row=rows[0];
  if(!row)return false;
  const exact=
    String(row.agent_id)==='SYS-BIZ-OBS-001'&&
    String(row.canonical_name)==='business_goal_observer'&&
    String(row.actor_type)==='system_observer'&&
    String(row.purpose)==='Governed read-only business goal observation'&&
    String(row.risk_tier)==='low'&&
    String(row.authority_state)==='active'&&
    Number(row.execution_capable)===0&&
    String(row.owner_scope)==='platform';
  if(!exact)fail('canonical business-goal observer row does not match the reviewed non-execution identity');

  const triggers=await names('trigger');
  for(const name of ['trg_business_goal_no_duplicate_insert','trg_business_goal_no_duplicate_update']){
    if(!triggers.has(name))return false;
    const sql=await objectSql('trigger',name);
    for(const pattern of [/duplicate_business_goal/i,/templateKey/i,/active/i,/paused/i]){
      if(!pattern.test(sql))fail(`trigger ${name} shape mismatch for ${pattern}`);
    }
  }
  return true;
}

async function executeMigration(){
  const args=[wranglerJs,'d1','execute','DB','--remote',`--file=${spec.path}`,`--config=${wranglerConfig}`,'--yes'];
  try{
    const result=await execFile(process.execPath,args,{env:{...process.env,CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:accountId},maxBuffer:8*1024*1024});
    console.log(`Wrangler D1 migration 065 completed: ${safe(`${result?.stdout||''} ${result?.stderr||''}`)}`);
  }catch(error){
    throw new Error(`Migration 065 Wrangler D1 execution failed: ${safe(error?.stderr||error?.stdout||error?.message||error)}`);
  }
}

await verifyPrerequisites();
const sql=await readFile(spec.path,'utf8');
const actualBlob=createHash('sha1').update(`blob ${Buffer.byteLength(sql)}\0`).update(sql).digest('hex');
if(actualBlob!==spec.blob)fail(`reviewed migration blob changed expected=${spec.blob} actual=${actualBlob}`);

if(await verify065()){
  const fk=await query('PRAGMA foreign_key_check');
  if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);
  console.log('Production D1 migration 065 already present and verified; no mutation required.');
  process.exit(0);
}

const bookmarkBody=await cf(`/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`,{method:'GET'});
const bookmark=String(bookmarkBody?.result?.bookmark||'').trim();
if(!bookmark)fail('could not capture a pre-migration Time Travel bookmark');
console.log(`Pre-migration Time Travel bookmark captured: ${bookmark}`);

await executeMigration();
if(!(await verify065()))fail('post-migration verification failed');
const fk=await query('PRAGMA foreign_key_check');
if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);

console.log('Production D1 migration 065 verified successfully.');
console.log(`Rollback bookmark (Time Travel): ${bookmark}`);