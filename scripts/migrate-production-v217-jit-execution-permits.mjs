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
  number:64,
  path:'cloudflare/migrations/064_v217_jit_execution_permits.sql',
  blob:'6d107f1d224aae9b3a7f4c24aec3bcf4940fa2e0'
});

function fail(message){throw new Error(`Production D1 migration 064 refused: ${message}`)}
if(!token)fail('CLOUDFLARE_API_TOKEN is empty');
if(!/^[0-9a-fA-F]{32}$/.test(accountId))fail('CLOUDFLARE_ACCOUNT_ID is invalid');
if(!/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(databaseId))fail('D1_DATABASE_ID is invalid');
if(!wranglerJs||!wranglerConfig)fail('Wrangler migration transport is incomplete');

const headers={Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json'};
const safe=value=>String(value||'')
  .replace(/[\u0000-\u001f\u007f]+/g,' ')
  .replace(/\s+/g,' ')
  .slice(0,500);

async function cf(path,options={}){
  const response=await fetch(`${API}${path}`,{...options,headers:{...headers,...(options.headers||{})}});
  const raw=await response.text();
  let body=null;
  try{body=raw?JSON.parse(raw):null}catch{}
  if(!response.ok||body?.success===false){
    const errors=Array.isArray(body?.errors)
      ?body.errors.map(e=>`${e?.code??'unknown'}:${e?.message??'unknown'}`).join(' | ')
      :safe(raw);
    throw new Error(`Cloudflare API ${path} failed HTTP ${response.status}: ${errors}`);
  }
  return body;
}

async function query(sql,params=[]){
  const body=await cf(`/accounts/${accountId}/d1/database/${databaseId}/query`,{
    method:'POST',
    body:JSON.stringify({sql,params})
  });
  const results=Array.isArray(body?.result)?body.result:[];
  if(!results.length||results.some(r=>r?.success===false))fail(`D1 query failed: ${safe(sql)}`);
  return results.flatMap(r=>Array.isArray(r?.results)?r.results:[]);
}

async function names(type){
  return new Set((await query('SELECT name FROM sqlite_master WHERE type=?',[type])).map(r=>String(r.name||'')));
}
async function columns(table){
  return new Set((await query(`PRAGMA table_info(${table})`)).map(r=>String(r.name||'')));
}
async function objectSql(type,name){
  const rows=await query('SELECT sql FROM sqlite_master WHERE type=? AND name=? LIMIT 1',[type,name]);
  return String(rows?.[0]?.sql||'');
}
async function requireColumns(table,required){
  const present=await columns(table);
  const missing=required.filter(x=>!present.has(x));
  if(missing.length)fail(`${table} missing column(s): ${missing.join(',')}`);
}
async function requireObject(type,name,patterns=[]){
  const sql=await objectSql(type,name);
  if(!sql)fail(`missing ${type} ${name}`);
  for(const pattern of patterns){
    if(!pattern.test(sql))fail(`${type} ${name} shape mismatch for ${pattern}`);
  }
  return sql;
}

async function verifyPrerequisites(){
  const tables=await names('table');
  for(const name of [
    'tenants','users','agent_delegations','agent_action_intents','agent_execution_grants',
    'agent_task_requests','agent_internal_tasks','agent_execution_receipts','agent_registry',
    'professional_credential_events'
  ]){
    if(!tables.has(name))fail(`prerequisite schema through 063 is incomplete: missing ${name}`);
  }
  await requireColumns('agent_task_requests',[
    'id','tenant_id','action_intent_id','execution_grant_id','payload_hash',
    'status','approved_payload_hash','approved_by_user_id'
  ]);
}

async function verify064(){
  const tables=await names('table');
  if(!tables.has('agent_jit_execution_permits'))return false;

  const requestColumns=await columns('agent_task_requests');
  if(!requestColumns.has('jit_permit_id'))return false;

  await requireColumns('agent_jit_execution_permits',[
    'id','tenant_id','agent_id','human_user_id','task_request_id','execution_grant_id',
    'action_key','payload_hash','status','max_uses','use_count','expires_at',
    'consumed_at','consumed_by_user_id','created_at'
  ]);

  const indexes=await names('index');
  for(const name of ['agent_jit_execution_permits_lookup_idx','agent_task_requests_jit_permit_uq']){
    if(!indexes.has(name))return false;
  }

  const triggers=await names('trigger');
  for(const name of [
    'agent_jit_execution_permits_request_guard',
    'agent_jit_execution_permits_consume_guard',
    'agent_task_requests_jit_execute_guard',
    'agent_task_requests_jit_consume'
  ]){
    if(!triggers.has(name))return false;
  }

  await requireObject('trigger','agent_jit_execution_permits_request_guard',[
    /q\.status='approved'/i,
    /q\.approved_by_user_id=NEW\.human_user_id/i,
    /q\.approved_payload_hash=q\.payload_hash/i,
    /g\.status='active'/i,
    /agent_jit_permit_request_mismatch/i
  ]);
  await requireObject('trigger','agent_jit_execution_permits_consume_guard',[
    /OLD\.status<>'active'/i,
    /NEW\.status<>'consumed'/i,
    /NEW\.use_count<>1/i,
    /NEW\.consumed_by_user_id<>OLD\.human_user_id/i,
    /datetime\(OLD\.expires_at\)<=CURRENT_TIMESTAMP/i
  ]);
  await requireObject('trigger','agent_task_requests_jit_execute_guard',[
    /OLD\.status<>'approved'/i,
    /OLD\.approved_payload_hash<>OLD\.payload_hash/i,
    /p\.human_user_id=OLD\.approved_by_user_id/i,
    /p\.max_uses=1/i,
    /p\.use_count=0/i,
    /datetime\(p\.expires_at\)>CURRENT_TIMESTAMP/i,
    /agent_jit_permit_invalid_or_expired/i
  ]);
  await requireObject('trigger','agent_task_requests_jit_consume',[
    /SET status='consumed'/i,
    /use_count=1/i,
    /consumed_by_user_id=OLD\.approved_by_user_id/i,
    /changes\(\)<>1/i,
    /agent_jit_permit_consume_conflict/i
  ]);

  const tableSql=await objectSql('table','agent_jit_execution_permits');
  for(const pattern of [
    /CHECK\(agent_id='THEBE-001'\)/i,
    /CHECK\(action_key='task\.create'\)/i,
    /CHECK\(max_uses=1\)/i,
    /CHECK\(datetime\(expires_at\)<=datetime\(created_at,'\+5 minutes'\)\)/i
  ]){
    if(!pattern.test(tableSql))fail(`agent_jit_execution_permits table shape mismatch for ${pattern}`);
  }
  return true;
}

async function executeMigration(){
  const args=[
    wranglerJs,'d1','execute','DB','--remote',
    `--file=${spec.path}`,
    `--config=${wranglerConfig}`,
    '--yes'
  ];
  try{
    const result=await execFile(process.execPath,args,{
      env:{...process.env,CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:accountId},
      maxBuffer:8*1024*1024
    });
    console.log(`Wrangler D1 migration 064 completed: ${safe(`${result?.stdout||''} ${result?.stderr||''}`)}`);
  }catch(error){
    throw new Error(`Migration 064 Wrangler D1 execution failed: ${safe(error?.stderr||error?.stdout||error?.message||error)}`);
  }
}

await verifyPrerequisites();

const sql=await readFile(spec.path,'utf8');
const actualBlob=createHash('sha1')
  .update(`blob ${Buffer.byteLength(sql)}\0`)
  .update(sql)
  .digest('hex');
if(actualBlob!==spec.blob){
  fail(`reviewed migration blob changed expected=${spec.blob} actual=${actualBlob}`);
}

if(await verify064()){
  const fk=await query('PRAGMA foreign_key_check');
  if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);
  console.log('Production D1 migration 064 already present and verified; no mutation required.');
  process.exit(0);
}

const bookmarkBody=await cf(
  `/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`,
  {method:'GET'}
);
const bookmark=String(bookmarkBody?.result?.bookmark||'').trim();
if(!bookmark)fail('could not capture a pre-migration Time Travel bookmark');
console.log(`Pre-migration Time Travel bookmark captured: ${bookmark}`);

await executeMigration();

if(!(await verify064()))fail('post-migration verification failed');
const fk=await query('PRAGMA foreign_key_check');
if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);

console.log('Production D1 migration 064 verified successfully.');
console.log(`Rollback bookmark (Time Travel): ${bookmark}`);
