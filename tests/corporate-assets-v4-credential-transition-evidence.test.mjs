import test from 'node:test';
import assert from 'node:assert/strict';
import {assessV4CredentialTransition,inspectV4CredentialTransition}
 from '../scripts/corporate-assets-v4-credential-transition-evidence.mjs';
import {WORKER} from '../scripts/corporate-assets-v3-private-exposure-attestation.mjs';
import {DB,ROLLBACK,CANDIDATE} from '../scripts/corporate-assets-v3-predeployment-attestation.mjs';
import {SECRET_CANDIDATE_V4,LEGACY_SOURCE_SHA}
 from '../scripts/corporate-assets-v4-readonly-qualification.mjs';
const SHA='b8d304c852b5548754ace8e57be31e3d50b6c717';
const SCRIPT='cf696a00607c2b899fefda9fa0277d3ba75b6fe53e64fd40782dee5e533b0198';
const plain=(name,value)=>({name,type:'plain_text',text:value});
const bindings=(old)=>[
 plain('APP_ENV','staging'),plain('DEPLOYMENT_PROFILE','corporate-assets-isolated'),
 plain('ASSETS_STAGING_SOURCE_SHA',LEGACY_SOURCE_SHA),plain('ASSETS_STAGING_D1_ID',DB),
 ...['ASSETS_STAGING_WRITES_ENABLED','THEBE_CORPORATE_ASSETS_ENABLED',
 'EVIDENCE_UPLOADS_ENABLED','POP_UPLOAD_STAGING_ENABLED','THEBE_AI_EXPORTS_ENABLED',
 'THEBE_GENERAL_AI_ENABLED','THEBE_INTERNAL_AUTONOMY_ENABLED',
 'THEBE_LIVE_VOICE_ENABLED'].map(name=>plain(name,'false')),
 plain('PAYMENT_PROVIDER','none'),plain('REGISTRATION_MODE','hold'),
 {name:'DB',type:'d1',database_id:DB},
 {name:'SESSION_SECRET',type:old?'plain_text':'secret_text'},
 {name:'AUDIT_INTEGRITY_SECRET',type:old?'plain_text':'secret_text'}
];
const version=(id,number,old=false)=>({id,number,resources:{
 script:{etag:SCRIPT},bindings:bindings(old)}});
