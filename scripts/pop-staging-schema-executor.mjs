// Controlled POP schema initializer. Target is isolated staging only.
import {readFileSync} from 'node:fs';
import {planStagingSchemaApply} from './plan-pop-staging-schema-apply.mjs';
const e=process.env;
const STAGE='812f9021-890b-41e6-8fa1-6001f90a9b53';
if(e.GITHUB_EVENT_NAME!=='workflow_dispatch'||e.GITHUB_REF!=='refs/heads/main'||
 e.GITHUB_REPOSITORY!=='adinosassist-stack/botswana-compliance-platform'||
 !e.CLOUDFLARE_API_TOKEN||!e.CLOUDFLARE_ACCOUNT_ID)throw Error('staging_execution_disallowed');
const data=JSON.parse(readFileSync(e.RUNNER_TEMP+'/pop-schema-review-private.json','utf8'));
if(data.sha!==e.GITHUB_SHA||data.customer_records_included!==false)throw Error('invalid_schema');
const base='https://api.cloudflare.com/client/v4/accounts/'+e.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+STAGE+'/query';
async function run(sql){
 const res=await fetch(base,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
 headers:{authorization:'Bearer '+e.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},
 body:JSON.stringify({sql,params:[]})});
 const out=await res.json().catch(()=>null);
 if(!res.ok || out?.success!==true || !Array.isArray(out?.result) || out.result.some(x=>x.success!==true)){
  const codes=(out?.errors||[]).map(x=>Number(x.code)).filter(Number.isFinite);
  console.error(JSON.stringify({kind:'staging_d1_provider_failure',http_status:res.status,
   provider_codes:codes,operation_class:sql.trimStart().split(/\\s+/)[0].toUpperCase(),
   production_writes:0,sql_or_credentials_logged:false}));
  throw Error('staging_provider_failed');
 }
 return out.result.flatMap(x=>x.results||[]);
}
const objects=await run("SELECT type,name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'");
const plan=planStagingSchemaApply({sourceSha:data.sha,currentMainSha:e.GITHUB_SHA,
 existingObjects:objects,definitions:data.definitions,confirmation:e.STAGING_DDL_CONFIRM});
if(e.STAGING_EXECUTE!=='APPROVED_STAGING_SCHEMA_ONLY')throw Error('staging_execution_approval_missing');
let completed=0;
for(const kind of ['table','index','view','trigger']){
 for(const d of data.definitions.filter(x=>x.type===kind)){
  await run(d.sql); completed++;
 }
}
const after=await run("SELECT type,name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'");
const actual=new Set(after.filter(x=>x.name!=='_cf_KV').map(x=>x.type+':'+x.name));
const expected=new Set(data.definitions.map(x=>x.type+':'+x.name));
if(actual.size!==expected.size||[...expected].some(x=>!actual.has(x)))throw Error('staging_reconstruction_parity_failed');
console.log(JSON.stringify({kind:'pop_staging_schema_initialized',target:plan.target,completed,
 source_sha:e.GITHUB_SHA,customer_rows_copied:0,production_database_writes:0}));
