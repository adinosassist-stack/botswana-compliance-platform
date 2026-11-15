/** GET-only metadata check for an undeployed Corporate Assets credential transition.
 * Identical Cloudflare script ETags are continuity evidence ONLY; they do not
 * prove reviewed GitHub bytes, secret-value continuity, or deployment safety.
 * No binding values for credentials are read into the receipt or logs.
 */
import {pathToFileURL} from 'node:url';
import {ACCOUNT,WORKER,assertOpaqueReadToken,inspectAssetStagingExposure}
 from './corporate-assets-v3-private-exposure-attestation.mjs';
import {DB,ROLLBACK,CANDIDATE} from './corporate-assets-v3-predeployment-attestation.mjs';
import {SECRET_CANDIDATE_V4,LEGACY_SOURCE_SHA}
 from './corporate-assets-v4-readonly-qualification.mjs';
const SHA=/^[a-f0-9]{40}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const CREDS=['SESSION_SECRET','AUDIT_INTEGRITY_SECRET'];
const FLAGS=['ASSETS_STAGING_WRITES_ENABLED','THEBE_CORPORATE_ASSETS_ENABLED',
 'EVIDENCE_UPLOADS_ENABLED','POP_UPLOAD_STAGING_ENABLED','THEBE_AI_EXPORTS_ENABLED',
 'THEBE_GENERAL_AI_ENABLED','THEBE_INTERNAL_AUTONOMY_ENABLED','THEBE_LIVE_VOICE_ENABLED'];
const fixedBinding=(v,n)=>{const found=v?.resources?.bindings?.filter(x=>x?.name===n);
 return Array.isArray(found)&&found.length===1?found[0]:null;};