const input=()=>({
 reviewedMainSha:SHA,
 v2:version(ROLLBACK,2,true),v3:version(CANDIDATE,3),
 v4:version(SECRET_CANDIDATE_V4,4),
 deployments:{
  result:{deployments:[
   {id:'33e1d736-54f6-4a72-9087-cabed895dc99',
    created_on:'2026-11-05T19:23:03Z',versions:[{version_id:ROLLBACK,percentage:100}]},
   {id:'4eae3ad9-1d47-4c54-8af6-15ed63597765',
    created_on:'2026-11-05T18:22:07Z',
    versions:[{version_id:'94d2b523-b36c-4d3e-935f-1606f1e78f0f',percentage:100}]}
  ]},
  result_info:{page:1,count:2,total_count:2,total_pages:1}
 },
 privateExposure:{worker:WORKER,privateExposureVerified:true,errors:[],
  deploymentAuthorized:false}
});
test('same ETags establish version continuity only, not exact current main or deploy readiness',()=>{
 const evidence=assessV4CredentialTransition(input());
 assert.deepEqual(evidence.errors,[]);
 assert.equal(evidence.cloudflareScriptEtagContinuityVerified,true);
 assert.equal(evidence.candidateSecretBindingTypesVerified,true);
 assert.equal(evidence.activeVersionStillUnsafe,true);
 assert.equal(evidence.candidateStillUndeployed,true);
 assert.ok(evidence.blockers.includes('historical_v4_source_marker_not_current_main'));
 for(const key of ['exactGitHubSourceBytesVerified','credentialValueContinuityVerified',
  'sessionCompatibilityVerified','auditIntegrityContinuityVerified','functionalAcceptanceVerified',
  'rollbackAcceptanceVerified','stagingDeploymentAuthorized','productionChanged'])
  assert.equal(evidence[key],false);
});
test('even matching source marker is not GitHub-to-Cloudflare bytes proof',()=>{
 const x=input();x.reviewedMainSha=LEGACY_SOURCE_SHA;
 const receipt=assessV4CredentialTransition(x);
 assert.equal(receipt.cloudflareScriptEtagContinuityVerified,true);
 assert.equal(receipt.blockers.includes('historical_v4_source_marker_not_current_main'),false);
 assert.equal(receipt.exactGitHubSourceBytesVerified,false);
});
test('reject script mismatch, malformed ETags and forged version identities',()=>{
 for(const mutate of [
  x=>x.v4.resources.script.etag='b'.repeat(64),
  x=>x.v3.resources.script.etag='invalid',
  x=>x.v2.resources.script.etag=undefined,
  x=>x.v4.id=CANDIDATE,
  x=>x.v3.number=4,
  x=>x.v2.resources.bindings.find(v=>v.name==='ASSETS_STAGING_SOURCE_SHA').text=SHA
 ]){const x=input();mutate(x);
  const r=assessV4CredentialTransition(x);
  assert.equal(r.cloudflareScriptEtagContinuityVerified,false);
  assert.equal(r.stagingDeploymentAuthorized,false);
 }
});
test('reject plaintext candidate credentials, cross-bound D1 and activation',()=>{
 for(const mutate of [
  x=>x.v4.resources.bindings.find(v=>v.name==='SESSION_SECRET').type='plain_text',
  x=>x.v3.resources.bindings.find(v=>v.name==='AUDIT_INTEGRITY_SECRET').type='plain_text',
  x=>x.v2.resources.bindings.find(v=>v.name==='SESSION_SECRET').type='secret_text',
  x=>x.v4.resources.bindings.find(v=>v.name==='DB').database_id='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce',
  x=>x.v2.resources.bindings.find(v=>v.name==='ASSETS_STAGING_WRITES_ENABLED').text='true',
  x=>x.v3.resources.bindings.find(v=>v.name==='THEBE_CORPORATE_ASSETS_ENABLED').text='true',
  x=>x.v4.resources.bindings.find(v=>v.name==='PAYMENT_PROVIDER').text='enabled',
  x=>x.v4.resources.bindings.push(plain('ASSETS_STAGING_WRITES_ENABLED','false'))
 ]){const x=input();mutate(x);const r=assessV4CredentialTransition(x);
  assert.notDeepEqual(r.errors,[]);
  assert.equal(r.stagingDeploymentAuthorized,false);}
});
test('reject deployed candidate, changed traffic, incomplete history and external exposure',()=>{
 for(const mutate of [
  x=>x.deployments.result.deployments[0].versions[0].version_id=SECRET_CANDIDATE_V4,
  x=>x.deployments.result.deployments[0].versions[0].percentage=95,
  x=>x.deployments.result_info.total_count=3,
  x=>x.deployments.result_info.total_pages=2,
  x=>x.deployments.result.deployments[0].created_on='invalid',
  x=>x.privateExposure.privateExposureVerified=false,
  x=>x.privateExposure.errors.push('worker_zone_route_attached'),
  x=>x.privateExposure.worker='another-worker'
 ]){const x=input();mutate(x);const r=assessV4CredentialTransition(x);
  assert.ok(r.errors.length);assert.equal(r.stagingDeploymentAuthorized,false);}
});
test('credential bytes from upstream cannot enter metadata receipt',()=>{
 const x=input();
 for(const v of [x.v2,x.v3,x.v4])for(const b of v.resources.bindings){
  if(['SESSION_SECRET','AUDIT_INTEGRITY_SECRET'].includes(b.name))
   b.text='UNIQUE-SYNTHETIC-DO-NOT-PRINT';
 }
 const out=JSON.stringify(assessV4CredentialTransition(x));
 assert.equal(out.includes('UNIQUE-SYNTHETIC-DO-NOT-PRINT'),false);
});
test('protected runner performs only authenticated GETs and never returns secret values',async()=>{
 const f=input();
 const prefix='/workers/scripts/'+WORKER;
 const endpoints={
  ['/versions/'+ROLLBACK]:{result:f.v2,success:true},
  ['/versions/'+CANDIDATE]:{result:f.v3,success:true},
  ['/versions/'+SECRET_CANDIDATE_V4]:{result:f.v4,success:true},
  '/deployments?page=1&per_page=100':{...f.deployments,success:true}
 };
 const calls=[];
 const request=async(url,opts)=>{
  calls.push({url,method:opts.method,authorization:opts.headers.authorization});
  const suffix=url.split(prefix)[1];
  assert.equal(opts.method,'GET');
  assert.ok(endpoints[suffix]);
  return {ok:true,json:async()=>endpoints[suffix]};
 };
 let exposureCalls=0;
 const readExposure=async({token,accountToken,request:r})=>{
  exposureCalls++;
  assert.equal(token,'mock-worker-token');
  assert.equal(accountToken,'mock-account-read-token');
  assert.equal(r,request);
  return f.privateExposure;
 };
 const out=await inspectV4CredentialTransition({
  expectedMainSha:SHA,repository:'adinosassist-stack/botswana-compliance-platform',
  ref:'refs/heads/main',githubSha:SHA,
  token:'mock-worker-token',accountToken:'mock-account-read-token',
  request,readExposure
 });
 assert.equal(calls.length,4);assert.equal(exposureCalls,1);
 assert.equal(out.cloudflareScriptEtagContinuityVerified,true);
 assert.equal(out.stagingDeploymentAuthorized,false);
 assert.ok(calls.every(x=>x.authorization==='Bearer mock-worker-token'));
 assert.equal(JSON.stringify(out).includes('mock-worker-token'),false);
});
test('runner denies non-main, unauthorized account tokens and failed Cloudflare metadata',async()=>{
 const good={expectedMainSha:SHA,repository:'adinosassist-stack/botswana-compliance-platform',
  ref:'refs/heads/main',githubSha:SHA,token:'mock-worker-token',
  accountToken:'mock-account-read-token',request:async()=>{throw Error('must not request');},
  readExposure:async()=>{throw Error('must not read exposure');}};
 for(const mutate of [
  x=>x.expectedMainSha='invalid',x=>x.ref='refs/heads/test',
  x=>x.githubSha='a'.repeat(40),x=>x.accountToken='',
  x=>x.token='Bearer token',x=>x.repository='another-repo'
 ]){const x={...good};mutate(x);await assert.rejects(()=>inspectV4CredentialTransition(x));}
 await assert.rejects(()=>inspectV4CredentialTransition({
  ...good,request:async()=>({ok:false,status:403}),
  readExposure:async()=>good.privateExposure||input().privateExposure
 }),/worker_version_metadata_get_denied_403/);
});
