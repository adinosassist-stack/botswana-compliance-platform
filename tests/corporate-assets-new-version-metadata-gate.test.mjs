import test from 'node:test';
import assert from 'node:assert/strict';
import {checkFutureVersionMetadata} from '../scripts/corporate-assets-new-version-metadata-gate.mjs';
import {DB,ROLLBACK,CANDIDATE} from '../scripts/corporate-assets-v3-predeployment-attestation.mjs';
const sha='a'.repeat(40),v4='11111111-2222-4333-8444-555555555555';
const pt=(name,text)=>({name,type:'plain_text',text});
const cfg=()=>({
 reviewedSha:sha,
 version:{id:v4,number:4,resources:{script:{etag:'c'.repeat(64)},bindings:[
 pt('APP_ENV','staging'),pt('DEPLOYMENT_PROFILE','corporate-assets-isolated'),
 pt('ASSETS_STAGING_WRITES_ENABLED','false'),pt('THEBE_CORPORATE_ASSETS_ENABLED','false'),
 pt('ASSETS_STAGING_D1_ID',DB),pt('ASSETS_STAGING_SOURCE_SHA',sha),
 pt('PAYMENT_PROVIDER','none'),pt('REGISTRATION_MODE','hold'),
 ...['EVIDENCE_UPLOADS_ENABLED','POP_UPLOAD_STAGING_ENABLED','THEBE_AI_EXPORTS_ENABLED',
 'THEBE_GENERAL_AI_ENABLED','THEBE_INTERNAL_AUTONOMY_ENABLED','THEBE_LIVE_VOICE_ENABLED'].map(n=>pt(n,'false')),
 {name:'DB',type:'d1',database_id:DB},
 {name:'SESSION_SECRET',type:'secret_text'},{name:'AUDIT_INTEGRITY_SECRET',type:'secret_text'}
 ]}},
 deployments:{deployments:[{id:'dep',created_on:'2026-11-08T08:00:00Z',
  versions:[{version_id:ROLLBACK,percentage:100}]}],result_info:{page:1,total_pages:1,count:1}},
 domains:[],workerRoutes:[],subdomain:{enabled:false,previews_enabled:false},
 scriptDigest:{algorithm:'sha256',value:'d'.repeat(64)}
});
test('clean metadata is NOT uploaded source evidence or deploy authorization',()=>{
 const r=checkFutureVersionMetadata(cfg());
 assert.equal(r.metadataIsolated,true);
 assert.equal(r.uploadedCompiledBytesVerified,false);
 assert.equal(r.independentSourceProvenanceVerified,false);
 assert.equal(r.credentialValueContinuityVerified,false);
 assert.equal(r.deploymentAuthorized,false);
});
test('reject existing v3 and rollback v2 as a new candidate',()=>{
 for(const id of [ROLLBACK,CANDIDATE]){
  const c=cfg();c.version.id=id;
  assert.ok(checkFutureVersionMetadata(c).errors.includes('fresh_version_required'));
 }
});
test('reject wrong SHA, source binding or script etag',()=>{
 for(const change of [
  c=>c.reviewedSha='b'.repeat(40),
  c=>c.version.resources.bindings.find(x=>x.name==='ASSETS_STAGING_SOURCE_SHA').text='b'.repeat(40),
  c=>c.version.resources.script.etag='invalid'
 ]){
  const c=cfg();change(c);assert.equal(checkFutureVersionMetadata(c).metadataIsolated,false);
 }
});
test('reject production database and staging write flag',()=>{
 const a=cfg();a.version.resources.bindings.find(x=>x.name==='DB').database_id='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
 assert.equal(checkFutureVersionMetadata(a).metadataIsolated,false);
 const b=cfg();b.version.resources.bindings.find(x=>x.name==='ASSETS_STAGING_WRITES_ENABLED').text='true';
 assert.equal(checkFutureVersionMetadata(b).metadataIsolated,false);
});
test('reject public routes, domains and preview URLs even if rest is correct',()=>{
 for(const mutate of [
  c=>c.domains.push({script:'bw-corporate-assets-staging'}),
  c=>c.workerRoutes.push({script:'bw-corporate-assets-staging'}),
  c=>c.subdomain.previews_enabled=true,c=>c.subdomain.enabled=true,
  c=>c.domains=null,c=>c.workerRoutes=null
 ]){
  const c=cfg();mutate(c);assert.equal(checkFutureVersionMetadata(c).metadataIsolated,false);
 }
});
test('reject incomplete deployments, traffic movement and candidate deployment',()=>{
 for(const mutate of [
  c=>c.deployments.result_info.total_pages=2,
  c=>c.deployments.deployments[0].versions[0].percentage=99,
  c=>c.deployments.deployments[0].versions[0].version_id=v4,
  c=>c.deployments.deployments[0].created_on='invalid',
  c=>c.deployments.result_info.count=2
 ]){
  const c=cfg();mutate(c);assert.equal(checkFutureVersionMetadata(c).metadataIsolated,false);
 }
});
test('reject weakened secret types and newly enabled high risk services',()=>{
 for(const mutate of [
  c=>c.version.resources.bindings.find(x=>x.name==='SESSION_SECRET').type='plain_text',
  c=>c.version.resources.bindings.find(x=>x.name==='PAYMENT_PROVIDER').text='dpo',
  c=>c.version.resources.bindings.find(x=>x.name==='THEBE_LIVE_VOICE_ENABLED').text='true',
  c=>c.version.resources.bindings.push(pt('ASSETS_STAGING_WRITES_ENABLED','false'))
 ]){
  const c=cfg();mutate(c);assert.equal(checkFutureVersionMetadata(c).metadataIsolated,false);
 }
});
test('supplied upload proof cannot override lack of authenticated byte linkage',()=>{
 const c=cfg();c.independentUploadProof={verified:true,sha256:'d'.repeat(64)};
 const r=checkFutureVersionMetadata(c);
 assert.equal(r.metadataIsolated,true);
 assert.equal(r.uploadedCompiledBytesVerified,false);
 assert.equal(r.deploymentAuthorized,false);
});
