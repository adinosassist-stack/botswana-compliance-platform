/**
 * Corporate Assets: deliberately separate version-only upload workflow.
 * This script MAY create a new *undeployed* version only when run through
 * a protected, explicitly dispatched, independently reviewed GitHub job.
 * Never deploys or enables public access/writes. A successful POST is NOT
 * byte-for-byte source provenance or permission to deploy.
 */
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {inspectProtectedProvenance} from './corporate-assets-protected-provenance-preflight.mjs';
import {inspectAssetStagingExposure} from './corporate-assets-v3-private-exposure-attestation.mjs';
import {runIndependentDryRuns} from './corporate-assets-compiled-reproducibility.mjs';
import {renderCorporateAssetsStagingConfig} from './render-corporate-assets-staging-config.mjs';
import {checkAssetStagingBindingMetadata} from './corporate-assets-staging-binding-preflight.mjs';
import {ACCOUNT,WORKER,DB,ROLLBACK,CANDIDATE} from './corporate-assets-v3-predeployment-attestation.mjs';
const SHA=/^[0-9a-f]{40}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPO='adinosassist-stack/botswana-compliance-platform';
const prefix='/accounts/'+ACCOUNT+'/workers/scripts/'+WORKER;
const off=['EVIDENCE_UPLOADS_ENABLED','POP_UPLOAD_STAGING_ENABLED','THEBE_AI_EXPORTS_ENABLED',
 'THEBE_GENERAL_AI_ENABLED','THEBE_INTERNAL_AUTONOMY_ENABLED','THEBE_LIVE_VOICE_ENABLED'];
