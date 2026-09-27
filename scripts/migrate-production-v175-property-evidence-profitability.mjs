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
  number:60,
  path:'cloudflare/migrations/060_v175_property_evidence_profitability.sql',
  blob:'bb96c52478b4e3a22868bdeb584e0d9dff8bf092'
});

function fail(message){throw new Error(`Production D1 migration 060 refused: ${message}`)}
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
  const present=await columns(table),missing=required.filter(x=>!present.has(x));
  if(missing.length)fail(`${table} missing column(s): ${missing.join(',')}`);
}
async function requireTrigger(name,patterns){
  const sql=await objectSql('trigger',name);
  if(!sql)fail(`missing trigger ${name}`);
  for(const pattern of patterns)if(!pattern.test(sql))fail(`trigger ${name} shape mismatch for ${pattern}`);
}
async function verifyPrerequisites(){
  const tables=await names('table');
  for(const name of ['tenants','users','evidence','property_assets','property_professional_valuations']){
    if(!tables.has(name))fail(`prerequisite schema through 059 is incomplete: missing ${name}`);
  }
}
async function verify060(){
  const tables=await names('table');
  for(const name of ['property_valuation_evidence_links','property_operating_snapshots'])if(!tables.has(name))return false;
  const indexes=await names('index');
  for(const name of ['property_valuation_evidence_property_idx','property_operating_snapshots_property_idx'])if(!indexes.has(name))return false;
  const triggers=await names('trigger');
  for(const name of [
    'property_valuation_evidence_tenant_guard',
    'property_valuation_evidence_immutable_update',
    'property_valuation_evidence_immutable_delete',
    'property_professional_valuation_review_due_guard',
    'property_operating_snapshot_tenant_guard',
    'property_operating_snapshots_immutable_update',
    'property_operating_snapshots_immutable_delete'
  ])if(!triggers.has(name))return false;

  await requireColumns('property_assets',[
    'archived_at','archived_by_user_id','archive_reason'
  ]);
  await requireColumns('property_professional_valuations',[
    'review_due_date','review_due_source'
  ]);
  await requireColumns('property_valuation_evidence_links',[
    'tenant_id','property_id','valuation_id','evidence_id','link_kind','linked_by_user_id','linked_at'
  ]);
  await requireColumns('property_operating_snapshots',[
    'id','tenant_id','property_id','snapshot_date','currency','annual_rent_minor',
    'annual_operating_cost_minor','debt_balance_minor','source_kind','created_by_user_id','created_at'
  ]);

  const valuationSql=await objectSql('table','property_professional_valuations');
  if(!/review_due_source\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'thebe_policy_365d'/i.test(valuationSql))fail('valuation review-due provenance constraint missing');
  const evidenceLinkSql=await objectSql('table','property_valuation_evidence_links');
  if(!/link_kind\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'signed_report'/i.test(evidenceLinkSql))fail('signed-report evidence provenance constraint missing');
  const snapshotSql=await objectSql('table','property_operating_snapshots');
  if(!/source_kind\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'property_register_update'/i.test(snapshotSql))fail('property operating snapshot provenance constraint missing');

  await requireTrigger('property_valuation_evidence_tenant_guard',[
    /property_valuation_evidence_not_ready/i,/review_status='approved'/i,/scan_status='clean'/i,/scanned_at IS NOT NULL/i,/malware_name IS NULL/i
  ]);
  await requireTrigger('property_valuation_evidence_immutable_update',[/property_valuation_evidence_immutable/i]);
  await requireTrigger('property_valuation_evidence_immutable_delete',[/property_valuation_evidence_immutable/i,/WHEN\s+EXISTS\s*\(\s*SELECT 1 FROM tenants/i]);
  await requireTrigger('property_professional_valuation_review_due_guard',[/property_valuation_review_due_invalid/i,/review_due_date<NEW\.valuation_date/i]);
  await requireTrigger('property_operating_snapshot_tenant_guard',[/property_operating_snapshot_asset_mismatch/i,/property_assets/i]);
  await requireTrigger('property_operating_snapshots_immutable_update',[/property_operating_snapshot_immutable/i]);
  await requireTrigger('property_operating_snapshots_immutable_delete',[/property_operating_snapshot_immutable/i,/WHEN\s+EXISTS\s*\(\s*SELECT 1 FROM tenants/i]);
  return true;
}
async function executeMigration(){
  const args=[wranglerJs,'d1','execute','DB','--remote',`--file=${spec.path}`,`--config=${wranglerConfig}`,'--yes'];
  try{
    const result=await execFile(process.execPath,args,{
      env:{...process.env,CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:accountId},
      maxBuffer:8*1024*1024
    });
    console.log(`Wrangler D1 migration 060 completed: ${safe(`${result?.stdout||''} ${result?.stderr||''}`)}`);
  }catch(error){
    throw new Error(`Migration 060 Wrangler D1 execution failed: ${safe(error?.stderr||error?.stdout||error?.message||error)}`);
  }
}

await verifyPrerequisites();
const sql=await readFile(spec.path,'utf8');
const blob=createHash('sha1').update(`blob ${Buffer.byteLength(sql)}\0`).update(sql).digest('hex');
if(blob!==spec.blob)fail(`reviewed migration blob changed expected=${spec.blob} actual=${blob}`);

if(await verify060()){
  const fk=await query('PRAGMA foreign_key_check');
  if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);
  console.log('Production D1 migration 060 already present and verified; no mutation required.');
  process.exit(0);
}

const bookmarkBody=await cf(`/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`,{method:'GET'});
const bookmark=String(bookmarkBody?.result?.bookmark||'').trim();
if(!bookmark)fail('could not capture a pre-migration Time Travel bookmark');
console.log(`Pre-migration Time Travel bookmark captured: ${bookmark}`);

await executeMigration();
if(!(await verify060()))fail('post-migration verification failed');
const fk=await query('PRAGMA foreign_key_check');
if(fk.length)fail(`foreign key verification failed with ${fk.length} violation(s)`);
console.log('Production D1 migration 060 verified successfully.');
console.log(`Rollback bookmark (Time Travel): ${bookmark}`);
