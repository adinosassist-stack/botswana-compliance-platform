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
  if(!res?.ok)throw Error('live_core_bindings_read_failed');
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

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const result=await readAndVerifyLiveCoreOnlyBindings({
      accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
      token:process.env.CLOUDFLARE_API_TOKEN
    });
    process.stdout.write(JSON.stringify(result)+'\n');
  }catch{
    // Deliberately avoid exposing token-bearing errors, response bodies or URLs.
    console.error('live_core_bindings_hold');
    process.exitCode=1;
  }
}
