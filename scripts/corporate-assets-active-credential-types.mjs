/** Read-only active-version secret binding audit; never inspect or log binding values. */
import {ACCOUNT,WORKER,assertOpaqueReadToken,sanitizedCloudflareError} from './corporate-assets-v3-private-exposure-attestation.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NAMES=['SESSION_SECRET','AUDIT_INTEGRITY_SECRET'];
export function evaluateActiveAssetCredentialTypes({deployments,version}={}){
 const d=Array.isArray(deployments)?deployments[0]:undefined;
 const versions=d?.versions;
 const single=Array.isArray(versions)&&versions.length===1&&versions[0]?.percentage===100&&UUID.test(versions[0]?.version_id||'');
 const actual=version?.id;
 const bindingList=version?.resources?.bindings;
 const valid=single&&actual===versions[0].version_id&&Array.isArray(bindingList);
 const credentialTypes=valid?NAMES.map(name=>{
  const matches=bindingList.filter(b=>b?.name===name);
  return matches.length===1?matches[0].type:'missing_or_duplicate';
 }):[];
 const safe=valid&&credentialTypes.every(t=>t==='secret_text');
 return Object.freeze({
  activeVersionId:single?versions[0].version_id:null,
  immutableCredentialTypesVerified:safe,
  activeCredentialRisk:!safe,
  errors:Object.freeze(!valid?['active_version_evidence_incomplete']:
    safe?[]:['active_version_secret_binding_type_unsafe']),
  createVersionAuthorized:false,deploymentAuthorized:false
 });
}
export async function inspectActiveAssetCredentialTypes({token,request=fetch}={}){
 assertOpaqueReadToken(token,'cloudflare');
 const get=async(path,scope)=>{
  const r=await request('https://api.cloudflare.com/client/v4'+path,{method:'GET',
   headers:{authorization:'Bearer '+token,accept:'application/json'},
   redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error(await sanitizedCloudflareError(r,scope));
  const data=await r.json();
  if(data?.success!==true||!data.result)throw Error('active_version_evidence_incomplete');
  return data.result;
 };
 const prefix='/accounts/'+ACCOUNT+'/workers/scripts/'+WORKER;
 const response=await get(prefix+'/deployments','active_deployments');
 const deployments=response?.deployments;
 const first=Array.isArray(deployments)?deployments[0]:undefined;
 const versionId=first?.versions?.length===1&&first.versions[0].percentage===100?
  first.versions[0].version_id:null;
 if(!UUID.test(versionId||''))throw Error('active_version_evidence_incomplete');
 const version=await get(prefix+'/versions/'+versionId,'active_version');
 return evaluateActiveAssetCredentialTypes({deployments,version});
}
