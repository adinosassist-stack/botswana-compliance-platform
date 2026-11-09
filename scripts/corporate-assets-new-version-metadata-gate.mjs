/** Read-only new-version metadata challenge, NEVER an upload or release receipt.
 * Any success only establishes staging isolation metadata. Full upload provenance
 * and release authorization remain explicitly false.
 */
import {pathToFileURL} from 'node:url';
import {checkAssetStagingBindingMetadata} from './corporate-assets-staging-binding-preflight.mjs';
import {DB,ROLLBACK,CANDIDATE,WORKER} from './corporate-assets-v3-predeployment-attestation.mjs';
const SHA=/^[0-9a-f]{40}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX=/^[0-9a-f]{64}$/;
const requiredFalse=['EVIDENCE_UPLOADS_ENABLED','POP_UPLOAD_STAGING_ENABLED',
 'THEBE_AI_EXPORTS_ENABLED','THEBE_GENERAL_AI_ENABLED','THEBE_INTERNAL_AUTONOMY_ENABLED','THEBE_LIVE_VOICE_ENABLED'];
const pick=(bindings,name)=>{
 const matching=Array.isArray(bindings)?bindings.filter(x=>x?.name===name):[];
 return matching.length===1&&matching[0].type==='plain_text'?matching[0].text:null;
};
export function checkFutureVersionMetadata({version,reviewedSha,deployments,subdomain,
 domains,workerRoutes,scriptDigest,independentUploadProof}={}){
 const errors=[];
 if(!SHA.test(reviewedSha||''))errors.push('reviewed_sha_invalid');
 if(!UUID.test(version?.id||'')||[ROLLBACK,CANDIDATE].includes(version?.id)||
  !Number.isSafeInteger(version?.number)||version.number<4)errors.push('fresh_version_required');
 const bindings=version?.resources?.bindings;
 const attestation=checkAssetStagingBindingMetadata(bindings,{databaseId:DB,sourceSha:reviewedSha});
 errors.push(...attestation.errors);
 for(const name of requiredFalse)if(pick(bindings,name)!=='false')errors.push(name+'_must_stay_off');
 if(pick(bindings,'PAYMENT_PROVIDER')!=='none')errors.push('payments_must_stay_off');
 if(pick(bindings,'REGISTRATION_MODE')!=='hold')errors.push('registration_must_stay_held');
 const etag=version?.resources?.script?.etag;
 if(!HEX.test(etag||''))errors.push('cloudflare_script_etag_missing');
 // Cannot treat Cloudflare's opaque ETag as the actual SHA-256 compiled script.
 if(scriptDigest?.algorithm!=='sha256'||!HEX.test(scriptDigest?.value||''))
  errors.push('local_executable_digest_missing');
 if(!Array.isArray(domains)||domains.some(d=>d?.script===WORKER||d?.service===WORKER))
  errors.push('custom_domain_exposure_or_incomplete_listing');
 if(!Array.isArray(workerRoutes)||workerRoutes.some(r=>r?.script===WORKER))
  errors.push('worker_route_exposure_or_incomplete_listing');
 if(subdomain?.enabled!==false||subdomain?.previews_enabled!==false)
  errors.push('workers_dev_or_preview_exposure');
 const entries=deployments?.deployments;
 const info=deployments?.result_info;
 if(!Array.isArray(entries)||info?.page!==1||info?.total_pages!==1||
  info?.count!==entries?.length||!entries.length)errors.push('complete_deployment_listing_required');
 else {
  const times=entries.map(x=>Date.parse(x?.created_on||''));
  if(times.some(x=>!Number.isFinite(x))||new Set(times).size!==times.length)
   errors.push('unambiguous_deployment_timestamps_required');
  else {
   const latest=entries[times.indexOf(Math.max(...times))];
   if(latest?.versions?.length!==1||latest.versions[0]?.version_id!==ROLLBACK||
    latest.versions[0]?.percentage!==100)errors.push('deployed_v2_100_percent_required');
  }
  if(entries.some(x=>x?.versions?.some(y=>y?.version_id===version?.id)))
   errors.push('new_candidate_must_be_undeployed');
 }
 // A user-supplied upload flag, digest or Cloudflare ETag cannot prove source
 // provenance. Never trust independentUploadProof to grant a release.
 return Object.freeze({schema:'thebe.assets.new-version-metadata.v1',candidate:version?.id||null,
  reviewedSha:SHA.test(reviewedSha||'')?reviewedSha:null,
  metadataIsolated:errors.length===0,
  uploadedCompiledBytesVerified:false,independentSourceProvenanceVerified:false,
  credentialValueContinuityVerified:false,
  versionCreationAuthorized:false,deploymentAuthorized:false,
  errors:Object.freeze(errors)});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 console.error('requires_complete_independent_read_only_cloudflare_metadata');
 process.exitCode=1;
}
