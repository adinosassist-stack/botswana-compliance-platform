/** Corporate Assets: read-only Cloudflare Worker version bundle-lineage evidence.
 * Proves v3 script ETag continuity with deployed v2; does NOT prove GitHub source
 * reproducibility or authorize deployment. Never handles secret values.
 */
import {pathToFileURL} from 'node:url';
export const ACCOUNT='ddd23cab31928a4bb3d4998df9b26d1d';
export const WORKER='bw-corporate-assets-staging';
export const V2='5497120e-4ae6-4665-b96f-4b040d32a249';
export const V3='983daaea-1e6b-4359-9994-0b792578008b';
const SHA=/^[a-f0-9]{40}$/;
const HEX=/^[a-f0-9]{64}$/;
const fixedBinding=(v,name)=> {
 const found=v?.resources?.bindings?.filter(b=>b?.name===name)||[];
 return found.length===1&&found[0].type==='plain_text'?found[0].text:null;
};
export function checkWorkerBundleLineage({v2,v3,reviewedMainSha}={}){
 const errors=[];
 if(v2?.id!==V2||v2?.number!==2||v3?.id!==V3||v3?.number!==3)errors.push('version_identity_mismatch');
 const a=v2?.resources?.script?.etag,b=v3?.resources?.script?.etag;
 if(!HEX.test(a||'')||!HEX.test(b||'')||a!==b)errors.push('worker_script_etag_mismatch');
 const sha2=fixedBinding(v2,'ASSETS_STAGING_SOURCE_SHA'),sha3=fixedBinding(v3,'ASSETS_STAGING_SOURCE_SHA');
 if(!SHA.test(sha2||'')||sha2!==sha3)errors.push('worker_source_marker_changed');
 if(!SHA.test(reviewedMainSha||''))errors.push('reviewed_main_sha_invalid');
 if(sha3!==reviewedMainSha)errors.push('exact_current_main_provenance_unproven');
 // Matching Cloudflare ETags establish code continuity between versions,
 // NOT cryptographic GitHub tree-to-upload linkage. Never auto-release.
 return Object.freeze({continuityVerified:errors.length===1&&errors[0]==='exact_current_main_provenance_unproven',
  candidate:V3,rollback:V2,scriptEtagEqual:HEX.test(a||'')&&a===b,
  sourceMarkerMatchesReviewedMain:SHA.test(reviewedMainSha||'')&&sha3===reviewedMainSha,
  independentSourceBundleProvenanceVerified:false,
  deploymentAuthorized:false,errors:Object.freeze(errors)});
}
export async function inspectWorkerBundleLineage({token,reviewedMainSha,request=fetch}={}){
 if(typeof token!=='string'||!token.trim()||!SHA.test(reviewedMainSha||''))throw Error('read_token_and_main_sha_required');
 const read=async id=>{
  const res=await request('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/workers/scripts/'+WORKER+'/versions/'+id,
   {method:'GET',headers:{authorization:'Bearer '+token,accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw Error('version_read_failed_'+res.status);
  const data=await res.json();
  if(data?.success!==true||!data.result)throw Error('version_response_invalid');
  return data.result;
 };
 const [v2,v3]=await Promise.all([read(V2),read(V3)]);
 return checkWorkerBundleLineage({v2,v3,reviewedMainSha});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const result=await inspectWorkerBundleLineage({token:process.env.ASSETS_STAGING_CLOUDFLARE_READ_TOKEN,reviewedMainSha:process.env.EXPECTED_MAIN_SHA});
  console.log(JSON.stringify(result));
  // This metadata-only script never establishes complete release qualification.
  if(!result.independentSourceBundleProvenanceVerified)process.exitCode=1;
 }catch(e){console.error(String(e.message).replace(/[^a-zA-Z0-9_]/g,'_'));process.exitCode=1;}
}
