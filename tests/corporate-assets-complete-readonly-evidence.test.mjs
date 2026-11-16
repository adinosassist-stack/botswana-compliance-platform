import test from 'node:test';
import assert from 'node:assert/strict';
import {checkFullReadOnlyEvidence,inspectFullReadOnlyEvidence} from '../scripts/corporate-assets-complete-readonly-evidence.mjs';
const sha='a'.repeat(40);
const preflight=()=>({mainSha:sha,inputManifestDigest:'b'.repeat(64),
 existingCandidate:'983daaea-1e6b-4359-9994-0b792578008b',
 rollback:'5497120e-4ae6-4665-b96f-4b040d32a249',
 oldCandidateErrors:['source_sha_mismatch','independent_bundle_provenance_verifier_required',
 'independent_private_exposure_verifier_required'],
 exactSourceUploadVerified:false,uploadAuthorized:false,deploymentAuthorized:false});
const exposure=()=>({worker:'bw-corporate-assets-staging',
 candidate:'983daaea-1e6b-4359-9994-0b792578008b',privateExposureVerified:true,
 deploymentAuthorized:false,sourceProvenanceVerified:false,errors:[]});
const activeCredentials=()=>({immutableCredentialTypesVerified:true,activeCredentialRisk:false,errors:[],createVersionAuthorized:false,deploymentAuthorized:false});
const args=()=>({expectedMainSha:sha,preflight:preflight(),exposure:exposure(),activeCredentials:activeCredentials()});
test('clean read-only evidence never unlocks v3 or claims artifact upload',()=>{
 const r=checkFullReadOnlyEvidence(args());
 assert.equal(r.privateExposureVerified,true);
 assert.equal(r.legacyCandidateBlocked,true);
 assert.equal(r.exactSourceUploadVerified,false);
 assert.equal(r.authenticatedUploadedArtifactVerified,false);
 assert.equal(r.createVersionAuthorized,false);
 assert.equal(r.deploymentAuthorized,false);
});
test('fail closed on stale main, missing input digest and swapped candidate',()=>{
 for(const mutate of [
  a=>a.expectedMainSha='c'.repeat(40),
  a=>a.preflight.mainSha='c'.repeat(40),
  a=>a.preflight.inputManifestDigest='invalid',
  a=>a.preflight.existingCandidate='11111111-2222-4333-8444-555555555555'
 ]){const a=args();mutate(a);assert.ok(checkFullReadOnlyEvidence(a).errors.length);}
});
test('rejects forged upload, version authorization and missing mismatch evidence',()=>{
 for(const mutate of [
  a=>a.preflight.exactSourceUploadVerified=true,
  a=>a.preflight.uploadAuthorized=true,
  a=>a.preflight.deploymentAuthorized=true,
  a=>a.preflight.oldCandidateErrors=[],
  a=>a.preflight.oldCandidateErrors=['source_sha_mismatch']
 ]){const a=args();mutate(a);assert.ok(checkFullReadOnlyEvidence(a).errors.length);}
});
test('reject incomplete or exposed zone inventory',()=>{
 for(const mutate of [
  a=>a.exposure.privateExposureVerified=false,
  a=>a.exposure.worker='other',
  a=>a.exposure.candidate='wrong',
  a=>a.exposure.errors=['worker_zone_route_attached'],
  a=>a.exposure.deploymentAuthorized=true,
  a=>a.exposure.sourceProvenanceVerified=true
 ]){const a=args();mutate(a);assert.ok(checkFullReadOnlyEvidence(a).errors.length);}
});
test('protected orchestration sequences both independently verified reads without mutation',async()=>{
 const calls=[];
 const info={expectedMainSha:sha,githubSha:sha,
  repository:'adinosassist-stack/botswana-compliance-platform',ref:'refs/heads/main',
  githubToken:'synthetic',cloudflareToken:'synthetic',cloudflareAccountToken:'synthetic-account'};
 const readPreflight=async a=>{calls.push('preflight');assert.equal(a.expectedSha,sha);return preflight()};
 const readExposure=async a=>{calls.push('exposure');assert.equal(a.token,'synthetic');assert.equal(a.accountToken,'synthetic-account');return exposure()};
 const readActiveCredentials=async a=>{calls.push('active-version');assert.equal(a.token,'synthetic');return activeCredentials()};
 const r=await inspectFullReadOnlyEvidence({...info,readPreflight,readExposure,readActiveCredentials});
 assert.deepEqual(calls,['preflight','exposure','active-version']);
 assert.equal(r.deploymentAuthorized,false);
});
test('wrong ref, missing tokens, forged exposure fail before any release',async()=>{
 const info={expectedMainSha:sha,githubSha:sha,
  repository:'adinosassist-stack/botswana-compliance-platform',ref:'refs/heads/main',
  githubToken:'synthetic',cloudflareToken:'synthetic',cloudflareAccountToken:'synthetic-account',
  readPreflight:async()=>preflight(),readExposure:async()=>exposure(),readActiveCredentials:async()=>activeCredentials()};
 await assert.rejects(inspectFullReadOnlyEvidence({...info,ref:'refs/heads/feature'}),/protected_main_context_required/);
 await assert.rejects(inspectFullReadOnlyEvidence({...info,githubToken:''}),/protected_read_credentials_required/);
 await assert.rejects(inspectFullReadOnlyEvidence({...info,cloudflareAccountToken:''}),/protected_read_credentials_required/);
 await assert.rejects(inspectFullReadOnlyEvidence({...info,
  readExposure:async()=>({...exposure(),privateExposureVerified:false})}),/read_only_evidence_failed/);
});

test('plaintext, missing or unverified immutable active credentials fail closed',()=>{
 for(const mutate of [
  a=>a.activeCredentials=undefined,
  a=>a.activeCredentials.immutableCredentialTypesVerified=false,
  a=>a.activeCredentials.activeCredentialRisk=true,
  a=>a.activeCredentials.errors=['active_version_secret_binding_type_unsafe'],
  a=>a.activeCredentials.deploymentAuthorized=true,
  a=>a.activeCredentials.createVersionAuthorized=true
 ]){
  const a=args();mutate(a);
  const result=checkFullReadOnlyEvidence(a);
  assert.equal(result.errors.includes('active_version_credential_safety_not_verified'),true);
  assert.equal(result.deploymentAuthorized,false);
 }
});
