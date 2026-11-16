import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {inspectAssetStagingExposure,assertOpaqueReadToken} from './corporate-assets-v3-private-exposure-attestation.mjs';
import {checkAssetStagingBindingMetadata} from './corporate-assets-staging-binding-preflight.mjs';
const account='ddd23cab31928a4bb3d4998df9b26d1d';
const worker='bw-corporate-assets-staging';
const dbId='e19f09de-3bb9-4021-b4f8-44df04c8aaa8';
const environment='corporate-assets-staging-protected';
const shaPattern=/^[0-9a-f]{40}$/;
const api='https://api.github.com';
const rollback='5497120e-4ae6-4665-b96f-4b040d32a249';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function candidateWranglerEnvironment(token,env={}){
 assertOpaqueReadToken(token,'cloudflare');
 const clean={CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:account,WRANGLER_SEND_METRICS:'false'};
 for(const k of ['PATH','HOME','TMPDIR','SYSTEMROOT','WINDIR']){
  if(typeof env[k]==='string'&&env[k])clean[k]=env[k];
 }
 return Object.freeze(clean);
}
export function completeCandidateVersionIds(envelope){
 const list=envelope?.result?.items;
 const info=envelope?.result_info;
 if(!Array.isArray(list)||!list.length||list.length>=100||info?.page!==1||
    info?.count!==list.length||info?.total_count!==list.length||
    (info?.total_pages!==undefined&&info.total_pages!==1))
  throw Error('complete_candidate_version_inventory_required');
 const ids=list.map(v=>v?.id);
 if(ids.some(id=>!uuid.test(id||''))||new Set(ids).size!==ids.length)
  throw Error('invalid_candidate_version_inventory');
 return ids;
}
export function assertUnchangedActiveDeployment(before,after){
 const active=payload=>{
  if(!Array.isArray(payload?.deployments)||!payload.deployments.length)throw Error('deployment_inventory_missing');
  const records=payload.deployments;
  const ids=records.map(d=>d?.id);
  if(ids.some(id=>!uuid.test(id||''))||new Set(ids).size!==ids.length)
   throw Error('deployment_ids_invalid');
  const newest=records[0];
  if(newest?.versions?.length!==1||newest.versions[0]?.version_id!==rollback||
     newest.versions[0].percentage!==100)
   throw Error('active_legacy_version_changed');
  return JSON.stringify(records.map(d=>({id:d.id,versions:d.versions})));
 };
 const first=active(before),last=active(after);
 if(first!==last)throw Error('unexpected_staging_deployment_change');
 return true;
}
export function verifyPrivateSecretCandidate({beforeIds,afterIds,version,expectedSourceSha,exposureBefore,exposureAfter,beforeDeployments,afterDeployments}={}){
 if(!Array.isArray(beforeIds)||!Array.isArray(afterIds)||new Set(beforeIds).size!==beforeIds.length||
    afterIds.length!==beforeIds.length+1||!beforeIds.every(id=>afterIds.includes(id)))
  throw Error('candidate_version_count_changed');
 const added=afterIds.filter(id=>!beforeIds.includes(id));
 if(added.length!==1||!uuid.test(added[0])||version?.id!==added[0])
  throw Error('candidate_version_identity_mismatch');
 const bindingCheck=checkAssetStagingBindingMetadata(version?.resources?.bindings,{
  databaseId:dbId,sourceSha:expectedSourceSha
 });
 if(!bindingCheck.ready)throw Error('candidate_secret_or_hold_bindings_invalid');
 assertUnchangedActiveDeployment(beforeDeployments,afterDeployments);
 if(exposureBefore?.privateExposureVerified!==true||exposureAfter?.privateExposureVerified!==true)
  throw Error('staging_public_exposure_changed');
 return Object.freeze({newCandidateVersionId:added[0],candidateBindingsSafe:true,
  oldActiveVersionStillUnsafe:true,oldActiveVersionUnchanged:true,
  deploymentAuthorized:false,sourceProvenanceVerified:false,
  productionChanged:false});
}
export function validateEnvironmentPolicy(info,branches) {
 const rules=info?.protection_rules||[];
 const reviewer=rules.find(x=>x.type==='required_reviewers');
 const reviewers=reviewer?.reviewers||info?.reviewers||[];
 if(!reviewer||reviewer.prevent_self_review!==true||
 info?.can_admins_bypass!==false||
 !reviewers.some(x=>x.type==='User'&&x.reviewer?.login==='thusico'))
  throw Error('independent_thusico_environment_gate_required');
 if(info?.deployment_branch_policy?.custom_branch_policies!==true||
 info?.deployment_branch_policy?.protected_branches!==false||
 !Array.isArray(branches)||branches.length!==1||
 branches[0].name!=='main'||branches[0].type==='tag')
  throw Error('main_only_environment_policy_required');
 return true;
}
export function assertStagingHold(bindings,expectedDeployedSha){
 const lookup=n=>{const matches=bindings.filter(x=>x.name===n);if(matches.length!==1)throw Error('missing_or_duplicate_'+n);return matches[0]};
 const val=n=>{const b=lookup(n);if(b.type!=='plain_text')throw Error('invalid_type_'+n);return b.text};
 if(val('APP_ENV')!=='staging'||val('DEPLOYMENT_PROFILE')!=='corporate-assets-isolated'||
 val('ASSETS_STAGING_WRITES_ENABLED')!=='false'||val('THEBE_CORPORATE_ASSETS_ENABLED')!=='false')
  throw Error('staging_hold_required');
 if(lookup('DB').type!=='d1'||(lookup('DB').database_id||lookup('DB').id)!==dbId||
 val('ASSETS_STAGING_D1_ID')!==dbId)throw Error('isolated_d1_required');
 if(!shaPattern.test(expectedDeployedSha||'')||val('ASSETS_STAGING_SOURCE_SHA')!==expectedDeployedSha)
  throw Error('deployed_source_marker_mismatch');
 for(const n of ['SESSION_SECRET','AUDIT_INTEGRITY_SECRET']) {
  const b=lookup(n);
  if(!['plain_text','secret_text'].includes(b.type))throw Error('unsupported_existing_secret_type');
 }
 return true;
}
export function makeSecretPayload(){
 const a=randomBytes(48).toString('base64url'),b=randomBytes(48).toString('base64url');
 if(a===b)throw Error('staging_secrets_not_distinct');
 return JSON.stringify({SESSION_SECRET:a,AUDIT_INTEGRITY_SECRET:b});
}
async function requestJson(url,token){
 const response=await fetch(url,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('policy_or_metadata_read_failed_'+response.status);
 return response.json();
}
async function checkGithubPolicy(){
 const token=process.env.ASSETS_STAGING_GITHUB_READ_TOKEN;
 if(!token)throw Error('dedicated_github_read_token_required');
 const repo=process.env.GITHUB_REPOSITORY,expected=process.env.EXPECTED_MAIN_SHA;
 if(process.env.GITHUB_ACTOR?.toLowerCase()==='thusico')throw Error('independent_reviewer_must_not_initiate');
 if(repo!=='adinosassist-stack/botswana-compliance-platform'||!shaPattern.test(expected||'')||
 process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_SHA!==expected)
  throw Error('exact_main_source_required');
 const root=api+'/repos/'+repo;
 const [main,info,branches]=await Promise.all([
  requestJson(root+'/commits/main',token),
  requestJson(root+'/environments/'+environment,token),
  requestJson(root+'/environments/'+environment+'/deployment-branch-policies?per_page=100',token)
 ]);
 if(main.sha!==expected)throw Error('stale_main_sha');
 validateEnvironmentPolicy(info,branches.branch_policies);
}
async function cfEnvelope(path){
 const token=process.env.ASSETS_STAGING_CLOUDFLARE_TOKEN;
 if(!token)throw Error('dedicated_cloudflare_staging_token_required');
 const response=await fetch('https://api.cloudflare.com/client/v4'+path,{
  headers:{authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('cloudflare_read_failed_'+response.status);
 const data=await response.json();
 if(!data.success)throw Error('cloudflare_read_denied');
 return data;
}
async function cfGet(path){return (await cfEnvelope(path)).result}
function runWranglerWithStdin(payload){
 return new Promise((resolve,reject)=>{
  const child=spawn('node',['node_modules/wrangler/bin/wrangler.js','versions','secret','bulk','--name',worker,
   '--message','Isolated staged credential rotation candidate, no deployment'],{
   env:candidateWranglerEnvironment(process.env.ASSETS_STAGING_CLOUDFLARE_TOKEN,process.env),
   stdio:['pipe','ignore','ignore']});
  child.on('error',()=>reject(Error('wrangler_exec_failed')));
  child.on('close',code=>code===0?resolve():reject(Error('wrangler_candidate_creation_failed')));
  child.stdin.on('error',()=>{});
  child.stdin.end(payload);
 });
}
async function main(){
 if(process.env.ASSETS_STAGING_ROTATION_MODE!=='CREATE_VERSION_ONLY'||
 process.env.ASSETS_STAGING_ROTATION_AUTHORIZATION!=='CREATE_PRIVATE_ASSET_SECRET_CANDIDATE')
  throw Error('version_only_authorization_required');
 await checkGithubPolicy();
 const accountToken=process.env.ASSETS_STAGING_CLOUDFLARE_ACCOUNT_READ_TOKEN;
 assertOpaqueReadToken(accountToken,'account_inventory');
 const prefix=`/accounts/${account}/workers/scripts/${worker}`;
 const exposureBefore=await inspectAssetStagingExposure({
  token:process.env.ASSETS_STAGING_CLOUDFLARE_TOKEN,accountToken
 });
 if(!exposureBefore.privateExposureVerified)throw Error('staging_public_exposure_detected');
 const versionIdsBefore=completeCandidateVersionIds(await cfEnvelope(prefix+'/versions?per_page=100'));
 const settings=await cfGet(prefix+'/settings');
 assertStagingHold(settings.bindings||[],process.env.EXPECTED_DEPLOYED_SOURCE_SHA);
 const before=await cfGet(prefix+'/deployments');
 assertUnchangedActiveDeployment(before,before);
 const active=await cfGet(prefix+'/versions/'+rollback);
 assertStagingHold(active?.resources?.bindings||[],process.env.EXPECTED_DEPLOYED_SOURCE_SHA);
 // Recheck authorization right before candidate creation. No deploy API invoked.
 await checkGithubPolicy();
 await runWranglerWithStdin(makeSecretPayload());
 const versionIdsAfter=completeCandidateVersionIds(await cfEnvelope(prefix+'/versions?per_page=100'));
 const newIds=versionIdsAfter.filter(id=>!versionIdsBefore.includes(id));
 if(newIds.length!==1)throw Error('exactly_one_new_candidate_required');
 const newVersion=await cfGet(prefix+'/versions/'+newIds[0]);
 const after=await cfGet(prefix+'/deployments');
 const exposureAfter=await inspectAssetStagingExposure({
  token:process.env.ASSETS_STAGING_CLOUDFLARE_TOKEN,accountToken
 });
 const attestation=verifyPrivateSecretCandidate({
  beforeIds:versionIdsBefore,afterIds:versionIdsAfter,version:newVersion,
  expectedSourceSha:process.env.EXPECTED_DEPLOYED_SOURCE_SHA,
  exposureBefore,exposureAfter,beforeDeployments:before,afterDeployments:after
 });
 // Never claim that the old active version is secure or that source bytes are proven.
 console.log(JSON.stringify(attestation));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(e=>{console.error('Asset staging candidate failed:',String(e.message).replace(/[^a-zA-Z0-9_]/g,'_'));process.exitCode=1});
}
