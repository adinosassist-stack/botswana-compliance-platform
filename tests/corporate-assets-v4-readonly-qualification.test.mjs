import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateV4ReadOnlyQualification,inspectV4ReadOnlyQualification,SECRET_CANDIDATE_V4,LEGACY_SOURCE_SHA}
 from '../scripts/corporate-assets-v4-readonly-qualification.mjs';
import {DB,ROLLBACK,CANDIDATE,WORKER}
 from '../scripts/corporate-assets-v3-predeployment-attestation.mjs';

const main='c8f8bdccbbe757145117875a4391f8e174fb46e0';
const v1='94d2b523-b36c-4d3e-935f-1606f1e78f0f';
const pt=(name,value)=>({name,type:'plain_text',text:value});
const inert=(secretType)=>[
 pt('APP_ENV','staging'),pt('DEPLOYMENT_PROFILE','corporate-assets-isolated'),
 pt('ASSETS_STAGING_SOURCE_SHA',LEGACY_SOURCE_SHA),
 pt('ASSETS_STAGING_D1_ID',DB),
 pt('PAYMENT_PROVIDER','none'),pt('REGISTRATION_MODE','hold'),
 ...['ASSETS_STAGING_WRITES_ENABLED','THEBE_CORPORATE_ASSETS_ENABLED',
 'EVIDENCE_UPLOADS_ENABLED','POP_UPLOAD_STAGING_ENABLED','THEBE_AI_EXPORTS_ENABLED',
 'THEBE_GENERAL_AI_ENABLED','THEBE_INTERNAL_AUTONOMY_ENABLED','THEBE_LIVE_VOICE_ENABLED'].map(n=>pt(n,'false')),
 {name:'DB',type:'d1',database_id:DB},
 {name:'SESSION_SECRET',type:secretType},
 {name:'AUDIT_INTEGRITY_SECRET',type:secretType}
];
const fixture=()=>({
 reviewedMainSha:main,
 versionInventory:{result:{items:[{id:SECRET_CANDIDATE_V4,number:4},{id:CANDIDATE,number:3},
 {id:ROLLBACK,number:2},{id:v1,number:1}]},
 result_info:{page:1,count:4,total_count:4}},
 candidateVersion:{id:SECRET_CANDIDATE_V4,number:4,resources:{bindings:inert('secret_text')}},
 activeVersion:{id:ROLLBACK,number:2,resources:{bindings:inert('plain_text')}},
 deployments:{result:{deployments:[
 {id:'33e1d736-54f6-4a72-9087-cabed895dc99',
 created_on:'2026-11-05T19:23:03Z',versions:[{version_id:ROLLBACK,percentage:100}]},
 {id:'4eae3ad9-1d47-4c54-8af6-15ed63597765',
 created_on:'2026-11-05T18:22:07Z',versions:[{version_id:v1,percentage:100}]}
 ]},result_info:{page:1,count:2,total_count:2,total_pages:1}},
 privateExposure:{worker:WORKER,privateExposureVerified:true,errors:[],
 deploymentAuthorized:false,sourceProvenanceVerified:false}
});
test('new v4 is private and credential-type safe but does NOT qualify exact current main or a deployment',()=>{
 const result=evaluateV4ReadOnlyQualification(fixture());
 assert.equal(result.candidateVersionId,SECRET_CANDIDATE_V4);
 assert.equal(result.candidateMetadataVerified,true);
 assert.equal(result.candidateBindingTypesSafe,true);
 assert.equal(result.candidateUndeployed,true);
 assert.equal(result.privateExposureVerified,true);
 assert.equal(result.activeCredentialRisk,true);
 assert.equal(result.errors.length,0);
 assert.ok(result.blockers.includes('candidate_v4_source_marker_not_current_main'));
 assert.ok(result.blockers.includes('active_v2_credential_binding_type_unsafe'));
 for(const key of ['credentialValuesVerified','uploadedSourceBytesVerified',
 'exactSourceProvenanceVerified','stagingDeploymentAuthorized','productionChanged'])
  assert.equal(result[key],false);
});
test('source marker equal to reviewed main is still not compiled artifact provenance',()=>{
 const f=fixture();f.reviewedMainSha=LEGACY_SOURCE_SHA;
 const r=evaluateV4ReadOnlyQualification(f);
 assert.equal(r.blockers.includes('candidate_v4_source_marker_not_current_main'),false);
 assert.equal(r.exactSourceProvenanceVerified,false);
 assert.equal(r.stagingDeploymentAuthorized,false);
});
test('reject incomplete inventory, duplicates, unknown versions, wrong candidate identity and order',()=>{
 for(const change of [
  f=>f.versionInventory.result_info.total_count=5,
  f=>f.versionInventory.result_info.page=2,
  f=>f.versionInventory.result.items.push({id:'11111111-2222-4333-8444-555555555555',number:5}),
  f=>f.versionInventory.result.items[0].id=CANDIDATE,
  f=>f.versionInventory.result.items[0].number=5,
  f=>f.candidateVersion.id=CANDIDATE,
  f=>f.candidateVersion.number=3
 ]){const f=fixture();change(f);const r=evaluateV4ReadOnlyQualification(f);
  assert.equal(r.candidateMetadataVerified,false);
  assert.equal(r.stagingDeploymentAuthorized,false);}
});
test('reject unsafe v4 secrets, D1 crossover, write/AI activation and misconfigured payment',()=>{
 for(const change of [
  f=>f.candidateVersion.resources.bindings.find(b=>b.name==='SESSION_SECRET').type='plain_text',
  f=>f.candidateVersion.resources.bindings.find(b=>b.name==='DB').database_id='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce',
  f=>f.candidateVersion.resources.bindings.find(b=>b.name==='ASSETS_STAGING_WRITES_ENABLED').text='true',
  f=>f.candidateVersion.resources.bindings.find(b=>b.name==='THEBE_GENERAL_AI_ENABLED').text='true',
  f=>f.candidateVersion.resources.bindings.find(b=>b.name==='PAYMENT_PROVIDER').text='live',
  f=>f.candidateVersion.resources.bindings.push(pt('THEBE_CORPORATE_ASSETS_ENABLED','false'))
 ]){const f=fixture();change(f);assert.equal(evaluateV4ReadOnlyQualification(f).candidateMetadataVerified,false);}
});
test('reject candidate deployment, changed active traffic, incomplete deployment inventory and exposed routes',()=>{
 for(const change of [
  f=>f.deployments.result.deployments[0].versions[0].version_id=SECRET_CANDIDATE_V4,
  f=>f.deployments.result.deployments[0].versions[0].percentage=99,
  f=>f.deployments.result_info.total_pages=2,
  f=>f.deployments.result_info.count=1,
  f=>f.deployments.result.deployments[0].created_on='invalid',
  f=>f.privateExposure.privateExposureVerified=false,
  f=>f.privateExposure.errors.push('worker_zone_route_attached'),
  f=>f.privateExposure.worker='another-worker',
  f=>f.activeVersion.resources.bindings.find(b=>b.name==='DB').database_id='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce'
 ]){const f=fixture();change(f);const r=evaluateV4ReadOnlyQualification(f);
  assert.equal(r.candidateMetadataVerified,false);assert.equal(r.stagingDeploymentAuthorized,false);}
});
test('never emit secret values, even if upstream metadata includes accidental sensitive data',()=>{
 const f=fixture();
 f.candidateVersion.resources.bindings.find(b=>b.name==='SESSION_SECRET').text='highly-sensitive-synthetic-test-value';
 f.activeVersion.resources.bindings.find(b=>b.name==='AUDIT_INTEGRITY_SECRET').text='other-highly-sensitive-synthetic-test-value';
 const encoded=JSON.stringify(evaluateV4ReadOnlyQualification(f));
 assert.equal(encoded.includes('highly-sensitive-synthetic-test-value'),false);
 assert.equal(encoded.includes('other-highly-sensitive-synthetic-test-value'),false);
});

