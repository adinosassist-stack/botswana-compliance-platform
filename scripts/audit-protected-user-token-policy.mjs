// Read-only, manual, protected Cloudflare user-token policy metadata audit.
// No credential values, token IDs, policy names, raw API responses or originals of exceptions in logs.
import {pathToFileURL} from 'node:url';
const ACCOUNT='ddd23cab31928a4bb3d4998df9b26d1d';
const REPO='adinosassist-stack/botswana-compliance-platform';
const SHA=/^[a-f0-9]{40}$/;
const ID=/^[a-f0-9]{32}$/;
const stop=code=>{throw Error('user_token_policy_hold_'+code)};
async function json(fetchImpl,url,token,stage){
 let r;
 try{r=await fetchImpl(url,{method:'GET',redirect:'error',
  signal:AbortSignal.timeout(20000),
  headers:{Authorization:'Bearer '+token,Accept:'application/json'}})}
 catch{stop(stage+'_connection')}
 if(!r?.ok||r?.status!==200)stop(stage+'_refused');
 let data;
 try{data=await r.json()}catch{stop(stage+'_response')}
 if(!data||data.success===false||typeof data!=='object')stop(stage+'_response');
 return data;
}
async function readMain(fetchImpl,token){
 const r=await json(fetchImpl,'https://api.github.com/repos/'+REPO+'/git/ref/heads/main',token,'github');
 return r?.object?.sha;
}
export async function auditProtectedUserTokenPolicy(env,{fetchImpl=fetch}={}){
 if(env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main'||
    env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.PROTECTED_ENVIRONMENT_NAME!=='production'||
    env.CONFIRMATION!=='AUDIT_USER_TOKEN_POLICY_READONLY'||!SHA.test(env.EXPECTED_SHA||'')||
    env.EXPECTED_SHA!==env.GITHUB_SHA||env.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT||
    typeof env.CLOUDFLARE_API_TOKEN!=='string'||!env.CLOUDFLARE_API_TOKEN.trim()||
    typeof env.GH_TOKEN!=='string'||!env.GH_TOKEN.trim())stop('authority');
 if(await readMain(fetchImpl,env.GH_TOKEN)!==env.EXPECTED_SHA)stop('stale_main');
 const base='https://api.cloudflare.com/client/v4/user/tokens';
 const verified=await json(fetchImpl,base+'/verify',env.CLOUDFLARE_API_TOKEN,'cloudflare_verify');
 if(!ID.test(verified?.result?.id||'')||verified?.result?.status!=='active')stop('token_unverified');
 // Fetch only the verified token's own details; no user-token inventory and no account fallback.
 const detail=await json(fetchImpl,base+'/'+verified.result.id,env.CLOUDFLARE_API_TOKEN,'cloudflare_metadata');
 if(detail?.result?.id!==verified.result.id||!Array.isArray(detail?.result?.policies)||
    detail.result.policies.length===0)stop('policy_unavailable');
 let accountScope=false,writeScope=false,policyMetadataComplete=true;
 for(const p of detail.result.policies){
  if(!['allow','deny'].includes(p?.effect)||!p.resources||Array.isArray(p.resources)||
   typeof p.resources!=='object'||!Array.isArray(p.permission_groups))stop('policy_unavailable');
  if(p.effect!=='allow')continue;
  const resources=Object.keys(p.resources);
  if(resources.length===0)stop('policy_unavailable');
  const isAccountWide=resources.includes('com.cloudflare.api.account.'+ACCOUNT)||
    resources.includes('com.cloudflare.api.account.*');
  accountScope ||= isAccountWide;
  for(const g of p.permission_groups){
   if(typeof g?.name!=='string'||!g.name.trim()){policyMetadataComplete=false;continue}
   if(isAccountWide&&/\b(write|edit)\b/i.test(g.name))writeScope=true;
  }
 }
 if(await readMain(fetchImpl,env.GH_TOKEN)!==env.EXPECTED_SHA)stop('stale_main');
 return Object.freeze({
  kind:'protected_user_token_policy_metadata_audit',
  sourceSha:env.EXPECTED_SHA,
  tokenVerifiedActive:true,selfTokenDetailAccessible:true,
  accountWideAllowObserved:accountScope,
  accountWideWriteNameObserved:writeScope,
  policyMetadataNamesComplete:policyMetadataComplete,
  // Metadata introspection is advisory, NEVER a grant or least-privilege acceptance.
  permissionsIndependentlyQualified:false,
  exclusiveRestoreWritersProven:false,
  retentionAccepted:false,restoreAuthorized:false,
  productionWriteAuthorized:false,credentialRotationAuthorized:false,
  credentialValueDisclosed:false,tokenIdDisclosed:false,
  disposition:'HOLD_INDEPENDENT_POLICY_AND_ROLE_REVIEW'
 });
}
const SAFE=new Set(['authority','stale_main','github_connection','github_refused','github_response',
 'cloudflare_verify_connection','cloudflare_verify_refused','cloudflare_verify_response',
 'cloudflare_metadata_connection','cloudflare_metadata_refused','cloudflare_metadata_response',
 'token_unverified','policy_unavailable']);
export const safeErrorCode=e=>{
 const m=/^user_token_policy_hold_([a-z_]+)$/.exec(e?.message||'');
 return m&&SAFE.has(m[1])?m[1]:'unclassified';
};
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(await auditProtectedUserTokenPolicy(process.env)))}
 catch(e){console.error('protected_user_token_policy_HOLD_'+safeErrorCode(e));process.exitCode=1}
}
