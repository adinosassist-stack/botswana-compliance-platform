// Guarded, read-only stage authority preflight before any schema write.
import {validateStagingTarget} from './pop-staging-target-guard.mjs';
const e=process.env;
if(e.GITHUB_EVENT_NAME!=='workflow_dispatch'||e.GITHUB_REF!=='refs/heads/main'||
 e.GITHUB_REPOSITORY!=='adinosassist-stack/botswana-compliance-platform'||
 !e.CLOUDFLARE_API_TOKEN||e.CLOUDFLARE_ACCOUNT_ID!=='ddd23cab31928a4bb3d4998df9b26d1d')
 throw Error('pop_preflight_unauthorized');
const target='812f9021-890b-41e6-8fa1-6001f90a9b53';
const url='https://api.cloudflare.com/client/v4/accounts/'+e.CLOUDFLARE_ACCOUNT_ID+
 '/d1/database/'+target+'/query';
const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
 headers:{authorization:'Bearer '+e.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},
 body:JSON.stringify({sql:"SELECT type,name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",params:[]})});
if(!response.ok)throw Error('pop_preflight_provider_error');
const data=await response.json();
if(!data.success||!Array.isArray(data.result)||data.result.some(x=>!x.success||!Array.isArray(x.results)))
 throw Error('pop_preflight_invalid_response');
const existingObjects=data.result.flatMap(x=>x.results);
const result=validateStagingTarget({target,sourceSha:e.EXPECTED_MAIN_SHA,
 currentMainSha:e.GITHUB_SHA,confirmation:e.STAGING_DDL_CONFIRM,existingObjects});
console.log(JSON.stringify({kind:'pop_staging_target_preflight',main:e.GITHUB_SHA,
 target:result.target,source_guard_passed:true,empty_guard_passed:true,
 production_write_allowed:false,database_mutations_performed:false}));
