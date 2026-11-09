import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyAssetV3,inspectAssetV3,CANDIDATE,ROLLBACK,DB} from '../scripts/corporate-assets-v3-predeployment-attestation.mjs';
const sha='a'.repeat(40);
const plain=(name,text)=>({name,type:'plain_text',text});
const data=()=>({
 candidate:{id:CANDIDATE,number:3,resources:{bindings:[
  plain('APP_ENV','staging'),plain('DEPLOYMENT_PROFILE','corporate-assets-isolated'),
  plain('ASSETS_STAGING_WRITES_ENABLED','false'),plain('THEBE_CORPORATE_ASSETS_ENABLED','false'),
  plain('ASSETS_STAGING_D1_ID',DB),plain('ASSETS_STAGING_SOURCE_SHA',sha),
  {name:'DB',type:'d1',database_id:DB},
  {name:'SESSION_SECRET',type:'secret_text'}, {name:'AUDIT_INTEGRITY_SECRET',type:'secret_text'},
  ...['EVIDENCE_UPLOADS_ENABLED','POP_UPLOAD_STAGING_ENABLED','THEBE_AI_EXPORTS_ENABLED',
  'THEBE_GENERAL_AI_ENABLED','THEBE_INTERNAL_AUTONOMY_ENABLED','THEBE_LIVE_VOICE_ENABLED'].map(n=>plain(n,'false')),
  plain('PAYMENT_PROVIDER','none'),plain('REGISTRATION_MODE','hold')
 ]}},
 deployments:{deployments:[{id:'deployment-v2',created_on:'2026-11-05T19:23:03.212311Z',versions:[{version_id:ROLLBACK,percentage:100}]}],result_info:{page:1,total_pages:1,count:1}},
 reviewedMainSha:sha,
 sourceReceipt:{verified:true,candidateVersion:CANDIDATE,reviewedSha:sha,bundleDigestVerified:true},
 exposureReceipt:{verified:true,candidateVersion:CANDIDATE,publicRoutes:0,workersDev:false,previewPubliclyReachable:false}
});
function rejected(mutator,expected){
 const a=data();mutator(a);const receipt=qualifyAssetV3(a);
 assert.equal(receipt.ready,false);assert.ok(receipt.errors.includes(expected),JSON.stringify(receipt.errors));
}
test('metadata-only attestation qualifies only complete synthetic evidence',()=>{
 const result=qualifyAssetV3(data());
 assert.equal(result.ready,false);assert.deepEqual(result.errors,['independent_bundle_provenance_verifier_required','independent_private_exposure_verifier_required']);
 assert.equal('token' in result,false);
});
test('historical source marker fails even when secrets are fixed',()=>rejected(
 a=>a.candidate.resources.bindings.find(x=>x.name==='ASSETS_STAGING_SOURCE_SHA').text='b'.repeat(40),'source_sha_mismatch'));
test('caller-supplied forged receipts cannot qualify release',()=>{
 const a=data();a.sourceReceipt={verified:true,candidateVersion:CANDIDATE,reviewedSha:sha,bundleDigestVerified:true};
 a.exposureReceipt={verified:true,candidateVersion:CANDIDATE,publicRoutes:0,workersDev:false,previewPubliclyReachable:false};
 const result=qualifyAssetV3(a);
 assert.equal(result.ready,false);
 assert.ok(result.errors.includes('independent_bundle_provenance_verifier_required'));
 assert.ok(result.errors.includes('independent_private_exposure_verifier_required'));
});
test('deployment of candidate fails and rollback must still be live',()=>{
 rejected(a=>a.deployments.deployments.unshift({id:'new-deployment',created_on:'2026-11-06T00:00:00Z',versions:[{version_id:CANDIDATE,percentage:100}]}),'candidate_must_remain_undeployed');
 rejected(a=>a.deployments.deployments[0].versions[0].percentage=50,'rollback_version_must_serve_all_traffic');
});
test('secret bindings must not regress to plain text',()=>rejected(
 a=>a.candidate.resources.bindings.find(x=>x.name==='SESSION_SECRET').type='plain_text','SESSION_SECRET_must_be_secret_text'));