test('protected runner makes only four Worker metadata GETs and isolated account exposure read',async()=>{
 const f=fixture();const calls=[];
 const data={
  '/versions?page=1&per_page=100':f.versionInventory,
  ['/versions/'+SECRET_CANDIDATE_V4]:{success:true,result:f.candidateVersion},
  ['/versions/'+ROLLBACK]:{success:true,result:f.activeVersion},
  '/deployments?page=1&per_page=100':f.deployments
 };
 const read=async(url,opts)=>{
  calls.push({url,method:opts.method,authorization:opts.headers.authorization});
  assert.equal(opts.method,'GET');
  const suffix=url.split('/workers/scripts/'+WORKER)[1];
  const result=data[suffix];
  if(!result)throw Error('unexpected GET: '+suffix);
  return {ok:true,json:async()=>result};
 };
 let accountReaderCalls=0;
 const exposure=async({token,accountToken,request})=>{
  accountReaderCalls++;
  assert.equal(token,'synthetic-worker-read-token');
  assert.equal(accountToken,'synthetic-account-read-token');
  assert.equal(request,read);
  return f.privateExposure;
 };
 const receipt=await inspectV4ReadOnlyQualification({
  expectedMainSha:main,repository:'adinosassist-stack/botswana-compliance-platform',
  ref:'refs/heads/main',githubSha:main,token:'synthetic-worker-read-token',
  accountToken:'synthetic-account-read-token',request:read,readExposure:exposure
 });
 assert.equal(calls.length,4);
 assert.equal(accountReaderCalls,1);
 assert.equal(receipt.candidateMetadataVerified,true);
 assert.equal(receipt.exactSourceProvenanceVerified,false);
 assert.equal(receipt.stagingDeploymentAuthorized,false);
 assert.ok(calls.every(x=>x.authorization==='Bearer synthetic-worker-read-token'));
 assert.equal(JSON.stringify(receipt).includes('synthetic-worker-read-token'),false);
});
test('protected runner refuses non-main, malformed credentials and failed metadata',async()=>{
 const good={expectedMainSha:main,repository:'adinosassist-stack/botswana-compliance-platform',
  ref:'refs/heads/main',githubSha:main,token:'synthetic-worker-read-token',
  accountToken:'synthetic-account-read-token',request:async()=>{throw Error('should not call')},
  readExposure:async()=>{throw Error('should not call')}};
 for(const change of [
  c=>c.ref='refs/heads/feature',c=>c.githubSha='a'.repeat(40),
  c=>c.expectedMainSha='notsha',c=>c.token='Bearer token',
  c=>c.accountToken='',c=>c.accountToken='contains whitespace'
 ]){const c={...good};change(c);await assert.rejects(()=>inspectV4ReadOnlyQualification(c));}
 await assert.rejects(()=>inspectV4ReadOnlyQualification({...good,
  request:async()=>({ok:false,status:403})}),/v4_metadata_read_denied_403/);
});
