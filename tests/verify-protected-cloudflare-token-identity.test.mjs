import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyProtectedTokenIdentity,sanitizedTokenHoldCode} from '../scripts/verify-protected-cloudflare-token-identity.mjs';
const id='b'.repeat(32),sha='a'.repeat(40);
const repo='adinosassist-stack/botswana-compliance-platform';
const valid=()=>({
 TOKEN_ROLE:'production-deploy',PROTECTED_ENVIRONMENT_NAME:'production',
 GITHUB_REPOSITORY:repo,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
 CONFIRMATION:'VERIFY_TOKEN_IDENTITY_READONLY',EXPECTED_SHA:sha,GITHUB_SHA:sha,
 CLOUDFLARE_ACCOUNT_ID:'ddd23cab31928a4bb3d4998df9b26d1d',
 EXPECTED_TOKEN_ID:id,CLOUDFLARE_API_TOKEN:'synthetic-cloudflare-secret',GH_TOKEN:'synthetic-github-secret'
});
const response=body=>({status:200,ok:true,json:async()=>body});
function stub(record){
 const urls=[];
 const fetchImpl=async(url,opts)=>{
  urls.push(url);
  assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');
  assert.ok(opts.signal);
  if(url.includes('api.github.com')){assert.equal(opts.headers.Authorization,'Bearer synthetic-github-secret');return response({object:{sha}})}
  assert.match(url,/^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/ddd23cab31928a4bb3d4998df9b26d1d\/tokens\/verify$/);
  assert.equal(opts.headers.Authorization,'Bearer synthetic-cloudflare-secret');
  return response(record??{success:true,result:{id,status:'active'}});
 };
 return {urls,fetchImpl};
}
test('protected production role authenticates exact active token identity but grants no write or rotation authority',async()=>{
 const a=stub();const output=await verifyProtectedTokenIdentity(valid(),a);
 assert.equal(a.urls.length,3);assert.equal(output.providerTokenIdMatched,true);
 for(const field of ['tokenNameProven','leastPrivilegeAccepted','tokenPermissionsIndependentlyQualified',
 'credentialRotationAuthorized','restoreAuthorized','retentionAndAccessAccepted','productionWriteAuthorized'])
 assert.equal(output[field],false,field);
 assert.doesNotMatch(JSON.stringify(output),/synthetic-|bbbbbbbb/);
});
test('recovery role uses separate protected environment',async()=>{
 const a=stub(),e={...valid(),TOKEN_ROLE:'isolated-recovery',PROTECTED_ENVIRONMENT_NAME:'operations-rehearsal'};
 const output=await verifyProtectedTokenIdentity(e,a);assert.equal(output.environment,'operations-rehearsal');
});
test('missing or stale authority stops before transport',async()=>{
 for(const patch of [{GITHUB_SHA:'c'.repeat(40)},{EXPECTED_SHA:'main'},{TOKEN_ROLE:'other'},
  {PROTECTED_ENVIRONMENT_NAME:'operations-rehearsal'},{GITHUB_EVENT_NAME:'pull_request'},
  {GITHUB_REF:'refs/heads/feature'},{CONFIRMATION:'DO_NOT_RUN'}, {CLOUDFLARE_API_TOKEN:''},
  {GH_TOKEN:''},{EXPECTED_TOKEN_ID:'not-an-id'},{CLOUDFLARE_ACCOUNT_ID:'wrong'}]){
  let called=false;
  await assert.rejects(verifyProtectedTokenIdentity({...valid(),...patch},{fetchImpl:async()=>{called=true;throw Error('network')}}),/protected_token_identity_hold_/);
  assert.equal(called,false);
 }
});
test('mismatched and disabled token rejects identity despite valid GitHub main',async()=>{
 for(const result of [{id:'c'.repeat(32),status:'active'},{id,status:'disabled'},{id,status:'expired'},{status:'active'}]){
  const a=stub({success:true,result});
  await assert.rejects(verifyProtectedTokenIdentity(valid(),a),/protected_token_identity_hold_/);
  assert.equal(a.urls.length,2);
 }
});
test('stale current main rejects before Cloudflare call',async()=>{
 let n=0;
 const fetchImpl=async()=>{n++;return response({object:{sha:'c'.repeat(40)}})};
 await assert.rejects(verifyProtectedTokenIdentity(valid(),{fetchImpl}),/stale_main/);
 assert.equal(n,1);
});
test('provider refusal and malformed JSON fail closed',async()=>{
 for(const fetchImpl of [async()=>({status:403,ok:false}),async()=>({status:200,ok:true,json:async()=>{throw Error('bad json')}})]){
  await assert.rejects(verifyProtectedTokenIdentity(valid(),{fetchImpl}),/protected_token_identity_hold_/);
 }
});

test('safe failure classification cannot echo token values, IDs, or arbitrary errors',()=>{
 const known=['authority','connection','provider_refused','provider_response','stale_main',
  'inactive_or_unverified','token_id_mismatch'];
 for(const reason of known)assert.equal(sanitizedTokenHoldCode(new Error('protected_token_identity_hold_'+reason)),reason);
 for(const message of [
  'Bearer synthetic-secret',
  'protected_token_identity_hold_token_id_mismatch secret=private',
  'protected_token_identity_hold_'+('b'.repeat(32)),
  'anything else',
 ])assert.equal(sanitizedTokenHoldCode(new Error(message)),'unclassified');
 assert.equal(sanitizedTokenHoldCode({message:'protected_token_identity_hold_unlisted_reason'}),'unclassified');
});
