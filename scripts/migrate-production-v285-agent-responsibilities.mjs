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
  number:66,
  path:'cloudflare/migrations/066_v285_agent_responsibilities.sql',
  blob:'a20319aa8c18b5ff2683e84a97ef1ca4503101f5'
});

function fail(message){throw new Error(`Production D1 migration 066 refused: ${message}`)}
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

async function verify066(){
  const tables=await names('table');
  for(const name of ['agent_responsibilities','agent_responsibility_events'])if(!tables.has(name))return false;
  const responsibilityColumns=await columns('agent_responsibilities');
  for(const name of ['tenant_id','agent_id','title','objective','workspace','status','autonomy_ceiling','schedule_kind','tool_scope_json','data_scope_json','budget_minor','owner_user_id','activated_at'])if(!responsibilityColumns.has(name))fail(`agent_responsibilities missing reviewed column ${name}`);
  const eventColumns=await columns('agent_responsibility_events');
  for(const name of ['tenant_id','responsibility_id','event_type','actor_type','evidence_hash','created_at'])if(!eventColumns.has(name))fail(`agent_responsibility_events missing reviewed column ${name}`);
  const triggers=await names('trigger');
  for(const name of ['trg_agent_responsibility_no_authority_escalation','trg_agent_responsibility_terminal_state','trg_agent_responsibility_activation_guard']){
    if(!triggers.has(name))return false;
  }
  return true;
}
async function executeMigration(){
  const args=[wranglerJs,'d1','execute','DB','--remote',`--file=${spec.path}`,`--config=${wranglerConfig}`,'--yes'];
  try{
    const result=await execFile(process.execPath,args,{env:{...process.env,CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:accountId},maxBuffer:8*1024*1024});
    console.log(`Wrangler D1 migration 066 completed: ${safe(`${result?.stdout||''} ${result?.stderr||''}`)}`);
  }catch(error){
    throw new Error(`Migration 066 Wrangler D1 execution failed: ${safe(error?.stderr||error?.stdout||error?.message||error)}`);
  }
}

await verifyPrerequisites();
const sql=await readFile(spec.path,'utf8');
const actualBlob=createHash('sha1').update(`blob ${Buffer.byteLength(sql)}\0`).update(sql).digest('hex');
if(actualBlob!==spec.blob)fail(`reviewed migration blob changed expected=${spec.blob} actual=${actualBlob}`);

if(await verify066()){
  const fk=await query('PRAGMA foreign_key_check');
  if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);
  console.log('Production D1 migration 066 already present and verified; no mutation required.');
  process.exit(0);
}

const bookmarkBody=await cf(`/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`,{method:'GET'});
const bookmark=String(bookmarkBody?.result?.bookmark||'').trim();
if(!bookmark)fail('could not capture a pre-migration Time Travel bookmark');
console.log(`Pre-migration Time Travel bookmark captured: ${bookmark}`);

await executeMigration();
if(!(await verify066()))fail('post-migration verification failed');
const fk=await query('PRAGMA foreign_key_check');
if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);

console.log('Production D1 migration 066 verified successfully.');
console.log(`Rollback bookmark (Time Travel): ${bookmark}`);