const envSecrets=['SESSION_SECRET','AUDIT_INTEGRITY_SECRET'];
export function requireVersionOnlyContext({mode,authorization,repo,ref,sha,expectedSha,githubReadToken,cloudflareToken}={}){
 if(mode!=='create-version-only'||authorization!=='CREATE_ISOLATED_ASSETS_SOURCE_VERSION')
  throw Error('independent_version_only_owner_authorization_required');
 if(repo!==REPO||ref!=='refs/heads/main'||!SHA.test(expectedSha||'')||sha!==expectedSha)
  throw Error('exact_current_main_required');
 if(!githubReadToken||!cloudflareToken)throw Error('dedicated_protected_credentials_required');
 return true;
}
export function checkVersionInventory(response,{newVersion=false,priorIds=[]}={}){
 if(!Array.isArray(response?.items)||!Number.isSafeInteger(response?.total_count)||
  response.total_count!==response.items.length||response.items.length===0)
  throw Error('complete_version_inventory_required');
 const ids=response.items.map(x=>x.id);
 if(ids.some(id=>!UUID.test(id||''))||new Set(ids).size!==ids.length)
  throw Error('invalid_version_ids');
 if(newVersion){
  const newIds=ids.filter(id=>!priorIds.includes(id));
  if(newIds.length!==1||ids.length!==priorIds.length+1||
   !priorIds.every(id=>ids.includes(id)))throw Error('exact_one_new_version_required');
  const next=response.items.find(x=>x.id===newIds[0]);
  if(!Number.isSafeInteger(next.number)||next.number<4||[ROLLBACK,CANDIDATE].includes(next.id))
   throw Error('new_version_identity_invalid');
  return next.id;
 }
 if(!ids.includes(ROLLBACK)||!ids.includes(CANDIDATE))throw Error('known_versions_missing');
 return ids;
}
export function assertInertVersionBindings(version,expectedSha){
 const bindings=version?.resources?.bindings;
 const att=checkAssetStagingBindingMetadata(bindings,{databaseId:DB,sourceSha:expectedSha});
 if(!att.ready)throw Error('new_version_bindings_invalid:'+att.errors.join(','));
 const get=n=>bindings.filter(b=>b.name===n&&b.type==='plain_text').map(b=>b.text);
 for(const name of off)if(get(name).length!==1||get(name)[0]!=='false')
  throw Error('high_risk_feature_not_held:'+name);
 if(get('PAYMENT_PROVIDER').length!==1||get('PAYMENT_PROVIDER')[0]!=='none'||
  get('REGISTRATION_MODE').length!==1||get('REGISTRATION_MODE')[0]!=='hold')
  throw Error('payment_or_registration_hold_missing');
 for(const n of envSecrets)if(bindings.filter(b=>b.name===n&&b.type==='secret_text').length!==1)
  throw Error('credential_binding_type_not_preserved');
 return true;
}
export function verifyStableDeployment(response){
 const deployments=response?.deployments,info=response?.result_info;
 if(!Array.isArray(deployments)||!deployments.length||info?.page!==1||
  info?.total_pages!==1||info?.count!==deployments.length)throw Error('complete_deployments_required');
 const times=deployments.map(d=>Date.parse(d.created_on||''));
 if(times.some(t=>!Number.isFinite(t))||new Set(times).size!==times.length)
  throw Error('ambiguous_deployment_inventory');
 const latest=deployments[times.indexOf(Math.max(...times))];
 if(latest?.versions?.length!==1||latest.versions[0].version_id!==ROLLBACK||
  latest.versions[0].percentage!==100)throw Error('rollback_v2_must_serve_all_traffic');
 return deployments.map(d=>d.id).sort();
}
export function assertVersionOnlyResult({beforeIds,afterIds,beforeDeployments,afterDeployments,newVersion,expectedSha,
 exposureBefore,exposureAfter,reproducibility}={}){
 const newId=checkVersionInventory(afterIds,{newVersion:true,priorIds:beforeIds});
 if(newVersion?.id!==newId)throw Error('new_version_get_must_match_inventory');
 assertInertVersionBindings(newVersion,expectedSha);
 const prior=verifyStableDeployment(beforeDeployments);
 const after=verifyStableDeployment(afterDeployments);
 if(JSON.stringify(prior)!==JSON.stringify(after))throw Error('unexpected_deployment_mutation');
 if(exposureBefore?.privateExposureVerified!==true||exposureAfter?.privateExposureVerified!==true)
  throw Error('staging_public_exposure_changed');
 if(reproducibility?.sourceSha!==expectedSha||
  reproducibility?.executableModuleReproducible!==true||
  reproducibility?.sourceToCloudflareUploadVerified!==false)throw Error('offline_executable_receipt_invalid');
 return Object.freeze({schema:'thebe.assets.protected-version-only.v1',newVersionId:newId,
  reviewedMainSha:expectedSha,executableModuleDigest:reproducibility.executableModuleDigest,
  versionCreated:true,rolledBackVersionAt100Percent:true,privateExposureVerified:true,
  secretBindingTypesPreserved:true,secretValuesVerified:false,
  uploadedBytesCryptographicallyVerified:false,
  independentSourceProvenanceVerified:false,deploymentAuthorized:false,
  productionChanged:false});
}
async function cfGet(path,token){
 const r=await fetch('https://api.cloudflare.com/client/v4'+path,{
  method:'GET',headers:{authorization:'Bearer '+token,accept:'application/json'},
  redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('cloudflare_get_denied_'+r.status);
 const v=await r.json();
 if(v.success!==true||v.result==null)throw Error('cloudflare_get_invalid');
 return v;
}
async function getInventory(token){
 const x=await cfGet(prefix+'/versions?per_page=100',token);
 const page=x.result_info||{};
 if(page.page!==1||page.total_count!==page.count||page.count>100)
  throw Error('version_inventory_pagination_incomplete');
 return {items:x.result?.items||x.result?.versions||x.result,total_count:page.total_count};
}
async function getDeployments(token){
 const x=await cfGet(prefix+'/deployments',token);
 return {...x.result,result_info:x.result_info};
}
function uploadWithWrangler(expectedSha,token){
 const config=renderCorporateAssetsStagingConfig({
  ASSETS_STAGING_SOURCE_SHA:expectedSha,ASSETS_STAGING_D1_ID:DB,
  PRODUCTION_D1_DATABASE_ID:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce'});
 if(config.workers_dev!==false||config.preview_urls!==false||config.keep_vars!==false||
  config.routes.length!==0)throw Error('inert_worker_configuration_required');
 const folder=mkdtempSync(join(tmpdir(),'assets-version-only-'));
 try{
  const path=join(folder,'wrangler.json');
  writeFileSync(path,JSON.stringify(config),{mode:0o600});
  const env={...process.env,CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:ACCOUNT,
   WRANGLER_SEND_METRICS:'false'};
  // No .env files, no telemetry, no credentials in logs.
  const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',
   'versions','upload','--config',path,'--strict','--message',
   'Protected isolated Corporate Assets version only; NOT deployed'],{
   env,stdio:['ignore','ignore','ignore'],timeout:120000});
  if(result.error||result.status!==0)throw Error('protected_version_only_wrangler_upload_failed');
 }finally{rmSync(folder,{recursive:true,force:true})}
}
export async function createProtectedVersionOnly({
 expectedSha=process.env.EXPECTED_MAIN_SHA,
 githubReadToken=process.env.ASSETS_STAGING_GITHUB_READ_TOKEN,
 cloudflareToken=process.env.ASSETS_STAGING_CLOUDFLARE_TOKEN}={}){
 requireVersionOnlyContext({mode:process.env.ASSETS_SOURCE_VERSION_MODE,
  authorization:process.env.ASSETS_SOURCE_VERSION_AUTHORIZATION,
  repo:process.env.GITHUB_REPOSITORY,ref:process.env.GITHUB_REF,
  sha:process.env.GITHUB_SHA,expectedSha,githubReadToken,cloudflareToken});
 const context={expectedSha,repository:REPO,ref:'refs/heads/main',githubSha:expectedSha,
  githubToken:githubReadToken,cloudflareToken};
 const preflight=await inspectProtectedProvenance(context);
 if(preflight.mainSha!==expectedSha||preflight.exactSourceUploadVerified!==false)
  throw Error('protected_provenance_failed');
 const exposureBefore=await inspectAssetStagingExposure({token:cloudflareToken});
 if(!exposureBefore.privateExposureVerified)throw Error('private_exposure_required');
 const beforeInventory=await getInventory(cloudflareToken);
 const beforeIds=checkVersionInventory(beforeInventory);
 const beforeDeployments=await getDeployments(cloudflareToken);
 verifyStableDeployment(beforeDeployments);
 const settings=(await cfGet(prefix+'/settings',cloudflareToken)).result;
 // Existing credentials must be stored as secret_text and D1 remains isolated.
 const existing=checkAssetStagingBindingMetadata(settings.bindings,{databaseId:DB,
  sourceSha:settings.bindings?.find(b=>b.name==='ASSETS_STAGING_SOURCE_SHA')?.text});
 if(!existing.ready)throw Error('existing_worker_hold_required');
 for(const n of envSecrets)if(settings.bindings.filter(b=>b.name===n&&b.type==='secret_text').length!==1)
  throw Error('existing_staging_secrets_must_be_secret_text');
 const reproducibility=runIndependentDryRuns({expectedSha});
 if(!reproducibility.executableModuleReproducible)throw Error('source_module_not_reproducible');
 // Protected, independently reviewed job and a fresh *manual* authorization.
 // Live main/policy is checked a SECOND time immediately before any mutation.
 await inspectProtectedProvenance(context);
 uploadWithWrangler(expectedSha,cloudflareToken);
 // On partial failure, a new undeployed version may exist; never retry blindly.
 const afterInventory=await getInventory(cloudflareToken);
 const newId=checkVersionInventory(afterInventory,{newVersion:true,priorIds:beforeIds});
 const [version,afterDeployments,exposureAfter]=await Promise.all([
  cfGet(prefix+'/versions/'+newId,cloudflareToken),getDeployments(cloudflareToken),
  inspectAssetStagingExposure({token:cloudflareToken})]);
 return assertVersionOnlyResult({beforeIds,afterIds:afterInventory,beforeDeployments,
  afterDeployments,newVersion:version.result,expectedSha,
  exposureBefore,exposureAfter,reproducibility});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 createProtectedVersionOnly().then(x=>console.log(JSON.stringify(x)))
 .catch(e=>{console.error('version_only_failed:'+String(e.message).replace(/[^a-zA-Z0-9_:,]/g,'_'));process.exitCode=1});
}
