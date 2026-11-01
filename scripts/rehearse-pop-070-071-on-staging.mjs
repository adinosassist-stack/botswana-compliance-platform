// Isolated staging POP 070/071 rehearsal; no production endpoint or arbitrary SQL.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const env=process.env;
const target='812f9021-890b-41e6-8fa1-6001f90a9b53';
if(env.GITHUB_REPOSITORY!=='adinosassist-stack/botswana-compliance-platform'||
 env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
 env.EXPECTED_MAIN_SHA!==env.GITHUB_SHA||!env.GITHUB_SHA||
 env.POP_STAGING_CONFIRM!=='REHEARSE_POP_070_071_STAGING_ONLY'||
 !env.CLOUDFLARE_ACCOUNT_ID||!env.CLOUDFLARE_API_TOKEN)
 throw Error('pop_staging_authorization_missing');
const files=['070_payment_pop_documents.sql','071_payment_pop_runtime_compat.sql'];
const sql=files.map(f=>readFileSync('cloudflare/migrations/'+f,'utf8'));
const digests=sql.map(s=>createHash('sha256').update(s).digest('hex'));
if(digests.some((x,i)=>x!==env['POP_SQL_SHA256_'+(i===0?'070':'071')]))throw Error('migration_hash_mismatch');
const endpoint='https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+target+'/query';
async function query(statement){
 const response=await fetch(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
 headers:{authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},
 body:JSON.stringify({sql:statement,params:[]})});
 const payload=await response.json().catch(()=>null);
 if(!response.ok||payload?.success!==true||!Array.isArray(payload?.result)||payload.result.some(x=>x.success!==true)){
  console.error(JSON.stringify({stage:'staging_pop_sql_failed',http:response.status,
   codes:(payload?.errors||[]).map(e=>Number(e.code)).filter(Number.isFinite)}));
  throw Error('staging_pop_apply_failed');
 }
 return payload.result.flatMap(x=>x.results||[]);
}
const initial=await query("SELECT type,name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'");
const names=new Set(initial.map(x=>x.name));
for(const key of ['tenants','payment_orders','manual_payment_submissions'])
 if(!names.has(key))throw Error('missing_staging_dependency');
for(const key of ['payment_pop_documents','payment_pop_upload_requests'])
 if(names.has(key))throw Error('pop_staging_already_modified');
const tables=initial.filter(x=>x.type==='table').map(x=>x.name).filter(x=>x!=='_cf_KV');
if(tables.length!==231)throw Error('unexpected_staging_table_count');
for(const name of tables){
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))throw Error('unsafe_table_name');
 const r=await query('SELECT COUNT(*) AS n FROM "'+name+'"');
 if(r.length!==1||Number(r[0].n)!==0)throw Error('staging_contains_customer_rows');
}
console.log(JSON.stringify({kind:'staging_pop_preflight',tables_checked:tables.length,empty:true,
 target,hashes:digests,production_writes:0}));
if(env.POP_STAGING_EXECUTE!=='APPROVED_STAGING_REHEARSAL_ONLY'){
 console.log(JSON.stringify({kind:'dry_run_only',writes:0}));process.exit(0);
}
// Each SQL statement is from immutable reviewed migration files only.
for(let i=0;i<sql.length;i++){
 const statements=sql[i].split(';').map(s=>s.trim()).filter(s=>s&&s.split('\n').some(l=>!l.trimStart().startsWith('--')&&l.trim()));
 for(const statement of statements)await query(statement);
 console.log(JSON.stringify({kind:'staging_pop_phase_complete',phase:i===0?'070':'071',production_writes:0}));
}
const after=await query("SELECT type,name FROM sqlite_master WHERE name LIKE 'payment_pop_%'");
for(const required of ['payment_pop_documents','payment_pop_upload_requests'])
 if(!after.some(x=>x.type==='table'&&x.name===required))throw Error('staging_pop_missing_table');
const cols=await query('PRAGMA table_info(payment_pop_documents)');
for(const col of ['content_sha256','scan_result_signature','storage_deleted_at'])
 if(!cols.some(x=>x.name===col))throw Error('staging_pop_missing_column');
console.log(JSON.stringify({kind:'staging_pop_070_071_qualified',target,production_writes:0,
 customer_data_copied:0,features_activated:false}));
