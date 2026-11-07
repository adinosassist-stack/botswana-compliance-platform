import test from 'node:test';
import assert from 'node:assert/strict';
import {auditProtectedUserTokenPolicy,safeErrorCode} from '../scripts/audit-protected-user-token-policy.mjs';
const sha='a'.repeat(40),id='b'.repeat(32),account='ddd23cab31928a4bb3d4998df9b26d1d';
const env=()=>({GITHUB_REPOSITORY:'adinosassist-stack/botswana-compliance-platform',
 GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
 PROTECTED_ENVIRONMENT_NAME:'production',CONFIRMATION:'AUDIT_USER_TOKEN_POLICY_READONLY',
 EXPECTED_SHA:sha,GITHUB_SHA:sha,CLOUDFLARE_ACCOUNT_ID:account,
 CLOUDFLARE_API_TOKEN:'fake-cf',GH_TOKEN:'fake-gh'});
const response=x=>({ok:true,status:200,json:async()=>x});
function transport({policies=[{effect:'allow',resources:{['com.cloudflare.api.account.'+account]:'*'},permission_groups:[{name:'D1 Write'}]}],detailDenied=false}={}){
 const calls=[];
 const fetchImpl=async(url,opts)=>{
  calls.push(url);assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');
  if(url.startsWith('https://api.github.com/'))return response({object:{sha}});
  assert.equal(opts.headers.Authorization,'Bearer fake-cf');
  if(url.endsWith('/verify'))return response({success:true,result:{id,status:'active'}});
  assert.equal(url,'https://api.cloudflare.com/client/v4/user/tokens/'+id);
  return detailDenied?{ok:false,status:403}:response({success:true,result:{id,policies}});
 };
 return {fetchImpl,calls};
}
test('detects account-wide write evidence but never authorizes rotation or restore',async()=>{
 const t=transport(),o=await auditProtectedUserTokenPolicy(env(),t);
 assert.equal(t.calls.length,4);
 assert.equal(o.accountWideAllowObserved,true);
 assert.equal(o.accountWideWriteNameObserved,true);
 for(const k of ['permissionsIndependentlyQualified','exclusiveRestoreWritersProven','retentionAccepted','restoreAuthorized','productionWriteAuthorized','credentialRotationAuthorized','credentialValueDisclosed','tokenIdDisclosed'])assert.equal(o[k],false,k);
 assert.doesNotMatch(JSON.stringify(o),/fake-|bbbbbbbb/);
});
test('unavailable self-detail endpoint safely blocks; never falls back to inventory',async()=>{
 const t=transport({detailDenied:true});
 await assert.rejects(auditProtectedUserTokenPolicy(env(),t),/hold_cloudflare_metadata_refused/);
 assert.equal(t.calls.length,3);assert.equal(t.calls.some(x=>x.endsWith('/user/tokens')),false);
});
test('missing group names mean incomplete policy metadata, never least privilege',async()=>{
 const t=transport({policies:[{effect:'allow',resources:{['com.cloudflare.api.account.'+account]:'*'},permission_groups:[{id:'opaque'}]}]});
 const o=await auditProtectedUserTokenPolicy(env(),t);
 assert.equal(o.policyMetadataNamesComplete,false);
 assert.equal(o.permissionsIndependentlyQualified,false);
});
test('zone permission is not account-wide permission',async()=>{
 const t=transport({policies:[{effect:'allow',resources:{'com.cloudflare.api.account.zone.abc':'*'},permission_groups:[{name:'D1 Write'}]}]});
 const o=await auditProtectedUserTokenPolicy(env(),t);assert.equal(o.accountWideAllowObserved,false);
 assert.equal(o.accountWideWriteNameObserved,false);
});
test('wrong authority stops before fetching credential',async()=>{
 for(const patch of [{GITHUB_SHA:'c'.repeat(40)},{CONFIRMATION:'DO_NOT_RUN'},
  {PROTECTED_ENVIRONMENT_NAME:'operations-rehearsal'},{CLOUDFLARE_API_TOKEN:''}]){
  let called=false;
  await assert.rejects(auditProtectedUserTokenPolicy({...env(),...patch},{
   fetchImpl:async()=>{called=true;throw Error('should not call')}}),/hold_authority/);
  assert.equal(called,false);
 }
});
test('allowlisted error messages cannot reveal private strings',()=>{
 assert.equal(safeErrorCode(new Error('user_token_policy_hold_cloudflare_metadata_refused')),'cloudflare_metadata_refused');
 assert.equal(safeErrorCode(new Error('Bearer fake-cf')),'unclassified');
 assert.equal(safeErrorCode(new Error('user_token_policy_hold_cloudflare_metadata_refused token-secret')),'unclassified');
});
