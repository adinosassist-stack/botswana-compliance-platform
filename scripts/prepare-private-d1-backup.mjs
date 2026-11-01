import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const ACCOUNT='ddd23cab31928a4bb3d4998df9b26d1d';
const DB='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
const BUCKET='bw-compliance-ops-backups';
const LIMIT=25*1024*1024;
const hash=b=>createHash('sha256').update(b).digest('hex');
const stop=code=>{throw new Error('private_backup_'+code)};
export async function boundedBytes(response,limit=LIMIT){
  if(!response.ok)stop('download_refused');
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>limit))stop('size_limit');
  if(!response.body)stop('empty_download');
  const reader=response.body.getReader(),parts=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)stop('size_limit');parts.push(Buffer.from(value));}}
  finally{await reader.cancel().catch(()=>{});}
  if(!size)stop('empty_download');
  return Buffer.concat(parts);
}
export function validateExportUrl(value){
  let u;try{u=new URL(value)}catch{stop('export_url')}
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||
     !/^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(u.hostname))stop('export_url');
  return u.href;
}
export async function prepareBackup(e,{fetchImpl=fetch,pause=ms=>new Promise(r=>setTimeout(r,ms)),assertCurrent=async()=>{}}={}){
  if(e.GITHUB_REPOSITORY!=='adinosassist-stack/botswana-compliance-platform'||e.GITHUB_REF!=='refs/heads/main'||
     e.GITHUB_EVENT_NAME!=='workflow_dispatch'||e.BACKUP_CONFIRM!=='PREPARE_PRIVATE_PRODUCTION_BACKUP'||
     !/^[a-f0-9]{40}$/.test(e.EXPECTED_SHA||'')||e.EXPECTED_SHA!==e.GITHUB_SHA||
     e.PRIVATE_BACKUP_ACCOUNT_ID!==ACCOUNT||!e.PRIVATE_BACKUP_CLOUDFLARE_TOKEN?.trim()||
     !/^[1-9]\d*$/.test(e.GITHUB_RUN_ID||'')||!/^[1-9]\d*$/.test(e.GITHUB_RUN_ATTEMPT||''))stop('authority');
  const root=`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;
  const request=async(path,method='GET',body)=>{
    const r=await fetchImpl(root+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),
      headers:{Authorization:`Bearer ${e.PRIVATE_BACKUP_CLOUDFLARE_TOKEN}`,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{})});
    if(!r.ok)stop('provider_refused');
    let d;try{d=await r.json()}catch{stop('provider_response')}
    if(d.success!==true)stop('provider_refused');return d.result;
  };
  const managed=await request(`/r2/buckets/${BUCKET}/domains/managed`);
  const custom=await request(`/r2/buckets/${BUCKET}/domains/custom`);
  if(managed?.enabled!==false||!Array.isArray(custom?.domains)||custom.domains.length)stop('bucket_public');
  const metadata=await request(`/d1/database/${DB}`);
  if(metadata?.uuid!==DB||metadata.name!=='bw-compliance-os')stop('database_identity');
  await assertCurrent();
  let result=await request(`/d1/database/${DB}/export`,'POST',{output_format:'polling'});
  for(let i=0;result?.status==='active'&&i<60;i++){
    if(typeof result.at_bookmark!=='string'||!result.at_bookmark)stop('export_bookmark');
    await pause(1000);
    result=await request(`/d1/database/${DB}/export`,'POST',{output_format:'polling',current_bookmark:result.at_bookmark});
  }
  if(result?.status!=='complete')stop('export_incomplete');
  // The signed URL is never logged, persisted, or given the API bearer credential.
  const url=validateExportUrl(result.result?.signed_url);
  const bytes=await boundedBytes(await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(60000)}));
  try{new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{stop('export_encoding')}
  const sha256=hash(bytes),key=`candidates/${e.GITHUB_RUN_ID}/${e.GITHUB_RUN_ATTEMPT}/production-d1.sql`;
  const target=root+`/r2/buckets/${BUCKET}/objects/`+key;
  const headers={Authorization:`Bearer ${e.PRIVATE_BACKUP_CLOUDFLARE_TOKEN}`};
  const existing=await fetchImpl(target,{headers,redirect:'error',signal:AbortSignal.timeout(30000)});
  await existing.body?.cancel();
  if(existing.status!==404)stop('candidate_exists_or_unverifiable');
  await assertCurrent();
  // This key is a candidate, never the restore runner's approved input key.
  const upload=await fetchImpl(target,{method:'PUT',headers:{...headers,'Content-Type':'application/sql'},
    body:bytes,redirect:'error',signal:AbortSignal.timeout(60000)});
  if(!upload.ok)stop('upload_refused');
  let uploaded;try{uploaded=await upload.json()}catch{stop('upload_unconfirmed')}
  if(uploaded.success!==true)stop('upload_unconfirmed');
  const roundtrip=await boundedBytes(await fetchImpl(target,{headers,redirect:'error',signal:AbortSignal.timeout(60000)}));
  if(hash(roundtrip)!==sha256)stop('roundtrip_mismatch');
  return {kind:'private_production_backup_candidate',sourceSha:e.EXPECTED_SHA,sourceDatabase:DB,
    candidateKey:key,bytes:bytes.length,sha256,exportBookmark:result.at_bookmark,
    privateRoundtripVerified:true,backupIndependentlyApproved:false,restorePerformed:false,
    productionDataOrSchemaWritten:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const assertCurrent=async()=>{
      const r=await fetch(`https://api.github.com/repos/adinosassist-stack/botswana-compliance-platform/git/ref/heads/main`,
        {headers:{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`},redirect:'error',signal:AbortSignal.timeout(30000)});
      if(!r.ok||(await r.json()).object?.sha!==process.env.EXPECTED_SHA)stop('main_drift');
    };
    console.log(JSON.stringify(await prepareBackup(process.env,{assertCurrent})));
  }catch{console.error('private_backup_failed_inspect_candidate_before_retry');process.exitCode=1;}
}
