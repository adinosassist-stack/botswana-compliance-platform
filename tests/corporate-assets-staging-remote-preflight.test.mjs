import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyCorporateAssetsRemoteMetadata} from '../scripts/corporate-assets-staging-remote-preflight.mjs';
const sha='a'.repeat(40), id='e19f09de-3bb9-4021-b4f8-44df04c8aaa8';
const varBinding=(name,text)=>({name,type:'plain_text',text});
const bindings=[
 varBinding('APP_ENV','staging'),varBinding('DEPLOYMENT_PROFILE','corporate-assets-isolated'),
 varBinding('ASSETS_STAGING_D1_ID',id),varBinding('ASSETS_STAGING_SOURCE_SHA',sha),
 varBinding('THEBE_CORPORATE_ASSETS_ENABLED','false'),varBinding('ASSETS_STAGING_WRITES_ENABLED','false'),
 {name:'DB',type:'d1',id},
 {name:'SESSION_SECRET',type:'secret_text'},{name:'AUDIT_INTEGRITY_SECRET',type:'secret_text'}
];
function mock(payload, status=200){return async (_url,opts)=>{
 assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');
 return {ok:status===200,status,json:async()=>payload};
}}
test('read-only attestation emits no binding text or credentials',async()=>{
 const result=await verifyCorporateAssetsRemoteMetadata({token:'synthetic-api-token',sourceSha:sha,request:mock({success:true,result:{bindings}})});
 assert.equal(result.ready,true);assert.deepEqual(result.errors,[]);
 assert.equal(JSON.stringify(result).includes('synthetic-api-token'),false);
 assert.equal(JSON.stringify(result).includes('secret_text'),false);
});
test('live legacy plaintext secrets fail closed and values cannot escape receipt',async()=>{
 const bad=bindings.map(b=>b.name==='SESSION_SECRET'||b.name==='AUDIT_INTEGRITY_SECRET'?{name:b.name,type:'plain_text',text:'sensitive-synthetic-test-only'}:b);
 const receipt=await verifyCorporateAssetsRemoteMetadata({token:'synthetic',sourceSha:sha,request:mock({success:true,result:{bindings:bad}})});
 assert.equal(receipt.ready,false);
 assert.equal(receipt.errors.length,2);
 assert.equal(JSON.stringify(receipt).includes('sensitive-synthetic-test-only'),false);
});
test('mismatched SHA or disabled safeguards reject remote acceptance',async()=>{
 const bad=bindings.map(b=>b.name==='ASSETS_STAGING_WRITES_ENABLED'?{...b,text:'true'}:b);
 assert.equal((await verifyCorporateAssetsRemoteMetadata({token:'synthetic',sourceSha:sha,request:mock({success:true,result:{bindings:bad}})})).ready,false);
 assert.equal((await verifyCorporateAssetsRemoteMetadata({token:'synthetic',sourceSha:'b'.repeat(40),request:mock({success:true,result:{bindings}})})).ready,false);
 await assert.rejects(verifyCorporateAssetsRemoteMetadata({token:'synthetic',sourceSha:'bad',request:mock({success:true,result:{bindings}})}),/exact_reviewed_sha_required/);
 await assert.rejects(verifyCorporateAssetsRemoteMetadata({token:'',sourceSha:sha,request:mock({success:true,result:{bindings}})}),/dedicated_staging_read_token_required/);
 await assert.rejects(verifyCorporateAssetsRemoteMetadata({token:'synthetic',sourceSha:sha,request:mock({success:false},403)}),/staging_metadata_read_failed_403/);
});
