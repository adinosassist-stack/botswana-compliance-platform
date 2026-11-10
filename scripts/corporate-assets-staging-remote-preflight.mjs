/**
 * Read-only live Cloudflare metadata attestation for isolated Corporate Assets.
 * No secret values are printed, fetched separately, generated, or modified.
 */
import {pathToFileURL} from 'node:url';
import {checkAssetStagingBindingMetadata} from './corporate-assets-staging-binding-preflight.mjs';
const ACCOUNT_ID='ddd23cab31928a4bb3d4998df9b26d1d';
const WORKER='bw-corporate-assets-staging';
const DATABASE_ID='e19f09de-3bb9-4021-b4f8-44df04c8aaa8';
const SHA=/^[0-9a-f]{40}$/;
export async function verifyCorporateAssetsRemoteMetadata({token,sourceSha,request=fetch}={}){
 if(!SHA.test(sourceSha||''))throw Error('exact_reviewed_sha_required');
 if(typeof token!=='string'||!token.trim())throw Error('dedicated_staging_read_token_required');
 const url=`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER}/settings`;
 const response=await request(url,{method:'GET',headers:{authorization:`Bearer ${token}`,accept:'application/json'},redirect:'error'});
 if(!response.ok)throw Error('staging_metadata_read_failed_'+response.status);
 const json=await response.json();
 if(json.success!==true||!Array.isArray(json.result?.bindings))throw Error('staging_metadata_invalid');
 const result=checkAssetStagingBindingMetadata(json.result.bindings,{databaseId:DATABASE_ID,sourceSha});
 // Only allow fixed reason codes from the guard; never return bindings or secrets.
 return Object.freeze({ready:result.ready,worker:WORKER,databaseId:DATABASE_ID,reviewedSourceSha:sourceSha,errors:result.errors});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const receipt=await verifyCorporateAssetsRemoteMetadata({token:process.env.ASSETS_STAGING_CLOUDFLARE_READ_TOKEN,sourceSha:process.env.EXPECTED_MAIN_SHA});
  console.log(JSON.stringify(receipt));
  if(!receipt.ready)process.exitCode=1;
 }catch(err){
  console.error(String(err.message).replace(/[^a-zA-Z0-9_]/g,'_'));
  process.exitCode=1;
 }
}
