import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateActiveAssetCredentialTypes,inspectActiveAssetCredentialTypes} from '../scripts/corporate-assets-active-credential-types.mjs';
const id='5497120e-4ae6-4665-b96f-4b040d32a249';
const deployment=()=>[{id:'33e1d736-54f6-4a72-9087-cabed895dc99',created_on:'2026-11-05T19:23:03.212311Z',versions:[{version_id:id,percentage:100}]}];
const info=(items=deployment())=>({page:1,count:items.length,total_count:items.length,total_pages:1});
const evaluate=({deployments=deployment(),version:workerVersion=version(),resultInfo=info(deployments)}={})=>
 evaluateActiveAssetCredentialTypes({deployments,version:workerVersion,resultInfo});
const version=(type='secret_text')=>({id,resources:{bindings:[
 {name:'SESSION_SECRET',type},{name:'AUDIT_INTEGRITY_SECRET',type}
]}});
test('immutable deployed version with exactly two secret_text bindings is safe but never grants deployment',()=>{
 const result=evaluate({deployments:deployment(),version:version()});
 assert.equal(result.immutableCredentialTypesVerified,true);
 assert.equal(result.deploymentAuthorized,false);
 assert.equal(result.createVersionAuthorized,false);
});
test('active immutable plaintext or missing/duplicate secret binding is unsafe',()=>{
 for(const v of [
  version('plain_text'),{...version(),resources:{bindings:[{name:'SESSION_SECRET',type:'secret_text'}]}},
  {...version(),resources:{bindings:[...version().resources.bindings,{name:'SESSION_SECRET',type:'secret_text'}]}},
  {id:'other',resources:version().resources},
  {id,resources:{bindings:[]}}
 ]){
  const result=evaluate({deployments:deployment(),version:v});
  assert.equal(result.immutableCredentialTypesVerified,false);
  assert.equal(result.activeCredentialRisk,true);
 }
});
test('ambiguous traffic splits or missing deployment provenance fail closed',()=>{
 for(const deployments of [
  [],[{}],[{versions:[{version_id:id,percentage:50}]}],
  [{versions:[{version_id:id,percentage:50},{version_id:id,percentage:50}]}],
  [{versions:[{version_id:'not-uuid',percentage:100}]}]
 ]){
  const result=evaluate({deployments,version:version()});
  assert.equal(result.immutableCredentialTypesVerified,false);
 }
});
test('GET-only audit checks immutable version, never returns credential contents',async()=>{
 const urls=[],secret='DO_NOT_PRINT_TEST_SECRET';
 const request=async(url,opts)=>{
  urls.push({url,opts});
  const result=url.endsWith('/deployments')?{deployments:deployment()}:
   {...version(),resources:{bindings:version().resources.bindings.map(b=>({...b,text:secret}))}};
  return {ok:true,json:async()=>({success:true,result,...(url.endsWith('/deployments')?{result_info:info()}: {})})};
 };
 const result=await inspectActiveAssetCredentialTypes({token:'synthetic-token',request});
 assert.equal(result.immutableCredentialTypesVerified,true);
 assert.equal(urls.length,2);
 assert.ok(urls.every(u=>u.opts.method==='GET'));
 assert.ok(!JSON.stringify(result).includes(secret));
});
test('malformed token fails before any request, HTTP failures preserve sanitized code',async()=>{
 let calls=0;
 await assert.rejects(inspectActiveAssetCredentialTypes({token:'Bearer leaked',request:async()=>{
  calls++;throw Error('unexpected');
 }}),/credential_format_invalid/);
 assert.equal(calls,0);
 const request=async()=>({ok:false,status:400,json:async()=>({errors:[{code:10000,message:'SENSITIVE'}]})});
 await assert.rejects(inspectActiveAssetCredentialTypes({token:'synthetic',request}),
  /cloudflare_exposure_read_failed_active_deployments_400_cfcode_10000/);
});

test('rejects missing pagination proof, unsorted records, duplicate timestamps, and partial histories',()=>{
 const a=deployment();
 const older={id:'4eae3ad9-1d47-4c54-8af6-15ed63597765',created_on:'2026-11-05T18:22:07.506752Z',versions:[{version_id:id,percentage:100}]};
 for(const [items,resultInfo] of [
  [a,undefined],
  [a,{page:1,count:1}],
  [a,{page:1,count:1,total_count:2}],
  [a,{page:2,count:1,total_count:1}],
  [a,{page:1,count:1,total_pages:2,total_count:1}],
  [[older,a],info([older,a])],
  [[a,{...older,created_on:a[0].created_on}],info([a,older])],
  [[{...a[0],created_on:'not-a-date'}],info(a)],
  [[{...a[0],id:'malformed'}],info(a)]
 ]){
  const result=evaluateActiveAssetCredentialTypes({deployments:items,version:version(),resultInfo});
  assert.equal(result.immutableCredentialTypesVerified,false);
  assert.equal(result.activeCredentialRisk,true);
 }
});
test('accepts two complete reverse-chronological deployments with active secret text',()=>{
 const old={id:'4eae3ad9-1d47-4c54-8af6-15ed63597765',created_on:'2026-11-05T18:22:07.506752Z',versions:[{version_id:'94d2b523-b36c-4d3e-935f-1606f1e78f0f',percentage:100}]};
 const items=[...deployment(),old];
 const result=evaluateActiveAssetCredentialTypes({deployments:items,version:version(),resultInfo:info(items)});
 assert.equal(result.immutableCredentialTypesVerified,true);
});
