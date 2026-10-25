// Fixed metadata GETs only. No D1 SQL, log payloads, exports, objects or mutations.
import {pathToFileURL} from 'node:url';

const PRODUCTION_DATABASE='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const flag=x=>typeof x==='boolean'?x:null;
const sample=x=>Number.isFinite(x)&&x>=0&&x<=1?x:null;
const fail=code=>{throw new Error('ops_metadata_'+code)};

export async function collectProductionOperationsMetadata({accountId,token,databaseId,sourceSha,fetchImpl=globalThis.fetch}={}){
  if(!/^[a-f0-9]{32}$/i.test(accountId??'')||typeof token!=='string'||!token.trim()||
     databaseId!==PRODUCTION_DATABASE||!/^[a-f0-9]{40}$/.test(sourceSha??''))fail('invalid_inputs');
  async function get(stage,path){
    let httpStatus;
    let providerCodes=[];
    try{
      const response=await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`,{
        method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),
        headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}
      });
      if(Number.isInteger(response.status)&&response.status>=100&&response.status<=599)httpStatus=response.status;
      const text=await response.text();
      if(text.length>1024*1024)fail('provider');
      const body=JSON.parse(text);
      if(Array.isArray(body?.errors))providerCodes=body.errors.map(e=>e?.code).filter(n=>Number.isSafeInteger(n)&&n>=0&&n<=999999).slice(0,10);
      if(!response.ok||body?.success!==true||!record(body.result))fail('provider');
      return body.result;
    }catch{
      const error=new Error('ops_metadata_'+stage+'_unavailable');
      error.diagnostic={stage,...(httpStatus===undefined?{}:{httpStatus}),providerCodes};
      throw error;
    }
  }
  const database=await get('database',`/d1/database/${PRODUCTION_DATABASE}`);
  if(database.uuid!==PRODUCTION_DATABASE||database.name!=='bw-compliance-os')fail('database_identity');
  const settings=await get('settings','/workers/scripts/bw-compliance-os/script-settings');
  const history=await get('deployments','/workers/scripts/bw-compliance-os/deployments');
  if(!Array.isArray(history.deployments)||!history.deployments.length||history.deployments.length>100)fail('deployments_invalid');
  const deployments=history.deployments.map(row=>{
    if(!UUID.test(row?.id??'')||!Number.isFinite(Date.parse(row?.created_on))||
       !Array.isArray(row?.versions)||!row.versions.length||row.versions.length>100)fail('deployments_invalid');
    const versions=row.versions.map(v=>{
      if(!UUID.test(v?.version_id??'')||!Number.isFinite(v.percentage)||v.percentage<0||v.percentage>100)fail('deployments_invalid');
      return {id:v.version_id,percentage:v.percentage};
    });
    if(Math.abs(versions.reduce((n,v)=>n+v.percentage,0)-100)>0.001)fail('deployments_invalid');
    return {id:row.id,createdAt:new Date(row.created_on).toISOString(),versions};
  });
  const recovery=await get('bookmark',`/d1/database/${PRODUCTION_DATABASE}/time_travel/bookmark`);
  if(typeof recovery.bookmark!=='string'||!recovery.bookmark.trim()||recovery.bookmark.length>512)fail('bookmark_invalid');
  const bucket=await get('bucket','/r2/buckets/bw-compliance-evidence');
  if(bucket.name!=='bw-compliance-evidence')fail('bucket_identity');
  const logs=settings.observability?.logs;
  return {
    schema:1,scope:'production_metadata_only',collectorSha:sourceSha,collectedAt:new Date().toISOString(),
    worker:{name:'bw-compliance-os',observabilityEnabled:flag(settings.observability?.enabled),logpushEnabled:flag(settings.logpush),
      logging:{enabled:flag(logs?.enabled),invocationLogs:flag(logs?.invocation_logs),samplingRate:sample(logs?.head_sampling_rate),
        destinationCount:Array.isArray(logs?.destinations)?logs.destinations.length:null},
      deployments:deployments.slice(0,10),deploymentHistoryTruncated:deployments.length>10},
    database:{name:'bw-compliance-os',identityVerified:true,storageVersion:database.version==='production'?'production':'unknown',
      sizeBytes:Number.isSafeInteger(database.file_size)&&database.file_size>=0?database.file_size:null,timeTravelBookmarkAvailable:true},
    evidenceBucket:{name:'bw-compliance-evidence',identityVerified:true},
    alertDeliveryVerified:false,recoveryRehearsalVerified:false,rollbackRehearsalVerified:false,
    operationalAcceptance:'not_established'
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const report=await collectProductionOperationsMetadata({
      accountId:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_API_TOKEN,
      databaseId:process.env.D1_DATABASE_ID,sourceSha:process.env.EXPECTED_SHA
    });
    console.log(JSON.stringify(report,null,2));
  }catch(error){
    console.error(/^ops_metadata_[a-z_]+$/.test(error?.message)?error.message:'ops_metadata_failed');
    if(error?.diagnostic)console.error(JSON.stringify(error.diagnostic));
    process.exitCode=1;
  }
}
