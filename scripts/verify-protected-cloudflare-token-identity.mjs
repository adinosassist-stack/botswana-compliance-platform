// Protected read-only Cloudflare credential identity attestation. Does NOT prove least privilege.
// No token values, IDs or provider response bodies are printed. Never deploy, rotate or import.
import {pathToFileURL} from 'node:url';
const ACCOUNT='ddd23cab31928a4bb3d4998df9b26d1d';
const REPO='adinosassist-stack/botswana-compliance-platform';
const roles=Object.freeze({'production-deploy':'production','isolated-recovery':'operations-rehearsal'});
const SHA=/^[a-f0-9]{40}$/;
const ID=/^[a-f0-9]{32}$/;
const MODES=Object.freeze({account:'account-identity',user:'user-token-diagnostic'});
const hold=why=>{throw Error('protected_token_identity_hold_'+why)};
// Stages are locally enumerated, never derived from a response, URL, token or exception.
const STAGES=Object.freeze({github:'github',cloudflare:'cloudflare'});
async function getJson(fetchImpl,url,token,stage){
 if(!Object.values(STAGES).includes(stage))hold('authority');
 let r;
 try{r=await fetchImpl(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token,Accept:'application/json'}})}catch{hold(stage+'_connection')}
 if(r?.status!==200||r?.ok!==true)hold(stage+'_refused');
 let body;try{body=await r.json()}catch{hold(stage+'_response')}
 if(body?.success===false)hold(stage+'_response');
 return body;
}
export async function verifyProtectedTokenIdentity(env,{fetchImpl=fetch}={}){
 const role=env.TOKEN_ROLE,environment=roles[role],mode=env.VERIFICATION_MODE;
 if(!environment||env.PROTECTED_ENVIRONMENT_NAME!==environment||env.GITHUB_REPOSITORY!==REPO||
    env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
    (!((mode===MODES.account&&env.CONFIRMATION==='VERIFY_TOKEN_IDENTITY_READONLY')||
        (mode===MODES.user&&env.CONFIRMATION==='DIAGNOSE_USER_TOKEN_READONLY')))||!SHA.test(env.EXPECTED_SHA||'')||
    env.GITHUB_SHA!==env.EXPECTED_SHA||env.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT||
    !(mode===MODES.account?ID.test(env.EXPECTED_TOKEN_ID||''):env.EXPECTED_TOKEN_ID==='NONE')||typeof env.CLOUDFLARE_API_TOKEN!=='string'||
    !env.CLOUDFLARE_API_TOKEN.trim()||typeof env.GH_TOKEN!=='string'||!env.GH_TOKEN.trim())hold('authority');
 // GitHub checks source-of-truth main before any Cloudflare request.
 const main=await getJson(fetchImpl,'https://api.github.com/repos/'+REPO+'/git/ref/heads/main',env.GH_TOKEN,STAGES.github);
 if(main?.object?.sha!==env.EXPECTED_SHA)hold('stale_main');
 // Explicitly selected token-issuer endpoint, never fallback silently after a refusal.
 // User-token diagnosis deliberately does NOT compare or report token IDs and NEVER proves account-token identity.
 const verifyUrl=mode===MODES.account
  ? 'https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/tokens/verify'
  : 'https://api.cloudflare.com/client/v4/user/tokens/verify';
 const verified=await getJson(fetchImpl,verifyUrl,env.CLOUDFLARE_API_TOKEN,STAGES.cloudflare);
 if(!ID.test(verified?.result?.id||'')||verified.result.status!=='active')hold('inactive_or_unverified');
 if(mode===MODES.account&&verified.result.id!==env.EXPECTED_TOKEN_ID)hold('token_id_mismatch');
 // Reconfirm latest main, reducing the revision race; still not an authorization for any write.
 const finalMain=await getJson(fetchImpl,'https://api.github.com/repos/'+REPO+'/git/ref/heads/main',env.GH_TOKEN,STAGES.github);
 if(finalMain?.object?.sha!==env.EXPECTED_SHA)hold('stale_main');
 return Object.freeze({
  kind:'protected_cloudflare_token_identity_read_only',
  role,environment,sourceSha:env.EXPECTED_SHA,
  verificationMode:mode,providerTokenIdMatched:mode===MODES.account,
  userTokenEndpointAccepted:mode===MODES.user,
  statusActive:true,secretValueDisclosed:false,tokenNameProven:false,
  tokenPermissionsIndependentlyQualified:false,leastPrivilegeAccepted:false,
  credentialRotationAuthorized:false,retentionAndAccessAccepted:false,
  restoreAuthorized:false,productionWriteAuthorized:false,
  disposition:mode===MODES.user?'HOLD_USER_TOKEN_OWNER_AND_ACCESS_REVIEW':'HOLD_PERMISSION_SCOPE_AND_CONTROLLED_CUTOVER_REVIEW'
 });
}
// Only fixed internal failure codes may reach protected job logs; never print errors,
// tokens, response bodies, URL query data, token IDs or environment contents.
const SAFE_HOLDS=new Set(['authority','github_connection','github_refused','github_response',
 'cloudflare_connection','cloudflare_refused','cloudflare_response',
 'stale_main','inactive_or_unverified','token_id_mismatch']);
export function sanitizedTokenHoldCode(error){
 const m=/^protected_token_identity_hold_([a-z_]+)$/.exec(error?.message||'');
 return m&&SAFE_HOLDS.has(m[1])?m[1]:'unclassified';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(JSON.stringify(await verifyProtectedTokenIdentity(process.env)))}
 catch(e){console.error('protected_cloudflare_token_identity_HOLD_'+sanitizedTokenHoldCode(e));process.exitCode=1}
}
