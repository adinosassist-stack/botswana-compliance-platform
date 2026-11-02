// Read-only full-schema digest comparison. No DDL or customer rows returned or logged.
import {createHash} from 'node:crypto';
const e=process.env;
const PROD='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
const STAGING='812f9021-890b-41e6-8fa1-6001f90a9b53';
if(e.GITHUB_EVENT_NAME!=='workflow_dispatch'||e.GITHUB_REF!=='refs/heads/main'||
 e.GITHUB_REPOSITORY!=='adinosassist-stack/botswana-compliance-platform'||
 !/^[a-f0-9]{40}$/.test(e.GITHUB_SHA||'')||e.EXPECTED_MAIN_SHA!==e.GITHUB_SHA)
 throw Error('pop_digest_authority_invalid');
if(!/^[a-f0-9]{32}$/.test(e.CLOUDFLARE_ACCOUNT_ID||'')||!e.CLOUDFLARE_API_TOKEN)
 throw Error('pop_digest_credentials_missing');
const sql="SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name";
async function read(id){
 const url='https://api.cloudflare.com/client/v4/accounts/'+e.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+id+'/query';
 const res=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
 headers:{authorization:'Bearer '+e.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},
 body:JSON.stringify({sql,params:[]})});
 if(!res.ok)throw Error('pop_digest_provider_unavailable');
 const data=await res.json();
 if(data.success!==true||!Array.isArray(data.result)||data.result.some(x=>x.success!==true||!Array.isArray(x.results)))
 throw Error('pop_digest_provider_invalid');
 const rows=data.result.flatMap(x=>x.results);const objects=new Map();
 for(const r of rows){
  if(!r||!['table','index','trigger','view'].includes(r.type)||typeof r.name!=='string'||typeof r.tbl_name!=='string')throw Error('pop_digest_invalid_record');
  const key=r.type+':'+r.name;
  if(objects.has(key))throw Error('pop_digest_duplicate_record');
  const def=typeof r.sql==='string'?r.sql:null;
  objects.set(key,{owner:r.tbl_name,digest:def?createHash('sha256').update(def).digest('hex'):null});
 }
 return objects;
}
const [prod,stage]=await Promise.all([read(PROD),read(STAGING)]);
const missing=[...prod.keys()].filter(k=>!stage.has(k));
const extra=[...stage.keys()].filter(k=>!prod.has(k));
const changed=[...prod.keys()].filter(k=>stage.has(k)&&(prod.get(k).owner!==stage.get(k).owner||prod.get(k).digest!==stage.get(k).digest));
const absentDDL=[...prod].filter(([key,v])=>v.digest===null && !key.startsWith('index:')).length;
const report={kind:'pop_full_schema_readonly_digest',main_sha:e.GITHUB_SHA,
 production_uuid:PROD,staging_uuid:STAGING,production_objects:prod.size,staging_objects:stage.size,
 missing_count:missing.length,extra_count:extra.length,changed_ddl_count:changed.length,
 production_missing_nonindex_ddl:absentDDL,
 catalog_and_ddl_parity:missing.length===0&&extra.length===0&&changed.length===0&&absentDDL===0,
 ddl_text_logged:false,customer_rows_read:false,database_mutations_performed:false,
 restore_proven:false,production_migration_authorized:false};
console.log(JSON.stringify(report));
if(!report.catalog_and_ddl_parity)process.exitCode=2;
