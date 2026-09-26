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
  number:58,
  path:'cloudflare/migrations/058_v161_finance_suppliers_payables.sql',
  blob:'376964783185388092116c9a1134c4120e13aec1'
});

function fail(message){throw new Error(`Production D1 migration 058 refused: ${message}`)}
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
async function objectSql(type,name){
  const rows=await query('SELECT sql FROM sqlite_master WHERE type=? AND name=? LIMIT 1',[type,name]);
  return String(rows?.[0]?.sql||'');
}
async function requireColumns(table,required){
  const present=await columns(table);
  const missing=required.filter(x=>!present.has(x));
  if(missing.length)fail(`${table} missing column(s): ${missing.join(',')}`);
}
async function requireTrigger(name,patterns){
  const sql=await objectSql('trigger',name);
  if(!sql)fail(`missing trigger ${name}`);
  for(const pattern of patterns)if(!pattern.test(sql))fail(`trigger ${name} shape mismatch for ${pattern}`);
}

async function verifyPrerequisites(){
  const tables=await names('table');
  for(const name of ['tenants','users','finance_transactions','business_memory_items','business_memory_events']){
    if(!tables.has(name))fail(`prerequisite schema through 057 is incomplete: missing ${name}`);
  }
}

async function verify058(){
  const tables=await names('table');
  for(const name of ['finance_suppliers','finance_supplier_aliases','finance_payables','finance_payable_allocations']){
    if(!tables.has(name))return false;
  }
  const indexes=await names('index');
  for(const name of [
    'finance_suppliers_tenant_idx',
    'finance_supplier_aliases_supplier_idx',
    'finance_payables_tenant_due_idx',
    'finance_payables_supplier_idx',
    'finance_payable_allocations_payable_idx',
    'finance_payable_allocations_transaction_idx'
  ])if(!indexes.has(name))return false;
  const triggers=await names('trigger');
  for(const name of [
    'finance_supplier_name_alias_collision_guard',
    'finance_supplier_alias_canonical_collision_guard',
    'finance_supplier_alias_tenant_guard',
    'finance_payables_supplier_tenant_guard',
    'finance_payable_allocations_apply_guard',
    'finance_payable_allocations_reverse_guard',
    'finance_payable_allocations_immutable_update',
    'finance_payable_allocations_immutable_delete'
  ])if(!triggers.has(name))return false;

  await requireColumns('finance_suppliers',['id','tenant_id','supplier_code','name','normalized_name','default_expense_category','status','created_by_user_id','created_at','updated_at']);
  await requireColumns('finance_supplier_aliases',['id','tenant_id','supplier_id','alias_text','normalized_alias','source_kind','created_by_user_id','created_at']);
  await requireColumns('finance_payables',['id','tenant_id','supplier_id','payable_number','issued_on','due_on','description','total_minor','currency','status','expense_category','created_by_user_id','created_at']);
  await requireColumns('finance_payable_allocations',['id','tenant_id','payable_id','transaction_id','amount_minor','entry_type','reverses_allocation_id','created_by_user_id','created_at']);

  const suppliersSql=await objectSql('table','finance_suppliers');
  const payablesSql=await objectSql('table','finance_payables');
  const allocationsSql=await objectSql('table','finance_payable_allocations');
  if(!/UNIQUE\s*\(\s*tenant_id\s*,\s*normalized_name\s*\)/i.test(suppliersSql))fail('supplier normalized-name tenant uniqueness missing');
  if(!/UNIQUE\s*\(\s*tenant_id\s*,\s*supplier_id\s*,\s*payable_number\s*\)/i.test(payablesSql))fail('payable number supplier scope missing');
  if(!/CHECK\s*\(\s*currency\s*=\s*'BWP'\s*\)/i.test(payablesSql))fail('BWP payable currency constraint missing');
  if(!/CHECK\s*\(\s*amount_minor\s*>\s*0\s*\)/i.test(allocationsSql))fail('positive allocation constraint missing');

  await requireTrigger('finance_supplier_name_alias_collision_guard',[/finance_supplier_name_alias_collision/i,/finance_supplier_aliases/i]);
  await requireTrigger('finance_supplier_alias_canonical_collision_guard',[/finance_supplier_alias_canonical_collision/i,/finance_suppliers/i]);
  await requireTrigger('finance_supplier_alias_tenant_guard',[/finance_supplier_tenant_mismatch/i,/status\s*=\s*'active'/i]);
  await requireTrigger('finance_payables_supplier_tenant_guard',[/finance_supplier_tenant_mismatch/i,/status\s*=\s*'active'/i]);
  await requireTrigger('finance_payable_allocations_apply_guard',[/finance_payable_overallocation/i,/finance_transaction_overallocation/i,/amount_minor\s*<\s*0/i]);
  await requireTrigger('finance_payable_allocations_reverse_guard',[/finance_payable_allocation_reversal_mismatch/i,/entry_type\s*=\s*'apply'/i]);
  await requireTrigger('finance_payable_allocations_immutable_update',[/finance_payable_allocation_immutable/i]);
  await requireTrigger('finance_payable_allocations_immutable_delete',[/finance_payable_allocation_immutable/i]);
  return true;
}

async function executeMigration(){
  const args=[wranglerJs,'d1','execute','DB','--remote',`--file=${spec.path}`,`--config=${wranglerConfig}`,'--yes'];
  try{
    const result=await execFile(process.execPath,args,{
      env:{...process.env,CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:accountId},
      maxBuffer:8*1024*1024
    });
    console.log(`Wrangler D1 migration 058 completed: ${safe(`${result?.stdout||''} ${result?.stderr||''}`)}`);
  }catch(error){
    throw new Error(`Migration 058 Wrangler D1 execution failed: ${safe(error?.stderr||error?.stdout||error?.message||error)}`);
  }
}

await verifyPrerequisites();
const sql=await readFile(spec.path,'utf8');
const blob=createHash('sha1').update(`blob ${Buffer.byteLength(sql)}\0`).update(sql).digest('hex');
if(blob!==spec.blob)fail(`reviewed migration blob changed expected=${spec.blob} actual=${blob}`);

if(await verify058()){
  const fk=await query('PRAGMA foreign_key_check');
  if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);
  console.log('Production D1 migration 058 already present and verified; no mutation required.');
  process.exit(0);
}

const bookmarkBody=await cf(`/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`,{method:'GET'});
const bookmark=String(bookmarkBody?.result?.bookmark||'').trim();
if(!bookmark)fail('could not capture a pre-migration Time Travel bookmark');
console.log(`Pre-migration Time Travel bookmark captured: ${bookmark}`);

await executeMigration();
if(!(await verify058()))fail('post-migration verification failed');
const fk=await query('PRAGMA foreign_key_check');
if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);
console.log('Production D1 migration 058 verified successfully.');
console.log(`Rollback bookmark (Time Travel): ${bookmark}`);
