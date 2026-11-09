/** Pure, fail-closed staging version-only upload plan.
 * This module NEVER uploads, creates versions, rotates secrets or deploys.
 * It rejects an unsafe provenance transition. All cloud mutations require
 * a separate reviewed, protected workflow and a new explicit authorization.
 */
import {pathToFileURL} from 'node:url';
import {renderCorporateAssetsStagingConfig} from './render-corporate-assets-staging-config.mjs';
import {assertStagingHold} from './corporate-assets-protected-secret-candidate.mjs';
import {ACCOUNT,WORKER,DB,ROLLBACK,CANDIDATE} from './corporate-assets-v3-predeployment-attestation.mjs';
const SHA=/^[0-9a-f]{40}$/;
const HEX=/^[0-9a-f]{64}$/;
export function makeVersionOnlySourcePlan({reviewedMainSha,sourceManifest,existingSettings,activeDeployment,environmentProtected=false}={}){
 if(!SHA.test(reviewedMainSha||'')||sourceManifest?.reviewedCommit!==reviewedMainSha||
  !HEX.test(sourceManifest?.manifestDigest||'')||sourceManifest?.cloudflareArtifactVerified!==false||
  sourceManifest?.deploymentAuthorized!==false)throw Error('verified_checkout_input_manifest_required');
 if(environmentProtected!==true)throw Error('protected_environment_required');
 const oldSource=(existingSettings?.bindings||[]).find(x=>x.name==='ASSETS_STAGING_SOURCE_SHA');
 if(!SHA.test(oldSource?.text||''))throw Error('existing_source_marker_required');
 assertStagingHold(existingSettings.bindings,oldSource.text);
 const secrets=existingSettings.bindings.filter(x=>['SESSION_SECRET','AUDIT_INTEGRITY_SECRET'].includes(x.name));
 if(secrets.length!==2||secrets.some(x=>x.type!=='secret_text'))throw Error('existing_secret_text_bindings_must_be_preserved');
 if(activeDeployment?.versions?.length!==1||activeDeployment.versions[0]?.version_id!==ROLLBACK||
  activeDeployment.versions[0]?.percentage!==100)throw Error('v2_100_percent_rollback_required');
 const config=renderCorporateAssetsStagingConfig({
  ASSETS_STAGING_SOURCE_SHA:reviewedMainSha,
  ASSETS_STAGING_D1_ID:DB,
  PRODUCTION_D1_DATABASE_ID:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce'
 });
 if(config.workers_dev!==false||config.preview_urls!==false||config.routes.length||config.keep_vars!==false)
  throw Error('no_public_route_or_retained_vars_required');
 return Object.freeze({
  schema:'thebe.assets.version-only-source-plan.v1',account:ACCOUNT,worker:WORKER,
  reviewedMainSha,sourceInputDigest:sourceManifest.manifestDigest,
  rollback:ROLLBACK,legacyCandidate:CANDIDATE,
  isolatedDatabase:DB,stagingStatus:'inert',versionUploadMethod:'wrangler versions upload',
  newWorkerVersionId:null,cloudflareArtifactDigest:null,
  provenanceVerified:false,credentialsPreservationVerified:false,
  versionCreationAuthorized:false,deploymentAuthorized:false,
  remainingGates:Object.freeze([
   'independently_review_exact_build_and_upload_implementation',
   'verify_secret_text_bindings_survive_version_upload',
   'independently_verify_uploaded_script_against_build_artifact',
   'verify_no_new_public_routes_or_preview_urls',
   'require_separate_version_creation_and_deployment_approvals'
  ])
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 console.error('offline_version_plan_requires_verified_protected_metadata_no_side_effects');
 process.exitCode=1;
}
