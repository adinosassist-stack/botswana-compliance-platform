// Protected schema-only extraction for offline review. Never writes to D1.
// Writes DDL to a local file on the runner, NOT CI logs or public artifacts.
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const e=process.env;
const PRODUCTION='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
const STAGING='812f9021-890b-41e6-8fa1-6001f90a9b53';
if(e.GITHUB_EVENT_NAME!=='workflow_dispatch'||e.GITHUB_REF!=='refs/heads/main'||
 e.GITHUB_REPOSITORY!=='adinosassist-stack/botswana-compliance-platform'||
 e.EXPECTED_MAIN_SHA!==e.GITHUB_SHA|| !/^[a-f0-9]{40}$/.test(e.GITHUB_SHA||''))
 throw Error('schema_extract_invalid_authority');
if(!/^[a-f0-9]{32}$/.test(e.CLOUDFLARE_ACCOUNT_ID||'')||!e.CLOUDFLARE_API_TOKEN)
 throw Error('schema_extract_missing_credentials');
const endpoint=id=>'https://api.cloudflare.com/client/v4/accounts/'+e.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+id+'/query';
async function query(id,sql){
 const r=await fetch(endpoint(id),{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
 headers:{authorization:'Bearer '+e.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},
 body:JSON.stringify({sql,params:[]})});
 if(!r.ok)throw Error('schema_extract_provider_error');
 const d=await r.json();
 if(!d.success||!Array.isArray(d.result)||d.result.some(v=>!v.success||!Array.isArray(v.results)))
 throw Error('schema_extract_response_invalid');
 return d.result.flatMap(x=>x.results);
}
const staging=await query(STAGING,"SELECT type,name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'");
if(staging.length!==1||staging[0].name!=='_cf_KV'||staging[0].type!=='table')
 throw Error('schema_extract_staging_not_empty');
const rows=await query(PRODUCTION,"SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name");
const names=new Set(),counts={table:0,index:0,trigger:0,view:0},definitions=[];
for(const r of rows){
 if(!['table','index','trigger','view'].includes(r.type)||typeof r.name!=='string'||
    typeof r.tbl_name!=='string'||names.has(r.type+':'+r.name))throw Error('schema_extract_bad_catalog');
 names.add(r.type+':'+r.name);counts[r.type]++;
 if(r.name==='_cf_KV')continue;
 if(typeof r.sql!=='string'||!r.sql.trim())throw Error('schema_extract_missing_ddl');
 definitions.push({type:r.type,name:r.name,owner:r.tbl_name,sql:r.sql});
}
if(rows.length<500||!definitions.some(x=>x.name==='tenants')||
 !definitions.some(x=>x.name==='payment_orders')||
 !definitions.some(x=>x.name==='manual_payment_submissions')||
 definitions.some(x=>['payment_pop_documents','payment_pop_upload_requests'].includes(x.name)))
 throw Error('schema_extract_unexpected_pre070');
const payload=JSON.stringify({kind:'review_only_application_ddl',sha:e.GITHUB_SHA,source:PRODUCTION,
 destination_review_only:STAGING,definitions,customer_records_included:false,executable:false});
const digest=createHash('sha256').update(payload).digest('hex');
const path=e.RUNNER_TEMP+'/pop-schema-review-private.json';
writeFileSync(path,payload,{mode:0o600,flag:'wx'});
console.log(JSON.stringify({kind:'pop_schema_review_metadata',main:e.GITHUB_SHA,
 source_objects:rows.length,application_definitions:definitions.length,counts,sha256:digest,
 private_runner_file_written:true,artifact_uploaded:false,staging_written:false,production_written:false}));