const plain=(v,n)=>{const b=fixedBinding(v,n);return b?.type==='plain_text'?b.text:null;};
const credType=(v,n)=>fixedBinding(v,n)?.type||null;
const bundle=(v)=>v?.resources?.script?.etag||null;
export function assessV4CredentialTransition({reviewedMainSha,v2,v3,v4,deployments,privateExposure}={}){
 const errors=[];
 if(!SHA.test(reviewedMainSha||''))errors.push('valid_exact_main_context_required');
 const expected=[[v2,ROLLBACK,2],[v3,CANDIDATE,3],[v4,SECRET_CANDIDATE_V4,4]];
 for(const [v,id,num] of expected){
  if(v?.id!==id||v?.number!==num)errors.push('version_identity_invalid_'+num);
  if(!DIGEST.test(bundle(v)||''))errors.push('script_etag_invalid_'+num);
  if(plain(v,'ASSETS_STAGING_SOURCE_SHA')!==LEGACY_SOURCE_SHA)
   errors.push('historical_source_marker_invalid_'+num);
  if(fixedBinding(v,'DB')?.type!=='d1'||fixedBinding(v,'DB')?.database_id!==DB||
     plain(v,'ASSETS_STAGING_D1_ID')!==DB)
   errors.push('staging_d1_not_isolated_'+num);
  if(plain(v,'APP_ENV')!=='staging'||plain(v,'DEPLOYMENT_PROFILE')!=='corporate-assets-isolated')
   errors.push('isolated_environment_required_'+num);
  for(const n of FLAGS)if(plain(v,n)!=='false')errors.push('write_or_feature_hold_missing_'+num+'_'+n);
  if(plain(v,'PAYMENT_PROVIDER')!=='none'||plain(v,'REGISTRATION_MODE')!=='hold')
   errors.push('payment_registration_hold_invalid_'+num);
 }
 const matchingEtags=DIGEST.test(bundle(v2)||'')&&bundle(v2)===bundle(v3)&&bundle(v2)===bundle(v4);
 if(!matchingEtags)errors.push('cloudflare_script_etags_not_equal');
 for(const n of CREDS){
  if(credType(v2,n)!=='plain_text')errors.push('expected_legacy_active_binding_type_missing_'+n);
  if(credType(v3,n)!=='secret_text'||credType(v4,n)!=='secret_text')
   errors.push('candidate_secret_text_required_'+n);
 }
 const ds=deployments?.result?.deployments,info=deployments?.result_info;
 if(!Array.isArray(ds)||!ds.length||info?.page!==1||info.count!==ds.length||
   info.total_count!==ds.length||(info.total_pages!==undefined&&info.total_pages!==1))
  errors.push('complete_deployment_inventory_required');
 else{
  const ids=ds.map(d=>d?.id);
  const times=ds.map(d=>Date.parse(d?.created_on||''));
  if(ids.some(id=>!UUID.test(id||''))||new Set(ids).size!==ds.length||
     times.some(t=>!Number.isFinite(t))||new Set(times).size!==ds.length)
   errors.push('unambiguous_deployment_history_required');
  else{
   const current=ds[times.indexOf(Math.max(...times))];
   if(current.versions?.length!==1||current.versions[0]?.version_id!==ROLLBACK||
      current.versions[0]?.percentage!==100)
    errors.push('legacy_v2_must_remain_100_percent');
  }
  if(ds.some(d=>d?.versions?.some(x=>[CANDIDATE,SECRET_CANDIDATE_V4].includes(x.version_id))))
   errors.push('candidate_deployed_without_authorization');
 }
 if(privateExposure?.worker!==WORKER||privateExposure?.privateExposureVerified!==true||
    !Array.isArray(privateExposure?.errors)||privateExposure.errors.length||
    privateExposure?.deploymentAuthorized!==false)
  errors.push('private_exposure_not_independently_verified');
 const blockers=[
  'historical_v4_source_marker_not_current_main',
  'exact_github_source_to_uploaded_bytes_provenance_required',
  'new_staging_session_acceptance_and_reauthentication_required',
  'audit_integrity_rotation_and_rollback_acceptance_required',
  'functional_inert_staging_smoke_acceptance_required',
  'separate_owner_and_thusico_deployment_approval_required'
 ];
 if(SHA.test(reviewedMainSha||'')&&reviewedMainSha===LEGACY_SOURCE_SHA)
  blockers.splice(blockers.indexOf('historical_v4_source_marker_not_current_main'),1);
 return Object.freeze({
  schema:'thebe.assets.v4-credential-transition-readonly.v1',
  candidateVersionId:SECRET_CANDIDATE_V4,
  reviewedMainSha:SHA.test(reviewedMainSha||'')?reviewedMainSha:null,
  legacySourceMarker:LEGACY_SOURCE_SHA,
  cloudflareScriptEtagContinuityVerified:matchingEtags&&errors.length===0,
  candidateSecretBindingTypesVerified:errors.length===0,
  activeVersionStillUnsafe:true,
  candidateStillUndeployed:errors.length===0,
  privateStagingVerified:privateExposure?.privateExposureVerified===true&&errors.length===0,
  exactGitHubSourceBytesVerified:false,credentialValueContinuityVerified:false,
  sessionCompatibilityVerified:false,auditIntegrityContinuityVerified:false,
  functionalAcceptanceVerified:false,rollbackAcceptanceVerified:false,
  stagingDeploymentAuthorized:false,productionChanged:false,
  errors:Object.freeze([...new Set(errors)]),
  blockers:Object.freeze(blockers)
 });
}
export async function inspectV4CredentialTransition({expectedMainSha,repository,ref,githubSha,token,
 accountToken,request=fetch,readExposure=inspectAssetStagingExposure}={}){
 if(!SHA.test(expectedMainSha||'')||
    repository!=='adinosassist-stack/botswana-compliance-platform'||
    ref!=='refs/heads/main'||githubSha!==expectedMainSha)
  throw Error('exact_protected_main_context_required');
 assertOpaqueReadToken(token,'cloudflare');
 assertOpaqueReadToken(accountToken,'account_inventory');
 const prefix='/accounts/'+ACCOUNT+'/workers/scripts/'+WORKER;
 const get=async(path)=>{
  const res=await request('https://api.cloudflare.com/client/v4'+path,{
   method:'GET',headers:{authorization:'Bearer '+token,accept:'application/json'},
   redirect:'error',signal:AbortSignal.timeout(15000)
  });
  if(!res.ok)throw Error('worker_version_metadata_get_denied_'+res.status);
  const x=await res.json();
  if(x?.success!==true||x.result==null)throw Error('worker_version_metadata_invalid');
  return x;
 };
 const [v2,v3,v4,deployments,privateExposure]=await Promise.all([
  get(prefix+'/versions/'+ROLLBACK),get(prefix+'/versions/'+CANDIDATE),
  get(prefix+'/versions/'+SECRET_CANDIDATE_V4),
  get(prefix+'/deployments?page=1&per_page=100'),
  readExposure({token,accountToken,request})
 ]);
 const result=assessV4CredentialTransition({reviewedMainSha:expectedMainSha,
  v2:v2.result,v3:v3.result,v4:v4.result,deployments,privateExposure});
 if(result.errors.length)throw Error('v4_credential_transition_metadata_unqualified');
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 inspectV4CredentialTransition({expectedMainSha:process.env.EXPECTED_MAIN_SHA,
  repository:process.env.GITHUB_REPOSITORY,ref:process.env.GITHUB_REF,
  githubSha:process.env.GITHUB_SHA,
  token:process.env.ASSETS_STAGING_CLOUDFLARE_TOKEN,
  accountToken:process.env.ASSETS_STAGING_CLOUDFLARE_ACCOUNT_READ_TOKEN
 }).then(x=>console.log(JSON.stringify(x))).catch(()=>{
  console.error('assets_v4_transition_read_only_failed');process.exitCode=1;
 });
}