test('unverified preview receipt cannot bypass independent verification',()=>{
 const a=data();a.exposureReceipt={verified:true,candidateVersion:CANDIDATE,publicRoutes:0,workersDev:false,previewPubliclyReachable:false};
 assert.ok(qualifyAssetV3(a).errors.includes('independent_private_exposure_verifier_required'));
});
test('writes, D1, payments and uploads remain disabled or isolated',()=>{
 rejected(a=>a.candidate.resources.bindings.find(x=>x.name==='DB').database_id='wrong','d1_binding_mismatch');
 rejected(a=>a.candidate.resources.bindings.find(x=>x.name==='ASSETS_STAGING_WRITES_ENABLED').text='true','writes_must_remain_off');
 rejected(a=>a.candidate.resources.bindings.find(x=>x.name==='PAYMENT_PROVIDER').text='live','payment_provider_must_be_none');
 rejected(a=>a.candidate.resources.bindings.find(x=>x.name==='POP_UPLOAD_STAGING_ENABLED').text='true','POP_UPLOAD_STAGING_ENABLED_must_remain_disabled');
});
test('candidate version and reviewed main must match precisely',()=>{
 rejected(a=>a.candidate.id='other','candidate_identity_mismatch');
 rejected(a=>a.reviewedMainSha='invalid','invalid_reviewed_main_sha');
});

test('deployment ordering uses timestamp, not API array order',()=>{
 const a=data();
 a.deployments.deployments.unshift({id:'historic',created_on:'2026-11-04T00:00:00Z',versions:[{version_id:'old-v1',percentage:100}]});
 a.deployments.result_info.count=2;
 const result=qualifyAssetV3(a);
 assert.ok(!result.errors.includes('rollback_version_must_serve_all_traffic'));
});
test('refuse partial, missing, duplicate-timestamp and malformed deployments',()=>{
 rejected(a=>a.deployments.result_info.total_pages=2,'complete_deployment_listing_required');
 rejected(a=>delete a.deployments.result_info,'complete_deployment_listing_required');
 rejected(a=>a.deployments.deployments[0].created_on='nonsense','deployment_timestamps_required');
 rejected(a=>a.deployments.deployments.push({...a.deployments.deployments[0]}),'complete_deployment_listing_required');
});
test('mocked Cloudflare HTTP GET responses never issue release approval',async()=>{
 const a=data();
 const paths=[];
 const request=async url=>{
  paths.push(url);
  if(url.endsWith('/deployments'))return {ok:true,json:async()=>({success:true,result:{deployments:a.deployments.deployments},result_info:a.deployments.result_info})};
  if(url.includes('/versions/'))return {ok:true,json:async()=>({success:true,result:a.candidate})};
  throw Error('unexpected_url');
 };
 const receipt=await inspectAssetV3({token:'synthetic-read-token',reviewedMainSha:sha,request});
 assert.equal(receipt.ready,false);
 assert.deepEqual(receipt.errors,['independent_bundle_provenance_verifier_required','independent_private_exposure_verifier_required']);
 assert.equal(paths.length,2);
 assert.ok(paths.every(url=>url.startsWith('https://api.cloudflare.com/client/v4/')));
});
test('mocked HTTP and malformed envelopes fail closed',async()=>{
 const bad=async()=>({ok:false,status:403});
 await assert.rejects(inspectAssetV3({token:'synthetic',reviewedMainSha:sha,request:bad}),/metadata_request_failed_403/);
 const malformed=async()=>({ok:true,json:async()=>({success:false,result:null})});
 await assert.rejects(inspectAssetV3({token:'synthetic',reviewedMainSha:sha,request:malformed}),/metadata_response_invalid/);
 await assert.rejects(inspectAssetV3({token:'',reviewedMainSha:sha}),/read_token_and_sha_required/);
});
