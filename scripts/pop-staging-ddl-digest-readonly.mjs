import {assessPopStagingDdl} from './pop-staging-schema-policy.mjs';
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
const asRows=items=>[...items.entries()].map(([key,value])=>({
 type:key.slice(0,key.indexOf(':')),name:key.slice(key.indexOf(':')+1),
 tbl_name:value.owner,digest:value.digest
}));
const report={...assessPopStagingDdl(asRows(prod),asRows(stage)),main_sha:e.GITHUB_SHA,
 production_uuid:PROD,staging_uuid:STAGING,
 ddl_text_logged:false,customer_rows_read:false,database_mutations_performed:false,
 restore_proven:false,production_migration_authorized:false};
console.log(JSON.stringify(report));
if(!report.schema_definitions_match_reviewed_pop_additions)process.exitCode=2;
