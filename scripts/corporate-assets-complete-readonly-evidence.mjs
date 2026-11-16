/** Corporate Assets complete read-only evidence cross-check.
 * Separately authenticates GitHub/main preflight and account-wide exposure.
 * Cannot create Worker versions, deploy or assert uploaded byte provenance.
 */
import {pathToFileURL} from 'node:url';
import {inspectProtectedProvenance} from './corporate-assets-protected-provenance-preflight.mjs';
import {inspectAssetStagingExposure,safeReadOnlyDiagnostic} from './corporate-assets-v3-private-exposure-attestation.mjs';
import {inspectActiveAssetCredentialTypes} from './corporate-assets-active-credential-types.mjs';
const SHA=/^[a-f0-9]{40}$/;
const HEX=/^[a-f0-9]{64}$/;
const V3='983daaea-1e6b-4359-9994-0b792578008b';
const V2='5497120e-4ae6-4665-b96f-4b040d32a249';
export function checkFullReadOnlyEvidence({expectedMainSha,preflight,exposure,activeCredentials}={}){
 const errors=[];
 if(!SHA.test(expectedMainSha||'')||preflight?.mainSha!==expectedMainSha)errors.push('exact_main_context_required');
 if(!HEX.test(preflight?.inputManifestDigest||''))errors.push('source_input_manifest_required');
 if(preflight?.existingCandidate!==V3||preflight?.rollback!==V2)errors.push('known_candidate_and_rollback_required');
 if(preflight?.exactSourceUploadVerified!==false||preflight?.uploadAuthorized!==false||
  preflight?.deploymentAuthorized!==false)errors.push('unsafe_source_or_release_claim');
 if(!Array.isArray(preflight?.oldCandidateErrors)||
  !preflight.oldCandidateErrors.includes('source_sha_mismatch')||
  !preflight.oldCandidateErrors.includes('independent_bundle_provenance_verifier_required'))
  errors.push('legacy_source_mismatch_unacknowledged');
 if(exposure?.worker!=='bw-corporate-assets-staging'||exposure?.candidate!==V3||
  exposure?.privateExposureVerified!==true||exposure?.deploymentAuthorized!==false||
  exposure?.sourceProvenanceVerified!==false||!Array.isArray(exposure?.errors)||
  exposure.errors.length)errors.push('independent_private_exposure_not_verified');
 if(activeCredentials?.immutableCredentialTypesVerified!==true||activeCredentials?.activeCredentialRisk!==false||
  activeCredentials?.deploymentAuthorized!==false||activeCredentials?.createVersionAuthorized!==false||
  !Array.isArray(activeCredentials?.errors)||activeCredentials.errors.length)errors.push('active_version_credential_safety_not_verified');
 return Object.freeze({schema:'thebe.assets.complete-readonly-evidence.v1',
  reviewedMainSha:SHA.test(expectedMainSha||'')?expectedMainSha:null,
  inputManifestDigest:HEX.test(preflight?.inputManifestDigest||'')?preflight.inputManifestDigest:null,
  privateExposureVerified:exposure?.privateExposureVerified===true,
  activeVersionCredentialSafetyVerified:activeCredentials?.immutableCredentialTypesVerified===true,
  legacyCandidateBlocked:true,authenticatedUploadedArtifactVerified:false,
  exactSourceUploadVerified:false,credentialContinuityVerified:false,
  createVersionAuthorized:false,deploymentAuthorized:false,
  errors:Object.freeze(errors)});
}
export async function inspectFullReadOnlyEvidence({expectedMainSha,githubToken,cloudflareToken,cloudflareAccountToken,
 repository,ref,githubSha,readPreflight=inspectProtectedProvenance,readExposure=inspectAssetStagingExposure,
 readActiveCredentials=inspectActiveAssetCredentialTypes}={}){
 if(!SHA.test(expectedMainSha||'')||githubSha!==expectedMainSha||
  repository!=='adinosassist-stack/botswana-compliance-platform'||ref!=='refs/heads/main')
  throw Error('protected_main_context_required');
 if(!githubToken||!cloudflareToken||!cloudflareAccountToken)throw Error('protected_read_credentials_required');
 // Preflight verifies LIVE GitHub main and protected environment policy.
 const preflight=await readPreflight({expectedSha:expectedMainSha,repository,ref,githubSha,
  githubToken,cloudflareToken});
 const exposure=await readExposure({token:cloudflareToken,accountToken:cloudflareAccountToken});
 const activeCredentials=await readActiveCredentials({token:cloudflareToken});
 const result=checkFullReadOnlyEvidence({expectedMainSha,preflight,exposure,activeCredentials});
 if(result.errors.length)throw Error('read_only_evidence_failed:'+result.errors.join(','));
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  console.log(JSON.stringify(await inspectFullReadOnlyEvidence({
   expectedMainSha:process.env.EXPECTED_MAIN_SHA,
   githubToken:process.env.ASSETS_STAGING_GITHUB_READ_TOKEN,
   cloudflareToken:process.env.ASSETS_STAGING_CLOUDFLARE_TOKEN,
   cloudflareAccountToken:process.env.ASSETS_STAGING_CLOUDFLARE_ACCOUNT_READ_TOKEN,
   repository:process.env.GITHUB_REPOSITORY,ref:process.env.GITHUB_REF,
   githubSha:process.env.GITHUB_SHA
  })));
 }catch(e){console.error(safeReadOnlyDiagnostic(e));process.exitCode=1}
}
