import test from 'node:test';
import assert from 'node:assert/strict';
import {makeVersionOnlySourcePlan} from '../scripts/corporate-assets-next-version-source-plan.mjs';
import {ROLLBACK,DB} from '../scripts/corporate-assets-v3-predeployment-attestation.mjs';
const sha='a'.repeat(40),old='b'.repeat(40);
const text=(name,value)=>({name,type:'plain_text',text:value});
const args=()=>({
 reviewedMainSha:sha,
 sourceManifest:{reviewedCommit:sha,manifestDigest:'c'.repeat(64),cloudflareArtifactVerified:false,deploymentAuthorized:false},
 existingSettings:{bindings:[
  text('APP_ENV','staging'),text('DEPLOYMENT_PROFILE','corporate-assets-isolated'),
  text('THEBE_CORPORATE_ASSETS_ENABLED','false'),text('ASSETS_STAGING_WRITES_ENABLED','false'),
  text('ASSETS_STAGING_SOURCE_SHA',old),text('ASSETS_STAGING_D1_ID',DB),
  {name:'DB',type:'d1',database_id:DB},
  {name:'SESSION_SECRET',type:'secret_text'},{name:'AUDIT_INTEGRITY_SECRET',type:'secret_text'}
 ]},
 activeDeployment:{versions:[{version_id:ROLLBACK,percentage:100}]},
 environmentProtected:true
});
test('pure plan refuses to authorize a version upload or deployment',()=>{
 const plan=makeVersionOnlySourcePlan(args());
 assert.equal(plan.newWorkerVersionId,null);
 assert.equal(plan.provenanceVerified,false);
 assert.equal(plan.versionCreationAuthorized,false);
 assert.equal(plan.deploymentAuthorized,false);
 assert.equal(plan.credentialsPreservationVerified,false);
 assert.equal(plan.reviewedMainSha,sha);
 assert.equal(plan.remainingGates.length,5);
});
test('rejects stale SHA or forged artifact verified flag',()=>{
 for(const mutate of [
  a=>a.reviewedMainSha='d'.repeat(40),
  a=>a.sourceManifest.manifestDigest='notsha256',
  a=>a.sourceManifest.cloudflareArtifactVerified=true,
  a=>a.sourceManifest.deploymentAuthorized=true
 ]){
  const a=args();mutate(a);
  assert.throws(()=>makeVersionOnlySourcePlan(a),/verified_checkout_input_manifest_required/);
 }
});
test('protects independent environment and 100 percent rollback',()=>{
 const a=args();a.environmentProtected=false;
 assert.throws(()=>makeVersionOnlySourcePlan(a),/protected_environment_required/);
 const b=args();b.activeDeployment.versions[0].percentage=99;
 assert.throws(()=>makeVersionOnlySourcePlan(b),/v2_100_percent_rollback_required/);
});
test('rejects production database and staging write enablement',()=>{
 const a=args();a.existingSettings.bindings.find(x=>x.name==='DB').database_id='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
 assert.throws(()=>makeVersionOnlySourcePlan(a),/isolated_d1_required/);
 const b=args();b.existingSettings.bindings.find(x=>x.name==='ASSETS_STAGING_WRITES_ENABLED').text='true';
 assert.throws(()=>makeVersionOnlySourcePlan(b),/staging_hold_required/);
});
test('rejects missing or non-secret existing credential bindings',()=>{
 const a=args();a.existingSettings.bindings.find(x=>x.name==='SESSION_SECRET').type='plain_text';
 assert.throws(()=>makeVersionOnlySourcePlan(a),/existing_secret_text_bindings_must_be_preserved/);
 const b=args();b.existingSettings.bindings=b.existingSettings.bindings.filter(x=>x.name!=='AUDIT_INTEGRITY_SECRET');
 assert.throws(()=>makeVersionOnlySourcePlan(b));
});
test('does not depend on legacy candidate source marker falsely matching main',()=>{
 const p=makeVersionOnlySourcePlan(args());
 assert.equal(p.legacyCandidate,'983daaea-1e6b-4359-9994-0b792578008b');
 assert.equal(p.provenanceVerified,false);
});
