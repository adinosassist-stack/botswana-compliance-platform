import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {boundedBytes} from './prepare-private-d1-backup.mjs';
import {inspectBackup} from './isolated-operations-rehearsal.mjs';
const ACCOUNT='ddd23cab31928a4bb3d4998df9b26d1d';
const PREFIX='candidates/41348652986/2/';
export const CANDIDATE_HASHES=Object.freeze({
  sql:'0eee6ff0bb1a99c61946b6840b1e295e8c40ba9ccd75aa01f3063c7350e50e6b',
  sample:'2d0aacd4d64ae5edbea558b0da15ff8edcd40966907b10574fa601ce6f25200d'
});
const hash=b=>createHash('sha256').update(b).digest('hex');
export function qualifyPayloads(sql,sample,expected){
  if(!Buffer.isBuffer(sql)||!Buffer.isBuffer(sample)||!sql.length||sql.length>25*1024*1024||
     !sample.length||sample.length>10*1024*1024)throw Error('candidate_size');
  if(!/^[a-f0-9]{64}$/.test(expected?.sql||'')||!/^[a-f0-9]{64}$/.test(expected?.sample||'')||
     hash(sql)!==expected.sql||hash(sample)!==expected.sample)throw Error('candidate_hash');
  const decoded=new TextDecoder('utf-8',{fatal:true}).decode(sql);
  const inventory=inspectBackup(decoded);
  return {kind:'private_backup_integrity_qualification',backupSha256:expected.sql,objectSha256:expected.sample,
    sqlBytes:sql.length,sampleBytes:sample.length,tableCount:inventory.tableCount,
    rowCountsSha256:hash(JSON.stringify(inventory.counts)),sqliteIntegrityPassed:true,foreignKeyViolations:0,
    productionDataWritten:false,remoteMutationsPerformed:false,restorePerformed:false,
    independentlyApproved:false,retentionGuaranteed:false};
}
export async function qualifyCandidates(e,{fetchImpl=fetch}={}){
  if(e.GITHUB_REPOSITORY!=='adinosassist-stack/botswana-compliance-platform'||e.GITHUB_REF!=='refs/heads/main'||
     e.GITHUB_EVENT_NAME!=='workflow_dispatch'||e.QUALIFY_CONFIRM!=='QUALIFY_PRIVATE_BACKUP_CANDIDATES'||
     !/^[a-f0-9]{40}$/.test(e.EXPECTED_SHA||'')||e.EXPECTED_SHA!==e.GITHUB_SHA||
     e.PRIVATE_BACKUP_ACCOUNT_ID!==ACCOUNT||!e.PRIVATE_BACKUP_CLOUDFLARE_TOKEN?.trim()||!e.GITHUB_TOKEN?.trim())throw Error('candidate_authority');
  const main=await fetchImpl('https://api.github.com/repos/adinosassist-stack/botswana-compliance-platform/git/ref/heads/main',
    {headers:{Authorization:`Bearer ${e.GITHUB_TOKEN}`},redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!main.ok||(await main.json()).object?.sha!==e.EXPECTED_SHA)throw Error('candidate_main_drift');
  const root=`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/bw-compliance-ops-backups`;
  const get=path=>fetchImpl(root+path,{method:'GET',headers:{Authorization:`Bearer ${e.PRIVATE_BACKUP_CLOUDFLARE_TOKEN}`},
    redirect:'error',signal:AbortSignal.timeout(60000)});
  for(const [path,valid] of [['/domains/managed',x=>x?.enabled===false],['/domains/custom',x=>Array.isArray(x?.domains)&&x.domains.length===0]]){
    const r=await get(path);if(!r.ok)throw Error('candidate_privacy_unverified');
    const d=await r.json();if(d.success!==true||!valid(d.result))throw Error('candidate_bucket_public');
  }
  const sql=await boundedBytes(await get('/objects/'+PREFIX+'production-d1.sql'));
  const sample=await boundedBytes(await get('/objects/'+PREFIX+'production-r2-sample.bin'),10*1024*1024);
  return {...qualifyPayloads(sql,sample,CANDIDATE_HASHES),sourceSha:e.EXPECTED_SHA,candidatePrefix:PREFIX};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{console.log(JSON.stringify(await qualifyCandidates(process.env)));}
  catch{console.error('private_backup_integrity_failed_no_data_logged');process.exitCode=1;}
}
