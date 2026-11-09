import test from 'node:test';
import assert from 'node:assert/strict';
import {requireVersionOnlyContext,checkVersionInventory,verifyStableDeployment,
 assertInertVersionBindings,assertVersionOnlyResult,minimalWranglerEnvironment} from '../scripts/corporate-assets-protected-source-version-upload.mjs';
import {DB,ROLLBACK,CANDIDATE} from '../scripts/corporate-assets-v3-predeployment-attestation.mjs';
const sha='a'.repeat(40),newId='11111111-2222-4333-8444-555555555555';
const text=(name,value)=>({name,type:'plain_text',text:value});
const bindings=()=>[
 text('APP_ENV','staging'),text('DEPLOYMENT_PROFILE','corporate-assets-isolated'),
 text('ASSETS_STAGING_D1_ID',DB),text('ASSETS_STAGING_SOURCE_SHA',sha),
 text('ASSETS_STAGING_WRITES_ENABLED','false'),text('THEBE_CORPORATE_ASSETS_ENABLED','false'),
 text('PAYMENT_PROVIDER','none'),text('REGISTRATION_MODE','hold'),
 ...['EVIDENCE_UPLOADS_ENABLED','POP_UPLOAD_STAGING_ENABLED','THEBE_AI_EXPORTS_ENABLED',
 'THEBE_GENERAL_AI_ENABLED','THEBE_INTERNAL_AUTONOMY_ENABLED','THEBE_LIVE_VOICE_ENABLED'].map(x=>text(x,'false')),
 {name:'DB',type:'d1',database_id:DB},
 {name:'SESSION_SECRET',type:'secret_text'},{name:'AUDIT_INTEGRITY_SECRET',type:'secret_text'}];
const oldIds=[ROLLBACK,CANDIDATE,'94d2b523-b36c-4d3e-935f-1606f1e78f0f'];
const inventory=(next=false)=>({items:[
 ...oldIds.map((id,i)=>({id,number:i+1})),...(next?[{id:newId,number:4}]:[])
 ],total_count:next?4:3});
const deployment=()=>({deployments:[{id:'dep1',created_on:'2026-11-09T05:00:00Z',
 versions:[{version_id:ROLLBACK,percentage:100}]}],result_info:{page:1,total_pages:1,count:1}});
const result=()=>({beforeIds:oldIds,afterIds:inventory(true),
 beforeDeployments:deployment(),afterDeployments:deployment(),
 newVersion:{id:newId,number:4,resources:{bindings:bindings()}},expectedSha:sha,
 exposureBefore:{privateExposureVerified:true},exposureAfter:{privateExposureVerified:true},
 reproducibility:{sourceSha:sha,executableModuleReproducible:true,
  executableModuleDigest:'c'.repeat(64),sourceToCloudflareUploadVerified:false}});
