// Read-only, immutable active-production deployment attestation.
// Do not use mutable script /settings as proof of the version serving traffic.
import {pathToFileURL} from 'node:url';

const REQUIRED = Object.freeze({
  APP_ENV: 'production',
  PAYMENT_PROVIDER: 'none',
  POP_UPLOAD_STAGING_ENABLED: 'false',
  THEBE_AI_EXPORTS_ENABLED: 'false',
  THEBE_GENERAL_AI_ENABLED: 'false',
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCRIPT = 'bw-compliance-os';
const API = 'https://api.cloudflare.com/client/v4/accounts/';

export function identifyActiveCoreDeployment(payload) {
  // Cloudflare documents the first deployment as the one actively serving traffic.
  const current=payload?.result?.deployments?.[0];
  if (payload?.success!==true || !Array.isArray(payload?.result?.deployments) ||
      !current || !UUID.test(current.id||'') ||
      !Number.isFinite(Date.parse(current.created_on)) ||
      current.strategy!=='percentage' ||
      !Array.isArray(current.versions) || current.versions.length!==1 ||
      !UUID.test(current.versions[0]?.version_id||'') ||
      current.versions[0]?.percentage!==100)
    throw Error('live_core_deployment_unqualified');
  return Object.freeze({deploymentId:current.id,versionId:current.versions[0].version_id,
    deployedAt:current.created_on});
}

export function verifyLiveCoreOnlyBindings(payload) {
  // Immutable version detail has resources.bindings, unlike mutable script settings.
  if (payload?.success!==true || !Array.isArray(payload?.result?.resources?.bindings))
    throw Error('live_core_bindings_unavailable');
  const bindings=payload.result.resources.bindings;
  for (const [name,expected] of Object.entries(REQUIRED)) {
    const matches=bindings.filter(entry=>entry?.name===name);
    if (matches.length!==1 || matches[0]?.type!=='plain_text' ||
        matches[0]?.text!==expected) throw Error('live_core_bindings_mismatch_'+name);
  }
  return {kind:'live_core_bindings_verified',production:true,popIngestionEnabled:false,
    advancedAiExportsEnabled:false,generalAiEnabled:false,paymentProvider:'none'};
}

async function getMetadataJson(url,token,fetchImpl) {
  const res=await fetchImpl(url,{method:'GET',redirect:'error',
    headers:{Authorization:'Bearer '+token,Accept:'application/json'},
    signal:AbortSignal.timeout(12000)});
  if(!res?.ok){
    const status=Number(res?.status);
    if(status===401||status===403)throw Error('live_core_bindings_permission_denied');
    if([404,409,429].includes(status)||(status>=500&&status<=599))
      throw Error('live_core_bindings_read_retryable');
    throw Error('live_core_bindings_read_failed');
  }
  const body=await res.text();
  if(typeof body!=='string'||body.length>524288)throw Error('live_core_bindings_response_oversize');
  try{return JSON.parse(body)}catch{throw Error('live_core_bindings_invalid_json')}
}

export async function readAndVerifyLiveCoreOnlyBindings({accountId,token,fetchImpl=fetch}={}) {
  if(!/^[a-f0-9]{32}$/.test(accountId||'')||typeof token!=='string'||!token)
    throw Error('live_core_bindings_credentials_missing');
  const base=API+accountId+'/workers/scripts/'+SCRIPT;
  const deploymentsUrl=base+'/deployments?per_page=1&page=1';
  const before=identifyActiveCoreDeployment(await getMetadataJson(deploymentsUrl,token,fetchImpl));
  const version=await getMetadataJson(base+'/versions/'+before.versionId,token,fetchImpl);
  if(version?.result?.id!==before.versionId)throw Error('live_core_version_identity_mismatch');
  const bindings=verifyLiveCoreOnlyBindings(version);
  // A concurrent new deployment after version read must never be accepted.
  const after=identifyActiveCoreDeployment(await getMetadataJson(deploymentsUrl,token,fetchImpl));
  if(after.deploymentId!==before.deploymentId||after.versionId!==before.versionId)
    throw Error('live_core_deployment_changed');
  return Object.freeze({...bindings,activeDeploymentId:before.deploymentId,
    activeVersionId:before.versionId,deployedAt:before.deployedAt,
    evidence:'immutable_active_worker_version'});
}

// The Workers deployment API can lag briefly behind a successful Wrangler deploy.
// Retry only bounded read/consistency failures; never relax binding requirements.
export async function readAndVerifyLiveCoreOnlyBindingsWithRetry({
  attempts=5,delayMs=1500,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  ...options
}={}) {
  if(!Number.isInteger(attempts)||attempts<1||attempts>8||
      !Number.isInteger(delayMs)||delayMs<0||delayMs>10000||typeof sleep!=='function')
    throw Error('live_core_retry_configuration_invalid');
  for(let i=1;i<=attempts;i++){
    try{return await readAndVerifyLiveCoreOnlyBindings(options)}
    catch(error){
      const code=error instanceof Error?error.message:'';
      const retryable=code==='live_core_bindings_read_retryable'||
        code==='live_core_deployment_unqualified'||
        code==='live_core_deployment_changed'||
        code==='live_core_bindings_unavailable'||
        Object.keys(REQUIRED).some(name=>code==='live_core_bindings_mismatch_'+name);
      if(!retryable||i===attempts)throw error;
      await sleep(delayMs);
    }
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const result=await readAndVerifyLiveCoreOnlyBindingsWithRetry({
      accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
      token:process.env.CLOUDFLARE_API_TOKEN
    });
    process.stdout.write(JSON.stringify(result)+'\n');
  }catch(error){
    // Never print tokens, URLs, response bodies or exception messages from the API.
    const code=error instanceof Error?error.message:'';
    const allow=['live_core_bindings_permission_denied','live_core_bindings_read_retryable',
      'live_core_bindings_read_failed','live_core_bindings_invalid_json',
      'live_core_bindings_response_oversize','live_core_bindings_unavailable',
      'live_core_deployment_unqualified','live_core_deployment_changed',
      'live_core_version_identity_mismatch','live_core_bindings_credentials_missing'];
    const diagnostic=allow.includes(code)||Object.keys(REQUIRED).some(name=>
      code==='live_core_bindings_mismatch_'+name)?code:'unexpected';
    console.error('live_core_bindings_hold:'+diagnostic);
    process.exitCode=1;
  }
}
