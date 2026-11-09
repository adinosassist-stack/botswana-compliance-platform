/** Read-only, fail-closed release qualification for Corporate Assets staging v3.
 * A success is only a metadata receipt; this script CANNOT deploy or enable writes.
 * No token or secret values are returned or logged.
 */
import {pathToFileURL} from 'node:url';
import {checkAssetStagingBindingMetadata} from './corporate-assets-staging-binding-preflight.mjs';
export const ACCOUNT='ddd23cab31928a4bb3d4998df9b26d1d';
export const WORKER='bw-corporate-assets-staging';
export const DB='e19f09de-3bb9-4021-b4f8-44df04c8aaa8';
export const CANDIDATE='983daaea-1e6b-4359-9994-0b792578008b';
export const ROLLBACK='5497120e-4ae6-4665-b96f-4b040d32a249';
const SHA=/^[0-9a-f]{40}$/;
const fail=(errors,condition,code)=>{if(!condition)errors.push(code)};
export function qualifyAssetV3({candidate,deployments,reviewedMainSha}={}){
 const errors=[];
 fail(errors,SHA.test(reviewedMainSha||''),'invalid_reviewed_main_sha');
 fail(errors,candidate?.id===CANDIDATE&&candidate?.number===3,'candidate_identity_mismatch');
 const bindings=candidate?.resources?.bindings;
 const bound=checkAssetStagingBindingMetadata(bindings,{databaseId:DB,sourceSha:reviewedMainSha});
 errors.push(...bound.errors);
 const val=name=>Array.isArray(bindings)?bindings.filter(b=>b?.name===name&&b.type==='plain_text').map(b=>b.text):[];
 for(const name of ['EVIDENCE_UPLOADS_ENABLED','POP_UPLOAD_STAGING_ENABLED','THEBE_AI_EXPORTS_ENABLED','THEBE_GENERAL_AI_ENABLED','THEBE_INTERNAL_AUTONOMY_ENABLED','THEBE_LIVE_VOICE_ENABLED']){
  fail(errors,val(name).length===1&&val(name)[0]==='false',name+'_must_remain_disabled');
 }
 fail(errors,val('PAYMENT_PROVIDER').length===1&&val('PAYMENT_PROVIDER')[0]==='none','payment_provider_must_be_none');
 fail(errors,val('REGISTRATION_MODE').length===1&&val('REGISTRATION_MODE')[0]==='hold','registration_hold_required');
 const entries=deployments?.deployments;
 const page=deployments?.result_info;
 // No authoritative assertion from a partial listing or unparseable timestamps.
 fail(errors,Number.isSafeInteger(page?.total_pages)&&page.total_pages===1&&
  page.page===1&&Array.isArray(entries)&&page.count===entries.length,'complete_deployment_listing_required');
 const dates=Array.isArray(entries)?entries.map(d=>Date.parse(d?.created_on||'')):[];
 fail(errors,dates.length>0&&dates.every(Number.isFinite)&&new Set(dates).size===dates.length,
  'deployment_timestamps_required');
 const newest=dates.length&&dates.every(Number.isFinite)?
  entries[dates.indexOf(Math.max(...dates))]:null;
 fail(errors,!!newest?.id&&Array.isArray(newest?.versions)&&newest.versions.length===1&&
  newest.versions[0]?.version_id===ROLLBACK&&newest.versions[0]?.percentage===100,
  'rollback_version_must_serve_all_traffic');
 fail(errors,Array.isArray(entries)&&!entries.some(d=>(d?.versions||[]).some(v=>v.version_id===CANDIDATE)),
  'candidate_must_remain_undeployed');
 // This read-only tool does NOT have an authenticated artifact provenance verifier
 // or a release-authoritative exposure verifier. Never trust caller-supplied booleans.
 // It is intentionally incapable of issuing a final release-ready receipt.
 errors.push('independent_bundle_provenance_verifier_required');
 errors.push('independent_private_exposure_verifier_required');
 return Object.freeze({ready:errors.length===0,worker:WORKER,candidate:CANDIDATE,rollback:ROLLBACK,
  reviewedMainSha:SHA.test(reviewedMainSha||'')?reviewedMainSha:null,errors:Object.freeze(errors)});
}
async function getJson(path,token,request){
 const res=await request('https://api.cloudflare.com/client/v4'+path,{method:'GET',headers:{authorization:'Bearer '+token,accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error('metadata_request_failed_'+res.status);
 const data=await res.json();
 if(data.success!==true||!data.result)throw Error('metadata_response_invalid');
 return data;
}
export async function inspectAssetV3({token,reviewedMainSha,request=fetch}={}){
 if(!token||!SHA.test(reviewedMainSha||''))throw Error('read_token_and_sha_required');
 const prefix='/accounts/'+ACCOUNT+'/workers/scripts/'+WORKER;
 const [candidateEnvelope,deploymentsEnvelope]=await Promise.all([
  getJson(prefix+'/versions/'+CANDIDATE,token,request),getJson(prefix+'/deployments',token,request)
 ]);
 return qualifyAssetV3({candidate:candidateEnvelope.result,deployments:{...deploymentsEnvelope.result,result_info:deploymentsEnvelope.result_info},reviewedMainSha});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const result=await inspectAssetV3({token:process.env.ASSETS_STAGING_CLOUDFLARE_READ_TOKEN,reviewedMainSha:process.env.EXPECTED_MAIN_SHA});
  console.log(JSON.stringify(result));
  if(!result.ready)process.exitCode=1;
 }catch(err){console.error(String(err.message).replace(/[^a-zA-Z0-9_]/g,'_'));process.exitCode=1;}
}