test('authorizes no mutation without exact explicit main-only owner and independent gate context',()=>{
 const good={mode:'create-version-only',authorization:'CREATE_ISOLATED_ASSETS_SOURCE_VERSION',
  repo:'adinosassist-stack/botswana-compliance-platform',ref:'refs/heads/main',
  sha,expectedSha:sha,githubReadToken:'test',cloudflareToken:'test'};
 assert.equal(requireVersionOnlyContext(good),true);
 for(const change of [
  a=>a.authorization='PREFLIGHT_ONLY',a=>a.mode='deploy',a=>a.ref='refs/heads/pr',
  a=>a.sha='b'.repeat(40),a=>a.expectedSha='invalid',a=>a.githubReadToken='',
  a=>a.cloudflareToken=''
 ]){const a={...good};change(a);assert.throws(()=>requireVersionOnlyContext(a))}
});
test('version inventory must be complete and introduce exactly one new version',()=>{
 assert.deepEqual(checkVersionInventory(inventory()),oldIds);
 assert.equal(checkVersionInventory(inventory(true),{newVersion:true,priorIds:oldIds}),newId);
 const many=inventory(true);many.items.push({id:'22222222-2222-4222-8222-222222222222',number:5});many.total_count=5;
 assert.throws(()=>checkVersionInventory(many,{newVersion:true,priorIds:oldIds}));
 const incomplete=inventory();incomplete.total_count=5;
 assert.throws(()=>checkVersionInventory(incomplete));
});
test('existing deployed v2 must remain at 100 percent and listing complete',()=>{
 assert.deepEqual(verifyStableDeployment(deployment()),['dep1']);
 const a=deployment();a.deployments[0].versions[0].percentage=99;
 assert.throws(()=>verifyStableDeployment(a));
 const b=deployment();b.result_info.total_pages=2;
 assert.throws(()=>verifyStableDeployment(b));
});
test('exact staging metadata and preserved secret types on new version',()=>{
 assert.equal(assertInertVersionBindings({resources:{bindings:bindings()}},sha),true);
 const a=bindings();a.find(b=>b.name==='SESSION_SECRET').type='plain_text';
 assert.throws(()=>assertInertVersionBindings({resources:{bindings:a}},sha));
 const b=bindings();b.find(x=>x.name==='THEBE_GENERAL_AI_ENABLED').text='true';
 assert.throws(()=>assertInertVersionBindings({resources:{bindings:b}},sha));
 const c=bindings();c.find(x=>x.name==='DB').database_id='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
 assert.throws(()=>assertInertVersionBindings({resources:{bindings:c}},sha));
});
test('successful version-only check still refuses uploaded-byte claims and deployment',()=>{
 const x=assertVersionOnlyResult(result());
 assert.equal(x.newVersionId,newId);
 assert.equal(x.versionCreated,true);
 assert.equal(x.secretValuesVerified,false);
 assert.equal(x.uploadedBytesCryptographicallyVerified,false);
 assert.equal(x.independentSourceProvenanceVerified,false);
 assert.equal(x.deploymentAuthorized,false);
 assert.equal(x.productionChanged,false);
});
test('detects post-upload traffic shift, public exposure, wrong candidate or forged input receipt',()=>{
 for(const mutation of [
  a=>a.afterDeployments.deployments[0].versions[0].version_id=newId,
  a=>a.afterDeployments.deployments[0].versions[0].percentage=99,
  a=>a.afterDeployments.deployments[0].id='dep2',
  a=>a.newVersion.id=CANDIDATE,
  a=>a.exposureAfter.privateExposureVerified=false,
  a=>a.reproducibility.sourceSha='b'.repeat(40),
  a=>a.reproducibility.sourceToCloudflareUploadVerified=true
 ]){const a=result();mutation(a);assert.throws(()=>assertVersionOnlyResult(a))}
});

test('Wrangler subprocess cannot inherit GitHub, staging tokens or unrelated secrets',()=>{
 const e=minimalWranglerEnvironment('fake-cloudflare-token',{
  PATH:'/usr/bin',HOME:'/home/runner',GITHUB_TOKEN:'danger',
  ASSETS_STAGING_GITHUB_READ_TOKEN:'danger2',SESSION_SECRET:'danger3',
  NODE_OPTIONS:'--require injected.js',CLOUDFLARE_API_TOKEN:'old'});
 assert.equal(e.CLOUDFLARE_API_TOKEN,'fake-cloudflare-token');
 assert.equal(e.CLOUDFLARE_ACCOUNT_ID,'ddd23cab31928a4bb3d4998df9b26d1d');
 assert.equal(e.WRANGLER_SEND_METRICS,'false');
 assert.equal(e.PATH,'/usr/bin');
 for(const name of ['GITHUB_TOKEN','ASSETS_STAGING_GITHUB_READ_TOKEN','SESSION_SECRET','NODE_OPTIONS'])
  assert.equal(e[name],undefined);
 assert.throws(()=>minimalWranglerEnvironment(''));
});
