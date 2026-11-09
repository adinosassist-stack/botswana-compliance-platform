import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyAssetV3,CANDIDATE,ROLLBACK,DB} from '../scripts/corporate-assets-v3-predeployment-attestation.mjs';
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
 deployments:{deployments:[{id:'deployment-v2',versions:[{version_id:ROLLBACK,percentage:100}]}]},
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
 assert.equal(result.ready,true);assert.deepEqual(result.errors,[]);
 assert.equal('token' in result,false);
});
test('historical source marker fails even when secrets are fixed',()=>rejected(
 a=>a.candidate.resources.bindings.find(x=>x.name==='ASSETS_STAGING_SOURCE_SHA').text='b'.repeat(40),'source_sha_mismatch'));
test('source label cannot replace independent verified bundle digest',()=>rejected(
 a=>a.sourceReceipt={verified:true,candidateVersion:CANDIDATE,reviewedSha:sha},'exact_bundle_source_receipt_required'));
test('deployment of candidate fails and rollback must still be live',()=>{
 rejected(a=>a.deployments.deployments.unshift({id:'new-deployment',versions:[{version_id:CANDIDATE,percentage:100}]}),'candidate_must_remain_undeployed');
 rejected(a=>a.deployments.deployments[0].versions[0].percentage=50,'rollback_version_must_serve_all_traffic');
});
test('secret bindings must not regress to plain text',()=>rejected(
 a=>a.candidate.resources.bindings.find(x=>x.name==='SESSION_SECRET').type='plain_text','SESSION_SECRET_must_be_secret_text'));
test('private routing/preview needs independently verified receipt',()=>{
 rejected(a=>a.exposureReceipt=undefined,'private_exposure_receipt_required');
 rejected(a=>a.exposureReceipt.previewPubliclyReachable=true,'private_exposure_receipt_required');
 rejected(a=>a.exposureReceipt.publicRoutes=1,'private_exposure_receipt_required');
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
