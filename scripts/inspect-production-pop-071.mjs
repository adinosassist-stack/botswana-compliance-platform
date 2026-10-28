import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const env=process.env;
const fail=(reason)=>{throw Error('pop071_'+reason)};
if(env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_REPOSITORY!=='adinosassist-stack/botswana-compliance-platform'||env.GITHUB_REF!=='refs/heads/main'||env.EXPECTED_MAIN_SHA!==env.GITHUB_SHA||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA))fail('context_invalid');
const sql=readFileSync('cloudflare/migrations/071_payment_pop_runtime_compat.sql','utf8');
const digest=createHash('sha256').update(sql).digest('hex');
if(!/^[a-f0-9]{64}$/.test(env.EXPECTED_SOURCE_SHA256||'')||digest!==env.EXPECTED_SOURCE_SHA256)fail('source_mismatch');
const account=env.CLOUDFLARE_ACCOUNT_ID,database=env.D1_DATABASE_ID,token=env.CLOUDFLARE_API_TOKEN;
if(!/^[a-f0-9]{32}$/i.test(account||'')||!/^[a-f0-9-]{36}$/i.test(database||'')||!token)fail('target_missing');
const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+database;
async function call(suffix,payload){
 const r=await fetch(base+suffix,{method:payload?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+token,accept:'application/json',...(payload?{'content-type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
 if(!r.ok)fail('cloudflare_unavailable');
 const b=await r.json();if(b.success!==true)fail('cloudflare_unavailable');return b.result;
}
const info=await call('');
if(info?.uuid?.toLowerCase()!==database.toLowerCase()||info?.name!=='bw-compliance-os')fail('target_mismatch');
async function select(query){
 if(![
  "SELECT name,type FROM sqlite_master WHERE name IN ('payment_pop_documents','payment_pop_upload_requests','payment_pop_upload_requests_tenant_idx') ORDER BY name",
  'PRAGMA table_info(payment_pop_documents)',
  'PRAGMA table_info(payment_pop_upload_requests)',
  'PRAGMA foreign_key_list(payment_pop_upload_requests)'
 ].includes(query))fail('query_forbidden');
 const result=await call('/query',{sql:query,params:[]});
 if(!Array.isArray(result)||result.some(x=>x.success!==true||!Array.isArray(x.results)))fail('query_failed');
 return result.flatMap(x=>x.results);
}
const objects=await select("SELECT name,type FROM sqlite_master WHERE name IN ('payment_pop_documents','payment_pop_upload_requests','payment_pop_upload_requests_tenant_idx') ORDER BY name");
const docs=await select('PRAGMA table_info(payment_pop_documents)');
const ledger=await select('PRAGMA table_info(payment_pop_upload_requests)');
const fks=await select('PRAGMA foreign_key_list(payment_pop_upload_requests)');
const documentColumns=new Set(docs.map(x=>x.name)),ledgerColumns=new Set(ledger.map(x=>x.name));
const requiredDocs=['content_sha256','object_etag','scan_request_id','scan_requested_at','scan_request_expires_at','scan_result_hash','scan_result_body','scan_result_signature','scanner_provider','scanned_at','last_owner_read_at','storage_deleted_at'];
const requiredLedger=['document_id','tenant_id','payment_order_id','key_hash','request_hash','bytes','state','created_at'];
const table=objects.some(x=>x.name==='payment_pop_upload_requests'&&x.type==='table');
const index=objects.some(x=>x.name==='payment_pop_upload_requests_tenant_idx'&&x.type==='index');
const ready=requiredDocs.every(x=>documentColumns.has(x))&&requiredLedger.every(x=>ledgerColumns.has(x))&&table&&index&&fks.length>=2;
const report={kind:'pop071_readonly_inspection',head:env.GITHUB_SHA,source_sha256:digest,documents_table_present:docs.length>0,documents_columns_present:requiredDocs.filter(x=>documentColumns.has(x)),documents_columns_missing:requiredDocs.filter(x=>!documentColumns.has(x)),reservation_table_present:table,reservation_index_present:index,reservation_columns_missing:requiredLedger.filter(x=>!ledgerColumns.has(x)),reservation_foreign_key_count:fks.length,schema_ready:ready,mutation_performed:false};
console.log(JSON.stringify(report));
if(env.GITHUB_STEP_SUMMARY){const {appendFileSync}=await import('node:fs');appendFileSync(env.GITHUB_STEP_SUMMARY,'\nPOP 071 remote schema inspection (read-only): '+(ready?'schema present':'schema incomplete / review required')+'\n');}
if(!ready)process.exitCode=2;
