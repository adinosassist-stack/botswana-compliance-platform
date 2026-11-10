/**
 * Corporate Assets staging read-only metadata attestation.
 *
 * Never confuse editable latest Worker settings (which may describe an
 * UNDEPLOYED version) with the settings of the version actually receiving
 * staging traffic. Requires an exact-source, secure binding check for every
 * version in the active deployment, before and after the metadata reads.
 * No values, bank/account data, or deployment actions leave this module.
 */
import {pathToFileURL} from 'node:url';
import {checkAssetStagingBindingMetadata} from './corporate-assets-staging-binding-preflight.mjs';

const ACCOUNT_ID='ddd23cab31928a4bb3d4998df9b26d1d';
const WORKER='bw-corporate-assets-staging';
const DATABASE_ID='e19f09de-3bb9-4021-b4f8-44df04c8aaa8';
const SHA=/^[0-9a-f]{40}$/;
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const API='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT_ID+'/workers/scripts/'+WORKER;

function activeDeployment(result) {
  const deployments=result?.deployments;
  if(!Array.isArray(deployments)||deployments.length===0||!deployments[0] ||
      !ID.test(deployments[0].id||'')||!Array.isArray(deployments[0].versions))
    return null;
  const current=deployments[0],versions=current.versions;
  if(versions.length<1||versions.length>20 ||
     versions.some(x=>!ID.test(x?.version_id||'') ||
       typeof x.percentage!=='number'||!Number.isFinite(x.percentage)||
       x.percentage<0||x.percentage>100)||
     Math.abs(versions.reduce((n,x)=>n+x.percentage,0)-100)>0.001)
    return null;
  const positive=versions.filter(x=>x.percentage>0);
  if(!positive.length||new Set(positive.map(x=>x.version_id)).size!==positive.length)
    return null;
  return {id:current.id,versions:positive};
}
const signature=d=>d?.id+'|'+d?.versions?.map(v=>v.version_id+':'+v.percentage).sort().join(',');

export async function verifyCorporateAssetsRemoteMetadata({token,sourceSha,request=fetch}={}) {
  if(!SHA.test(sourceSha||''))throw Error('exact_reviewed_sha_required');
  if(typeof token!=='string'||!token.trim())throw Error('dedicated_staging_read_token_required');
  const get=async (suffix,scope)=>{
    const response=await request(API+suffix,{
      method:'GET',headers:{authorization:'Bearer '+token,accept:'application/json'},
      redirect:'error',signal:AbortSignal.timeout(15000)
    });
    if(!response.ok)throw Error('staging_metadata_read_failed_'+scope+'_'+response.status);
    const data=await response.json();
    if(data?.success!==true||!data.result)throw Error('staging_metadata_invalid_'+scope);
    return data.result;
  };
  const latest=await get('/settings','settings');
  const settingCheck=checkAssetStagingBindingMetadata(latest.bindings,{
    databaseId:DATABASE_ID,sourceSha
  });
  // Fail closed when deployments are unavailable/incomplete, even if latest
  // settings list both credentials as secret_text.
  const before=activeDeployment(await get('/deployments','deployments'));
  if(!before)throw Error('active_deployment_inventory_invalid');
  const errors=[...settingCheck.errors];
  for(const active of before.versions){
    const version=await get('/versions/'+active.version_id,'version');
    const bindings=version.resources?.bindings||version.bindings;
    const check=checkAssetStagingBindingMetadata(bindings,{
      databaseId:DATABASE_ID,sourceSha
    });
    // Return only constant reason codes, never version binding text.
    errors.push(...check.errors.map(code=>'active_version_'+code));
  }
  // A concurrent deployment or traffic split change invalidates the entire
  // attestation. A follow-up protected deploy requires a new readback.
  const after=activeDeployment(await get('/deployments','deployments'));
  if(!after||signature(before)!==signature(after))
    throw Error('active_deployment_changed_during_read');
  return Object.freeze({
    ready:errors.length===0,
    worker:WORKER,
    databaseId:DATABASE_ID,
    reviewedSourceSha:sourceSha,
    activeVersionCount:before.versions.length,
    deployedBindingTypesVerified:errors.length===0,
    authenticatedSourceBytesVerified:false,
    deploymentAuthorized:false,
    errors:Object.freeze([...new Set(errors)])
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const receipt=await verifyCorporateAssetsRemoteMetadata({
      token:process.env.ASSETS_STAGING_CLOUDFLARE_READ_TOKEN,
      sourceSha:process.env.EXPECTED_MAIN_SHA
    });
    console.log(JSON.stringify(receipt));
    if(!receipt.ready)process.exitCode=1;
  }catch(err){
    console.error(String(err.message).replace(/[^a-zA-Z0-9_]/g,'_'));
    process.exitCode=1;
  }
}
