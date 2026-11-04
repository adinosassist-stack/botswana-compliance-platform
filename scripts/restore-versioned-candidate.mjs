// Protected isolated SQL import. No promotion, production restore, deletion or retry.
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {inspectBackup} from './isolated-operations-rehearsal.mjs';
import {inspectCandidateRetentionPolicy} from './check-private-backup-retention-readonly.mjs';

export const VERSIONED_RESTORE=Object.freeze({account:'ddd23cab31928a4bb3d4998df9b26d1d',
 target:'be15acba-ba16-4704-9498-e296a164b3a2',name:'bw-compliance-os-ops-restore-candidate-20261103',
 bucket:'bw-compliance-ops-backups',key:'candidates/41892086437/1/production-d1.sql',bytes:3277137,
 sha256:'e7736aebb9ddfabd378a0f198563dc9d9e127ff5cb9eaedff02237f58a4747e5'});
const C=VERSIONED_RESTORE,REPO='adinosassist-stack/botswana-compliance-platform';
const fail=code=>{throw Error('versioned_restore_'+code)};
const hash=b=>createHash('sha256').update(b).digest('hex');
const EMPTY="SELECT COUNT(*) AS n FROM sqlite_schema WHERE substr(name,1,7) != 'sqlite_' AND name != '_cf_KV'";
const TABLES="SELECT name FROM sqlite_schema WHERE type='table' AND substr(name,1,7) != 'sqlite_' AND name != '_cf_KV' ORDER BY name";
export function approvalContract(sourceSha){
 if(typeof sourceSha!=='string'||!/^[a-f0-9]{40}$/.test(sourceSha))fail('revision');
 return {scope:'IMPORT_VERSIONED_BACKUP_INTO_ISOLATED_D1_ONCE',sourceSha,target:C.target,
 candidateSha256:C.sha256,candidateBytes:C.bytes,retentionAndAccessAccepted:true};
}
export function verifyApprovalRecord(record,author,sourceSha){
 const prefix='THEBE_VERSIONED_RESTORE_APPROVAL\n';
 if(record?.user?.login!==author||record.issue_url!==`https://api.github.com/repos/${REPO}/issues/1950`||
    typeof record.body!=='string'||!record.body.startsWith(prefix))fail('approval_record');
 let body;try{body=JSON.parse(record.body.slice(prefix.length))}catch{fail('approval_record')}
 const expected=approvalContract(sourceSha),keys=Object.keys(expected);
 if(!body||Array.isArray(body)||Object.keys(body).length!==keys.length||keys.some(k=>body[k]!==expected[k]))fail('approval_scope');
 return true;
}
export async function readPinnedCandidateResponse(response){
 if(response.status!==200||!response.body){await response.body?.cancel();fail('download_refused')}
 const size=response.headers.get('content-length');
 if(size!==null&&size!==String(C.bytes)){await response.body.cancel();fail('candidate_mismatch')}
 const reader=response.body.getReader(),parts=[];let bytes=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;
   if(bytes>C.bytes)fail('candidate_mismatch');parts.push(Buffer.from(value));}
 }finally{await reader.cancel()}
 if(bytes!==C.bytes)fail('candidate_mismatch');return Buffer.concat(parts,bytes);
}
export async function verifyVersionedInventory(query,counts){
 const expected=Object.keys(counts);
 if(!expected.length||expected.some(n=>!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(n)||!Number.isSafeInteger(counts[n])||counts[n]<0))fail('inventory');
 const tables=(await query(TABLES)).map(r=>r.name);
 if(JSON.stringify(tables)!==JSON.stringify(expected))fail('table_set');
 for(const name of expected){
   const rows=await query(`SELECT COUNT(*) AS n FROM "${name}"`);
   if(rows.length!==1||rows[0].n!==counts[name])fail('row_counts');
 }
 if((await query('PRAGMA foreign_key_check')).length)fail('foreign_keys');
 return tables.length;
}
export async function executeVersionedImport(adapter,{sourceSha,ownerRecord,independentRecord}={}){
 approvalContract(sourceSha);
 verifyApprovalRecord(ownerRecord,'adinosassist-stack',sourceSha);
 verifyApprovalRecord(independentRecord,'thusico',sourceSha);
 if(!Number.isSafeInteger(ownerRecord.id)||!Number.isSafeInteger(independentRecord.id)||ownerRecord.id===independentRecord.id)fail('approval_identity');
 await adapter.checkIsolation();
 const empty=async()=>{const rows=await adapter.query(EMPTY);if(rows.length!==1||rows[0].n!==0)fail('target_not_empty')};
 await empty();
 const bytes=await adapter.downloadCandidate();
 if(!Buffer.isBuffer(bytes)||bytes.length!==C.bytes||hash(bytes)!==C.sha256)fail('candidate_mismatch');
 let sql;try{sql=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{fail('encoding')}
 const inventory=inspectBackup(sql);
 await adapter.checkIsolation();
 await empty(); // Exclude all other writers: this is not an atomic lock.
 const started=Date.now();
 await adapter.importSql(bytes); // Exactly once. Never retry, reset or auto-clean a partial import.
 const tableCount=await verifyVersionedInventory(adapter.query,inventory.counts);
 return {kind:'isolated_versioned_sql_import',sourceSha,targetDatabaseId:C.target,
 candidateSha256:C.sha256,sqlImportPerformed:true,tableSetMatched:true,rowCountsMatched:true,
 foreignKeyViolations:0,tableCount,importAndVerificationMs:Date.now()-started,
 approvals:{ownerCommentId:ownerRecord.id,independentCommentId:independentRecord.id},
 retentionAcceptance:'operator_and_independent_attested',objectEnforcementObserved:false,
 tenantRecoveryAccepted:false,sustainedRpoAccepted:false,productionWriteAuthorized:false,
 productionRecoveryAccepted:false,disposition:'HOLD_FOR_APPLICATION_RECOVERY_AND_RELEASE_ACCEPTANCE'};
}

export async function runVersionedImport(env=process.env){
 const sourceSha=env.EXPECTED_SHA;
 approvalContract(sourceSha);
 if(env.GITHUB_REPOSITORY!==REPO||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_REF!=='refs/heads/main'||
 env.GITHUB_SHA!==sourceSha||env.REHEARSAL_MODE!=='RESTORE_VERSIONED_CANDIDATE'||
 env.REHEARSAL_ISOLATION_APPROVAL!=='ISOLATED_REHEARSAL_ONLY'||env.OPERATIONS_REHEARSAL_ACCOUNT_ID!==C.account||
 !env.PRIVATE_BACKUP_CLOUDFLARE_TOKEN?.trim()||!env.GH_TOKEN?.trim()||
 !/^[1-9][0-9]{0,14}$/.test(env.VERSIONED_OWNER_APPROVAL_ID??'')||
 !/^[1-9][0-9]{0,14}$/.test(env.VERSIONED_REVIEW_APPROVAL_ID??'')||
 env.VERSIONED_OWNER_APPROVAL_ID===env.VERSIONED_REVIEW_APPROVAL_ID)fail('authority');
 // Real authenticated GitHub records, not caller-asserted review flags.
 async function gh(path){
   const r=await fetch(`https://api.github.com/repos/${REPO}${path}`,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${env.GH_TOKEN}`,Accept:'application/vnd.github+json'}});
   if(!r.ok)fail('github_unavailable');return r.json();
 }
 const main=await gh('/git/ref/heads/main');if(main.object?.sha!==sourceSha)fail('stale_revision');
 const ownerRecord=await gh(`/issues/comments/${env.VERSIONED_OWNER_APPROVAL_ID}`);
 const independentRecord=await gh(`/issues/comments/${env.VERSIONED_REVIEW_APPROVAL_ID}`);
 verifyApprovalRecord(ownerRecord,'adinosassist-stack',sourceSha);verifyApprovalRecord(independentRecord,'thusico',sourceSha);
 const dir=mkdtempSync(join(tmpdir(),'thebe-versioned-restore-')),exec=promisify(execFile);
 try{
   const config=join(dir,'wrangler.json'),file=join(dir,'candidate.sql');
   writeFileSync(config,JSON.stringify({name:C.name,account_id:C.account,compatibility_date:'2026-09-03',d1_databases:[{binding:'ISOLATED_RESTORE',database_name:C.name,database_id:C.target}]}),{mode:0o600});
   const processEnv={PATH:env.PATH,HOME:env.HOME,TMPDIR:dir,WRANGLER_SEND_METRICS:'false',CLOUDFLARE_API_TOKEN:env.PRIVATE_BACKUP_CLOUDFLARE_TOKEN,CLOUDFLARE_ACCOUNT_ID:C.account};
   async function wrangler(args){
     try{await exec(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),...args,'--config',config],{env:processEnv,timeout:120000,maxBuffer:8*1024*1024});}
     catch{fail('transport_failed_inspect_before_retry')}
   }
   async function cf(path,method='GET',body){
     const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${C.account}${path}`,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${env.PRIVATE_BACKUP_CLOUDFLARE_TOKEN}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
     let data;try{data=await r.json()}catch{fail('provider_unavailable')}
     if(!r.ok||data?.success!==true)fail('provider_unavailable');return data;
   }
   const query=async sql=>{const d=await cf(`/d1/database/${C.target}/query`,'POST',{sql,params:[]});
     if(d.result?.length!==1||d.result[0].success!==true||d.result[0].meta?.rows_written!==0||!Array.isArray(d.result[0].results))fail('query_unconfirmed');return d.result[0].results;};
   const checkIsolation=async()=>{
     if((await gh('/git/ref/heads/main')).object?.sha!==sourceSha)fail('stale_revision');
     verifyApprovalRecord(await gh(`/issues/comments/${env.VERSIONED_OWNER_APPROVAL_ID}`),'adinosassist-stack',sourceSha);
     verifyApprovalRecord(await gh(`/issues/comments/${env.VERSIONED_REVIEW_APPROVAL_ID}`),'thusico',sourceSha);
     const db=(await cf(`/d1/database/${C.target}`)).result;if(db?.uuid!==C.target||db?.name!==C.name)fail('target_identity');
     const managed=(await cf(`/r2/buckets/${C.bucket}/domains/managed`)).result;
     const domains=(await cf(`/r2/buckets/${C.bucket}/domains/custom`)).result;
     if(managed?.enabled!==false||!Array.isArray(domains?.domains)||domains.domains.length!==0)fail('bucket_not_private');
     inspectCandidateRetentionPolicy(await cf(`/r2/buckets/${C.bucket}/lock`));
     const scripts=(await cf('/workers/scripts')).result;if(!Array.isArray(scripts))fail('worker_inventory');
     for(const w of scripts){if(typeof w.id!=='string'||!/^[a-z0-9_][a-z0-9_-]*$/.test(w.id))fail('worker_inventory');
       const bindings=(await cf(`/workers/scripts/${w.id}/settings`)).result?.bindings;
       if(!Array.isArray(bindings)||bindings.some(b=>b.type==='d1'&&(b.database_id??b.id)===C.target))fail('target_exposed');}
   };
   return await executeVersionedImport({query,checkIsolation,
     downloadCandidate:async()=>{const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${C.account}/r2/buckets/${C.bucket}/objects/${C.key}`,{method:'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${env.PRIVATE_BACKUP_CLOUDFLARE_TOKEN}`}});
       const bytes=await readPinnedCandidateResponse(r);writeFileSync(file,bytes,{mode:0o600});return bytes},
     importSql:async bytes=>{if(hash(readFileSync(file))!==hash(bytes))fail('local_candidate_changed');await wrangler(['d1','execute','ISOLATED_RESTORE','--remote','--file',file,'--yes'])}
   },{sourceSha,ownerRecord,independentRecord});
 }finally{rmSync(dir,{recursive:true,force:true})}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 process.umask(0o077);
 try{console.log(JSON.stringify(await runVersionedImport(),null,2))}
 catch{console.error('versioned_restore_failed_HOLD_inspect_before_retry');process.exitCode=1}
}
