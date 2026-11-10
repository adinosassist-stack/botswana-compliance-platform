import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateActiveAssetCredentialTypes,inspectActiveAssetCredentialTypes} from '../scripts/corporate-assets-active-credential-types.mjs';
const id='5497120e-4ae6-4665-b96f-4b040d32a249';
const deployment=()=>[{id:'a',versions:[{version_id:id,percentage:100}]}];
const version=(type='secret_text')=>({id,resources:{bindings:[
 {name:'SESSION_SECRET',type},{name:'AUDIT_INTEGRITY_SECRET',type}
]}});
test('immutable deployed version with exactly two secret_text bindings is safe but never grants deployment',()=>{
 const result=evaluateActiveAssetCredentialTypes({deployments:deployment(),version:version()});
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
  const result=evaluateActiveAssetCredentialTypes({deployments:deployment(),version:v});
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
  const result=evaluateActiveAssetCredentialTypes({deployments,version:version()});
  assert.equal(result.immutableCredentialTypesVerified,false);
 }
});
test('GET-only audit checks immutable version, never returns credential contents',async()=>{
 const urls=[],secret='DO_NOT_PRINT_TEST_SECRET';
 const request=async(url,opts)=>{
  urls.push({url,opts});
  const result=url.endsWith('/deployments')?{deployments:deployment()}:
   {...version(),resources:{bindings:version().resources.bindings.map(b=>({...b,text:secret}))}};
  return {ok:true,json:async()=>({success:true,result})};
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
