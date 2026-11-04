// Privileged read-only verifier for exactly three versioned production backup candidates.
// Never logs SQL/data, creates objects, grants backup acceptance, or restores a database.
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {boundedBytes} from './prepare-private-d1-backup.mjs';
import {inspectBackup} from './isolated-operations-rehearsal.mjs';
const ACCOUNT='ddd23cab31928a4bb3d4998df9b26d1d';
const BUCKET='bw-compliance-ops-backups';
export const CANDIDATE_SIZES=Object.freeze({
 '41709222476':3224706,
 '41710740133':3225845,
 '41892086437':3277137
});
const fail=code=>{throw Error('versioned_r2_readonly_hold_'+code)};
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function verifyVersionedR2Candidate(env,{fetchImpl=fetch}={}){
 if(env.GITHUB_REPOSITORY!=='adinosassist-stack/botswana-compliance-platform'||
 env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_REF!=='refs/heads/main'||
 env.VERSIONED_CONFIRM!=='QUALIFY_PRIVATE_BACKUP_CANDIDATES'||
 !/^[a-f0-9]{40}$/.test(env.EXPECTED_SHA||'')||env.EXPECTED_SHA!==env.GITHUB_SHA||
 env.PRIVATE_BACKUP_ACCOUNT_ID!==ACCOUNT||!env.PRIVATE_BACKUP_CLOUDFLARE_TOKEN?.trim()||
 !Object.hasOwn(CANDIDATE_SIZES,env.VERSIONED_RUN_ID))fail('authority');
 const key=`candidates/${env.VERSIONED_RUN_ID}/1/production-d1.sql`;
 const base=`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}`;
 const get=path=>fetchImpl(base+path,{method:'GET',redirect:'error',signal:AbortSignal.timeout(60000),
  headers:{Authorization:`Bearer ${env.PRIVATE_BACKUP_CLOUDFLARE_TOKEN}`}});
 const managed=await get('/domains/managed');
 const custom=await get('/domains/custom');
 if(!managed.ok||!custom.ok)fail('bucket_privacy_unverified');
 let m,c;try{m=await managed.json();c=await custom.json()}catch{fail('bucket_privacy_unverified')}
 if(m.success!==true||m.result?.enabled!==false||c.success!==true||
 !Array.isArray(c.result?.domains)||c.result.domains.length)fail('bucket_privacy_unverified');
 // Read policy only; rule presence does not independently prove retained bytes.
 let retention;try{const response=await get('/lock');if(!response.ok)fail('bucket_lock_unverified');retention=await response.json()}catch{fail('bucket_lock_unverified')}
 if(retention.success!==true||!Array.isArray(retention.result?.rules))fail('bucket_lock_unverified');
 const observedLockRules=retention.result.rules.length;
 let bytes;try{bytes=await boundedBytes(await get('/objects/'+key))}catch{fail('private_object_unreadable')}
 if(bytes.length!==CANDIDATE_SIZES[env.VERSIONED_RUN_ID])fail('observed_size_mismatch');
 const digest=sha(bytes);
 let sql;try{sql=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{fail('invalid_utf8')}
 let inventory;try{inventory=inspectBackup(sql)}catch{fail('sqlite_integrity')}
 return {kind:'protected_versioned_candidate_bytes_readonly',candidateKey:key,
  bytes:bytes.length,sha256:digest,tableCount:inventory.tableCount,
  rowCountsSha256:sha(JSON.stringify(inventory.counts)),
  sqliteIntegrityPassed:true,foreignKeyViolations:0,
  originalProtectedReceiptAuthenticated:false,exportBookmarkIndependentlyVerified:false,
  observedLockRules,retentionRulesPresent:observedLockRules>0,
  rpoApproved:false,retentionEnforced:false,representativeR2ObjectVerified:false,
  independentRestoreApproval:false,restoreExecuted:false,productionWriteAuthorized:false,
  disposition:'HOLD_PROVENANCE_RETENTION_AND_INDEPENDENT_RESTORE_APPROVAL_REQUIRED'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  // No SQL, tokens, URLs or raw exception messages are ever emitted.
  console.log(JSON.stringify(await verifyVersionedR2Candidate(process.env)));
 }catch{console.error('versioned_r2_readonly_qualification_failed_no_data_logged');process.exitCode=2}
}
