/** Corporate Assets v4: pure, read-only credential candidate evidence.
 * This cannot mutate Cloudflare, attest compiled upload bytes or authorize deployment.
 * Secret values and mutable latest settings are deliberately NOT inputs.
 */
import {pathToFileURL} from 'node:url';
import {checkAssetStagingBindingMetadata} from './corporate-assets-staging-binding-preflight.mjs';
import {DB,WORKER,ROLLBACK,CANDIDATE} from './corporate-assets-v3-predeployment-attestation.mjs';

export const SECRET_CANDIDATE_V4='dc708a58-4da1-4af5-a10a-17ace5ea25fa';
export const LEGACY_SOURCE_SHA='062ef3ea4c598d38a56e15dba1691c30aa4e5c72';
const V1='94d2b523-b36c-4d3e-935f-1606f1e78f0f';
const SHA=/^[0-9a-f]{40}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const falseFlags=[
 'ASSETS_STAGING_WRITES_ENABLED','THEBE_CORPORATE_ASSETS_ENABLED',
 'EVIDENCE_UPLOADS_ENABLED','POP_UPLOAD_STAGING_ENABLED','THEBE_AI_EXPORTS_ENABLED',
 'THEBE_GENERAL_AI_ENABLED','THEBE_INTERNAL_AUTONOMY_ENABLED','THEBE_LIVE_VOICE_ENABLED'
];
const binding=(list,name)=>Array.isArray(list)?list.filter(x=>x?.name===name):[];
const plain=(list,name)=>{const b=binding(list,name);return b.length===1&&b[0].type==='plain_text'?b[0].text:null};
const fullPage=(items,info)=>Array.isArray(items)&&info?.page===1&&info?.count===items.length&&
 info?.total_count===items.length&&
 (info.total_pages===undefined||info.total_pages===1);
