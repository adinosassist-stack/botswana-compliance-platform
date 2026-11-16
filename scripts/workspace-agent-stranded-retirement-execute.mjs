// Single-target, fail-closed staging version retirement. NEVER import in production runtime.
// The execution workflow is manual, independently protected, and explicitly destructive.
import {assessOwnerStatement} from './workspace-agent-stranded-retirement-owner-acceptance.mjs';
import {assessStrandedRetirement,ACCOUNT,WORKER,STRANDED,PINNED,STAGING_D1} from './workspace-agent-stranded-retirement-eligibility.mjs';
import {assessRetirementPostconditions} from './workspace-agent-stranded-retirement-postcheck.mjs';

export const CONFIRM='DELETE_ONLY_UNDEPLOYED_WORKSPACE_AGENT_VERSION';
export const DELETE_URL='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+
 '/workers/workers/'+WORKER+'/versions/'+STRANDED;
const repo='adinosassist-stack/botswana-compliance-platform';
const github='https://api.github.com/repos/'+repo;
const cloudflare='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
const queries=Object.freeze({
 versionsPage1:cloudflare+'/workers/scripts/'+WORKER+'/versions?per_page=100&page=1',
 versionsPage2:cloudflare+'/workers/scripts/'+WORKER+'/versions?per_page=100&page=2',
 pinned:cloudflare+'/workers/workers/'+WORKER+'/versions/'+PINNED,
 latest:cloudflare+'/workers/workers/'+WORKER+'/versions/latest',
 settings:cloudflare+'/workers/scripts/'+WORKER+'/settings',
 deployments:cloudflare+'/workers/scripts/'+WORKER+'/deployments',
 zones:'https://api.cloudflare.com/client/v4/zones?account.id='+ACCOUNT+'&per_page=50',
 scripts:cloudflare+'/workers/scripts',
 subdomain:cloudflare+'/workers/scripts/'+WORKER+'/subdomain',
 schedules:cloudflare+'/workers/scripts/'+WORKER+'/schedules',
 domains:cloudflare+'/workers/domains?service='+WORKER,
 database:cloudflare+'/d1/database/'+STAGING_D1
});

const validSha=x=>typeof x==='string'&&/^[0-9a-f]{40}$/.test(x);
export function validateInputs(e={}){
 if(e.GITHUB_ACTOR!=='adinosassist-stack'||e.GITHUB_REF!=='refs/heads/main'||
   !validSha(e.EXPECTED_SHA)||e.GITHUB_SHA!==e.EXPECTED_SHA||
   e.CANDIDATE!==STRANDED||!/^\d{1,18}$/.test(e.OWNER_COMMENT||'')||
   e.DESTRUCTIVE_CONFIRM!==CONFIRM)throw Error('BLOCK source_actor_or_exact_scope_invalid');
 if(!e.GH_TOKEN||!e.READONLY_TOKEN||!e.WRITE_TOKEN)throw Error('BLOCK required_credentials_missing');
 if(e.READONLY_TOKEN===e.WRITE_TOKEN)throw Error('BLOCK write_and_readonly_tokens_must_be_distinct');
}
async function requestJson(http,url,token,method='GET'){
 const response=await http(url,{method,headers:{
  'Authorization':'Bearer '+token,'Accept':'application/json'
 },signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('BLOCK remote_request_failed');
 const data=await response.json();
 if(!data||typeof data!=='object')throw Error('BLOCK response_not_json_object');
 return data;
}
async function currentMain(http,ghToken) {
 const data=await requestJson(http,github+'/git/ref/heads/main',ghToken);
 if(!validSha(data?.object?.sha))throw Error('BLOCK main_sha_unavailable');
 return data.object.sha;
}
async function inventory(http,token){
 const results={};
 for(const [name,url] of Object.entries(queries))results[name]=await requestJson(http,url,token);
 return results;
}
export async function executeVersionRetirement({env,fetchImpl=fetch,onAudit=()=>{}}){
 validateInputs(env);
 const http=fetchImpl;
 const assertMain=async()=>{
  if(await currentMain(http,env.GH_TOKEN)!==env.EXPECTED_SHA)throw Error('BLOCK main_drift');
 };
 // GitHub audit identity must match exact immutable approval; cannot be self-synthesized.
 await assertMain();
 const comment=await requestJson(http,github+'/issues/comments/'+env.OWNER_COMMENT,env.GH_TOKEN);
 const owner=assessOwnerStatement({comment,sha:env.EXPECTED_SHA,actor:env.GITHUB_ACTOR});
 if(!owner.statementVerified)throw Error('BLOCK owner_authorization_invalid');
 const before=await inventory(http,env.READONLY_TOKEN);
 const eligible=assessStrandedRetirement(before);
 if(!eligible.eligibleForSeparateOwnerDecision)throw Error('BLOCK live_eligibility_invalid');
 onAudit('PASS owner_scope_and_full_live_preflight');
 // Last SHA guard is immediately before the single permitted DELETE.
 await assertMain();
 let response;
 try{
  response=await http(DELETE_URL,{
   method:'DELETE',headers:{Authorization:'Bearer '+env.WRITE_TOKEN,Accept:'application/json'},
   signal:AbortSignal.timeout(30000)
  });
 }catch{
  // Outcome uncertain: never retry and never attempt alternative mutations.
  throw Error('INCIDENT delete_outcome_uncertain_no_retry');
 }
 let result;
 try{result=await response.json()}catch{throw Error('INCIDENT delete_response_unverifiable_no_retry')}
 if(!response.ok||result?.success!==true)throw Error('INCIDENT deletion_not_confirmed_no_retry');
 onAudit('DELETE single_exact_candidate_request_confirmed');
 // Read-only postflight, including full inventory and final main SHA check.
 const after=await inventory(http,env.READONLY_TOKEN);
 const check=assessRetirementPostconditions(after);
 if(!check.verified)throw Error('INCIDENT postflight_mismatch_no_fallback');
 await assertMain();
 onAudit('PASS only_inert_pinned_version_remains_and_private_d1_unchanged');
 return {verified:true,deleteAttempts:1,postflightVerified:true};
}

if(process.argv[1]&&import.meta.url==='file://'+process.argv[1]){
 executeVersionRetirement({env:process.env,onAudit:line=>console.log(line)})
 .then(()=>console.log('PASS protected_staging_version_retirement_completed'))
 .catch(error=>{console.error(error?.message?.startsWith('BLOCK')||error?.message?.startsWith('INCIDENT')
   ?error.message:'INCIDENT unexpected_error_no_retry');process.exitCode=1;});
}
