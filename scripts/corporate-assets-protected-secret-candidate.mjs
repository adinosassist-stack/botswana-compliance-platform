import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const account='ddd23cab31928a4bb3d4998df9b26d1d';
const worker='bw-corporate-assets-staging';
const dbId='e19f09de-3bb9-4021-b4f8-44df04c8aaa8';
const environment='corporate-assets-staging-protected';
const shaPattern=/^[0-9a-f]{40}$/;
const api='https://api.github.com';
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
async function cfGet(path){
 const token=process.env.ASSETS_STAGING_CLOUDFLARE_TOKEN;
 if(!token)throw Error('dedicated_cloudflare_staging_token_required');
 const response=await fetch('https://api.cloudflare.com/client/v4'+path,{
  headers:{authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('cloudflare_read_failed_'+response.status);
 const data=await response.json();
 if(!data.success)throw Error('cloudflare_read_denied');
 return data.result;
}
function runWranglerWithStdin(payload){
 return new Promise((resolve,reject)=>{
  const child=spawn('node',['node_modules/wrangler/bin/wrangler.js','versions','secret','bulk','--name',worker,
   '--message','Isolated staged credential rotation candidate, no deployment'],{
   env:{...process.env,CLOUDFLARE_API_TOKEN:process.env.ASSETS_STAGING_CLOUDFLARE_TOKEN,
    CLOUDFLARE_ACCOUNT_ID:account,WRANGLER_SEND_METRICS:'false'},
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
 const prefix=`/accounts/${account}/workers/scripts/${worker}`;
 const settings=await cfGet(prefix+'/settings');
 assertStagingHold(settings.bindings||[],process.env.EXPECTED_DEPLOYED_SOURCE_SHA);
 const before=await cfGet(prefix+'/deployments');
 // Recheck authorization right before candidate creation. No deploy API invoked.
 await checkGithubPolicy();
 await runWranglerWithStdin(makeSecretPayload());
 const after=await cfGet(prefix+'/deployments');
 const deploymentIds=x=>JSON.stringify((x?.deployments||x?.items||x||[]).map(y=>y.id).sort());
 if(deploymentIds(before)!==deploymentIds(after))throw Error('unexpected_staging_deployment_change');
 console.log('Asset staging secret candidate version created without deployment; actual candidate binding types require independent verification.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(e=>{console.error('Asset staging candidate failed:',String(e.message).replace(/[^a-zA-Z0-9_]/g,'_'));process.exitCode=1});
}