export function evaluateV4ReadOnlyQualification({reviewedMainSha,versionInventory,candidateVersion,
 activeVersion,deployments,privateExposure}={}){
 const errors=[],blockers=[];
 if(!SHA.test(reviewedMainSha||''))errors.push('valid_reviewed_main_sha_required');
 const versions=versionInventory?.result?.items;
 if(!fullPage(versions,versionInventory?.result_info)||versions.length!==4)
  errors.push('complete_four_version_inventory_required');
 else {
  const ids=versions.map(v=>v?.id);
  if(ids.some(x=>!UUID.test(x||''))||new Set(ids).size!==4||
     ![V1,ROLLBACK,CANDIDATE,SECRET_CANDIDATE_V4].every(x=>ids.includes(x))||
     versions.find(x=>x.id===SECRET_CANDIDATE_V4)?.number!==4)
   errors.push('exact_v4_candidate_inventory_required');
 }
 const candidateBindings=candidateVersion?.resources?.bindings;
 if(candidateVersion?.id!==SECRET_CANDIDATE_V4||candidateVersion?.number!==4)
  errors.push('exact_undeployed_secret_candidate_required');
 const check=checkAssetStagingBindingMetadata(candidateBindings,{
  databaseId:DB,sourceSha:LEGACY_SOURCE_SHA
 });
 errors.push(...check.errors.map(e=>'v4_'+e));
 for(const flag of falseFlags)if(plain(candidateBindings,flag)!=='false')
  errors.push('v4_hold_required_'+flag);
 if(plain(candidateBindings,'PAYMENT_PROVIDER')!=='none'||
    plain(candidateBindings,'REGISTRATION_MODE')!=='hold')
  errors.push('v4_payment_registration_hold_required');
 const activeBindings=activeVersion?.resources?.bindings;
 if(activeVersion?.id!==ROLLBACK||!Array.isArray(activeBindings)||
    plain(activeBindings,'ASSETS_STAGING_SOURCE_SHA')!==LEGACY_SOURCE_SHA||
    plain(activeBindings,'ASSETS_STAGING_WRITES_ENABLED')!=='false'||
    plain(activeBindings,'THEBE_CORPORATE_ASSETS_ENABLED')!=='false'||
    binding(activeBindings,'DB').length!==1||
    binding(activeBindings,'DB')[0]?.database_id!==DB)
  errors.push('known_active_v2_isolation_required');
 const activeCredentialTypes=['SESSION_SECRET','AUDIT_INTEGRITY_SECRET'].map(n=>{
  const b=binding(activeBindings,n);
  return b.length===1?b[0]?.type:null;
 });
 const activeCredentialsSafe=activeCredentialTypes.every(t=>t==='secret_text');
 const records=deployments?.result?.deployments;
 const di=deployments?.result_info;
 if(!fullPage(records,di)||records.length===0)
  errors.push('complete_deployments_required');
 else {
  const times=records.map(x=>Date.parse(x?.created_on||''));
  const deploymentIds=records.map(x=>x?.id);
  if(times.some(t=>!Number.isFinite(t))||
     deploymentIds.some(id=>!UUID.test(id||''))||
     new Set(times).size!==times.length||new Set(deploymentIds).size!==records.length)
   errors.push('unambiguous_deployment_inventory_required');
  else {
   const latest=records[times.indexOf(Math.max(...times))];
   if(latest?.versions?.length!==1||latest.versions[0]?.version_id!==ROLLBACK||
      latest.versions[0]?.percentage!==100)
    errors.push('active_v2_100_percent_required');
  }
  if(records.some(d=>d?.versions?.some(v=>v?.version_id===SECRET_CANDIDATE_V4)))
   errors.push('candidate_v4_must_remain_undeployed');
 }
 if(privateExposure?.worker!==WORKER||
    privateExposure?.privateExposureVerified!==true||
    privateExposure?.deploymentAuthorized!==false||
    !Array.isArray(privateExposure?.errors)||privateExposure.errors.length)
  errors.push('account_wide_private_exposure_required');
 if(plain(candidateBindings,'ASSETS_STAGING_SOURCE_SHA')!==reviewedMainSha)
  blockers.push('candidate_v4_source_marker_not_current_main');
 // No value comparison is possible from binding types. A secret rotation
 // intentionally replaces credential bytes. This is NOT a continuity proof.
 if(!activeCredentialsSafe)blockers.push('active_v2_credential_binding_type_unsafe');
 blockers.push('independent_uploaded_source_bytes_proof_required');
 blockers.push('credential_rotation_acceptance_required');
 blockers.push('separate_owner_and_thusico_staging_deployment_approval_required');
 return Object.freeze({
  schema:'thebe.assets.v4-readonly-qualification.v1',
  candidateVersionId:SECRET_CANDIDATE_V4,reviewedMainSha:SHA.test(reviewedMainSha||'')?reviewedMainSha:null,
  candidateHistoricalSourceSha:LEGACY_SOURCE_SHA,
  candidateMetadataVerified:errors.length===0,
  privateExposureVerified:privateExposure?.privateExposureVerified===true,
  candidateBindingTypesSafe:check.ready&&falseFlags.every(n=>plain(candidateBindings,n)==='false'),
  activeCredentialRisk:!activeCredentialsSafe,
  candidateUndeployed:!errors.includes('candidate_v4_must_remain_undeployed')&&
   !errors.includes('complete_deployments_required')&&
   !errors.includes('unambiguous_deployment_inventory_required')&&
   !errors.includes('active_v2_100_percent_required'),
  credentialValuesVerified:false,uploadedSourceBytesVerified:false,
  exactSourceProvenanceVerified:false,stagingDeploymentAuthorized:false,
  productionChanged:false,errors:Object.freeze([...new Set(errors)]),
  blockers:Object.freeze([...new Set(blockers)])
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 console.error('read_only_v4_qualification_requires_independently_authenticated_metadata_no_side_effects');
 process.exitCode=1;
}
