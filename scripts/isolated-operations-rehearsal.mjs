// Dedicated non-production resources only. Never downloads from production.
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const blockedIds=['8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce','20c0d37e-552e-438f-a56d-3f12c27d38e2'];
const worker='bw-compliance-os-ops-rehearsal',backups='bw-compliance-ops-backups',objects='bw-compliance-ops-restore';
const sha=data=>createHash('sha256').update(data).digest('hex');
class RehearsalError extends Error {}
const fail=code=>{throw new RehearsalError('rehearsal_'+code)};
const approval=x=>typeof x==='string'&&/^[A-Za-z0-9_.:/#-]{3,240}$/.test(x);
const EMPTY="SELECT COUNT(*) AS object_count FROM sqlite_schema WHERE substr(name,1,7) != 'sqlite_' AND name != '_cf_KV'";
const SCHEMA="SELECT type,name,sql FROM sqlite_schema WHERE substr(name,1,7) != 'sqlite_' AND name != '_cf_KV' ORDER BY type,name";

export function validateRehearsal(o){
  if(!['PREFLIGHT_ONLY','PREFLIGHT_WORKER','RESTORE_APPROVED_BACKUP','ROLLBACK_REHEARSAL_WORKER','ALERT_PROBE'].includes(o.mode)||
     !/^[a-f0-9]{32}$/i.test(o.accountId??'')||!UUID.test(o.databaseId??'')||blockedIds.includes(o.databaseId.toLowerCase())||
     typeof o.token!=='string'||!o.token.trim()||!/^[a-f0-9]{40}$/.test(o.sourceSha??'')||!UUID.test(o.runId??'')||
     o.isolationApproval!=='ISOLATED_REHEARSAL_ONLY')fail('invalid_authority');
  return {databaseName:['PREFLIGHT_WORKER','ROLLBACK_REHEARSAL_WORKER','ALERT_PROBE'].includes(o.mode)?worker:'bw-compliance-os-ops-restore'};
}

export function verifyPrivateBucket(managed,custom){
  if(managed?.enabled!==false||!Array.isArray(custom?.domains)||custom.domains.some(x=>x?.enabled!==false))fail('bucket_not_private');
}

export function inspectBackup(sql){
  if(sql.includes('\0'))fail('backup_rejected');
  // Ignore quoted values/identifiers and comments before rejecting filesystem SQL.
  const code=sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|--[^\n]*|\/\*[\s\S]*?\*\//g,' ');
  if(/\b(ATTACH|DETACH|VACUUM|load_extension|writable_schema|temp_store_directory|data_store_directory)\b/i.test(code))fail('backup_rejected');
  const db=new DatabaseSync(':memory:',{allowExtension:false});
  try{
    db.exec('PRAGMA foreign_keys=ON;');db.exec(sql);
    if(db.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)fail('backup_integrity');
    const tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND substr(name,1,7) != 'sqlite_' AND name != '_cf_KV' ORDER BY name").all().map(x=>x.name);
    if(!tables.length||tables.length>500||tables.some(x=>!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(x)))fail('backup_schema');
    const counts=Object.fromEntries(tables.map(name=>[name,db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n]));
    for(const name of ['tenants','users','memberships','sessions','audit_events','evidence'])if(!Object.hasOwn(counts,name))fail('backup_schema');
    if(counts.tenants<1||counts.users<1)fail('backup_data_missing');
    return {counts,tableCount:tables.length};
  }catch(e){if(e instanceof RehearsalError)throw e;fail('backup_rejected')}
  finally{db.close()}
}

export async function restoreBackup(a,o){
  validateRehearsal({...o,mode:'RESTORE_APPROVED_BACKUP'});
  if(!HASH.test(o.backupHash??'')||!HASH.test(o.objectHash??'')||!approval(o.backupApproval))fail('backup_approval_required');
  const empty=async()=>{const rows=await a.query(EMPTY);if(rows.length!==1||rows[0].object_count!==0)fail('restore_requires_empty')};
  await empty();
  const sql=await a.download('approved-d1-backup.sql');
  const sample=await a.download('approved-r2-sample.bin');
  if(sql.length>25*1024*1024||sample.length>10*1024*1024||sample.length<1)fail('backup_size');
  if(sha(sql)!==o.backupHash||sha(sample)!==o.objectHash)fail('backup_checksum');
  let decoded;
  try{decoded=new TextDecoder('utf-8',{fatal:true}).decode(sql)}catch{fail('backup_encoding')}
  const inventory=inspectBackup(decoded);
  await empty(); // Distinct from import: operators must exclude concurrent writers.
  await a.importSql(sql);
  const names=Object.keys(inventory.counts);
  const rows=await a.query(names.map(name=>`SELECT '${name}' AS name,COUNT(*) AS n FROM "${name}"`).join(' UNION ALL '));
  const counts=Object.fromEntries(rows.map(x=>[x.name,x.n]));
  if(rows.length!==names.length||names.some(n=>counts[n]!==inventory.counts[n]))fail('restore_counts');
  if((await a.query('PRAGMA foreign_key_check')).length)fail('restore_foreign_keys');
  const key=`rehearsals/${o.runId}/sample.bin`;
  await a.putObject(key,sample);
  if(sha(await a.getObject(key))!==o.objectHash)fail('restored_object_checksum');
  return {scope:'isolated_backup_restore',rowCountsMatched:true,foreignKeyViolations:0,tableCount:names.length,
    objectBytesMatched:true,backupSha256:o.backupHash,objectSha256:o.objectHash,backupProvenance:'operator_attested',
    tenantIsolationAcceptanceVerified:false,productionRecoveryAccepted:false};
}

function checkBindings(bindings,databaseId){
  if(!Array.isArray(bindings))fail('worker_bindings');
  const db=bindings.filter(x=>x.type==='d1');
  if(db.length!==1||(db[0].database_id??db[0].id)!==databaseId)fail('worker_bindings');
  for(const b of bindings){
    if(b.type==='r2_bucket'&&b.bucket_name!=='bw-compliance-ops-evidence')fail('worker_bindings');
    if(!['d1','r2_bucket','plain_text','secret_text','version_metadata','ai'].includes(b.type))fail('worker_bindings');
    if(b.type==='plain_text'&&b.name==='APP_ENV'&&b.text!=='rehearsal')fail('worker_bindings');
  }
  if(!bindings.some(x=>x.type==='plain_text'&&x.name==='APP_ENV'&&x.text==='rehearsal'))fail('worker_bindings');
}

export async function rollbackWorker(a,o){
  validateRehearsal({...o,mode:'ROLLBACK_REHEARSAL_WORKER'});
  if(!UUID.test(o.versionId??'')||!UUID.test(o.currentVersionId??'')||o.versionId===o.currentVersionId||
     !HASH.test(o.schemaHash??'')||!approval(o.compatibilityApproval))fail('rollback_approval_required');
  const version=await a.version(o.versionId);if(version?.id!==o.versionId)fail('rollback_version');
  checkBindings(version.resources?.bindings,o.databaseId);
  const history=await a.deployments();
  const current=history.deployments?.[0]?.versions;
  if(!Array.isArray(current)||current.length!==1||current[0].version_id!==o.currentVersionId||current[0].percentage!==100||
     !history.deployments.some(d=>d.versions?.length===1&&d.versions[0].version_id===o.versionId&&d.versions[0].percentage===100))fail('rollback_history');
  if(await a.schemaHash()!==o.schemaHash)fail('schema_compatibility');
  const body={strategy:'percentage',versions:[{version_id:o.versionId,percentage:100}]};
  const deployed=await a.deploy(body);
  if(deployed.versions?.length!==1||deployed.versions[0].version_id!==o.versionId||deployed.versions[0].percentage!==100)fail('rollback_unconfirmed');
  const active=(await a.deployments()).deployments?.[0]?.versions;
  if(active?.length!==1||active[0].version_id!==o.versionId||active[0].percentage!==100)fail('rollback_unconfirmed');
  if(await a.schemaHash()!==o.schemaHash||await a.smoke()!==true)fail('rollback_smoke');
  return {scope:'isolated_worker_rollback',stagedRollbackVerified:true,versionId:o.versionId,schemaUnchanged:true,
    authenticatedTenantAcceptanceVerified:false,productionRollbackAccepted:false};
}

export async function probeAlerts(a,o){
  validateRehearsal({...o,mode:'ALERT_PROBE'});
  if(!approval(o.alertApproval))fail('alert_approval_required');
  if(await a.enableLogs()!==true)fail('logging_unconfirmed');
  const status=await a.probe(o.runId);
  if(status!==503)fail('expected_controlled_failure');
  return {scope:'isolated_alert_probe',probeId:o.runId,probeStatus:status,alertDeliveryVerified:false,
    requires:'independent receipt at the pre-approved alert destination'};
}

export async function runIsolatedRehearsal(o,{fetchImpl=globalThis.fetch}={}){
  const {databaseName}=validateRehearsal(o);
  const exec=promisify(execFile),root=resolve('.');
  const scratch=mkdtempSync(join(tmpdir(),'thebe-ops-rehearsal-'));
  try{
    // Only fixed, source-controlled labels may be included in operator logs.
    const r2Diagnostics=new Map([backups,objects,'bw-compliance-ops-evidence'].flatMap(bucket=>[
      [`/r2/buckets/${bucket}`,{bucket,operation:'bucket_metadata'}],
      [`/r2/buckets/${bucket}/domains/managed`,{bucket,operation:'managed_domain'}],
      [`/r2/buckets/${bucket}/domains/custom`,{bucket,operation:'custom_domains'}]
    ]));
    async function cf(path,method='GET',payload){
      let httpStatus;let providerCodes=[];
      try{
        const r=await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${o.accountId}${path}`,{method,redirect:'error',signal:AbortSignal.timeout(20000),
          headers:{Authorization:`Bearer ${o.token}`,'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});
        httpStatus=r.status;
        const data=await r.json();
        if(Array.isArray(data?.errors))providerCodes=data.errors.map(x=>x?.code).filter(n=>Number.isSafeInteger(n)&&n>=0&&n<=999999).slice(0,10);
        if(!r.ok||data?.success!==true)fail('provider');return data.result;
      }catch{
        const error=new RehearsalError('rehearsal_provider_unavailable');
        error.diagnostic={stage:path.startsWith('/d1/')?'d1':path.startsWith('/r2/')?'r2':'worker',method,
          ...r2Diagnostics.get(path),
          ...(Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599?{httpStatus}:{}),providerCodes};
        throw error;
      }
    }
    async function query(sql){
      const r=await cf(`/d1/database/${o.databaseId}/query`,'POST',{sql,params:[]});
      if(!Array.isArray(r)||r.length!==1||r[0].success!==true||!Array.isArray(r[0].results))fail('query_unconfirmed');return r[0].results;
    }
    const metadata=await cf(`/d1/database/${o.databaseId}`);
    if(metadata?.uuid!==o.databaseId||metadata.name!==databaseName)fail('database_identity');
    for(const bucket of [backups,objects,'bw-compliance-ops-evidence']){
      if((await cf(`/r2/buckets/${bucket}`))?.name!==bucket)fail('bucket_identity');
      verifyPrivateBucket(await cf(`/r2/buckets/${bucket}/domains/managed`),await cf(`/r2/buckets/${bucket}/domains/custom`));
    }
    // The restored-data database must not be bound to the rehearsal Worker.
    const settings=await cf(`/workers/scripts/${worker}/settings`);
    if(o.mode==='RESTORE_APPROVED_BACKUP'||o.mode==='PREFLIGHT_ONLY'){
      if(!Array.isArray(settings?.bindings)||settings.bindings.some(b=>b.type==='d1'&&(b.database_id??b.id)===o.databaseId))fail('restore_database_is_exposed');
    }else checkBindings(settings?.bindings,o.databaseId);
    const schedules=await cf(`/workers/scripts/${worker}/schedules`);
    if(!Array.isArray(schedules?.schedules)||schedules.schedules.length)fail('worker_schedules_must_be_empty');
    if(o.mode==='PREFLIGHT_ONLY')return {scope:'isolated_preflight',identityVerified:true,bucketPublicDomainsDisabled:true,liveWritesPerformed:false};
    const schemaHash=async()=>sha(JSON.stringify((await query(SCHEMA)).map(r=>[r.type,r.name,r.sql])));
    if(o.mode==='PREFLIGHT_WORKER')return {scope:'isolated_worker_preflight',identityVerified:true,bucketPublicDomainsDisabled:true,schemaSha256:await schemaHash(),liveWritesPerformed:false};
    const config=join(scratch,'wrangler.json');
    writeFileSync(config,JSON.stringify({name:worker,account_id:o.accountId,compatibility_date:'2026-09-03',d1_databases:[{binding:'REHEARSAL_DB',database_name:databaseName,database_id:o.databaseId}]}),{mode:0o600});
    async function wrangler(args){
      const env={...process.env,CLOUDFLARE_API_TOKEN:o.token,CLOUDFLARE_ACCOUNT_ID:o.accountId,WRANGLER_SEND_METRICS:'false'};
      for(const key of ['CLOUDFLARE_API_KEY','CLOUDFLARE_EMAIL','CF_API_TOKEN','CF_API_KEY','CF_ACCOUNT_ID'])delete env[key];
      try{await exec(process.execPath,[join(root,'node_modules/wrangler/bin/wrangler.js'),...args,'--config',config],{env,timeout:120000,maxBuffer:8*1024*1024});}
      catch{fail('transport_failed_inspect_before_retry')}
    }
    async function getObject(bucket,key,file){
      await wrangler(['r2','object','get',`${bucket}/${key}`,'--remote','--file',file]);
      if(statSync(file).size>(key.endsWith('.sql')?25:10)*1024*1024)fail('backup_size');
      return readFileSync(file);
    }
    const base=new URL(o.baseUrl??'https://invalid.example');
    if(['ROLLBACK_REHEARSAL_WORKER','ALERT_PROBE'].includes(o.mode)&&
       (base.protocol!=='https:'||!/^bw-compliance-os-ops-rehearsal\.[a-z0-9-]+\.workers\.dev$/.test(base.hostname)||base.port||base.username||base.password||base.search||base.hash||base.pathname!=='/'))fail('worker_url');
    if(['ROLLBACK_REHEARSAL_WORKER','ALERT_PROBE'].includes(o.mode)){
      const subdomain=(await cf('/workers/subdomain'))?.subdomain;
      if(typeof subdomain!=='string'||!/^[a-z0-9-]+$/.test(subdomain)||base.hostname!==`${worker}.${subdomain}.workers.dev`)fail('worker_url_account_mismatch');
    }
    const probe=async(path,headers={})=>{const r=await fetchImpl(new URL(path,base),{redirect:'error',signal:AbortSignal.timeout(20000),headers});await r.body?.cancel();return r.status};
    let result;
    if(o.mode==='RESTORE_APPROVED_BACKUP')result=await restoreBackup({query,
      download:key=>getObject(backups,key,join(scratch,key)),
      importSql:async data=>{const file=join(scratch,'restore.sql');writeFileSync(file,data,{mode:0o600});await wrangler(['d1','execute','REHEARSAL_DB','--remote','--file',file,'--yes'])},
      putObject:async(key,data)=>{const file=join(scratch,'sample.bin');writeFileSync(file,data,{mode:0o600});await wrangler(['r2','object','put',`${objects}/${key}`,'--remote','--file',file])},
      getObject:key=>getObject(objects,key,join(scratch,'roundtrip.bin'))
    },o);
    else if(o.mode==='ROLLBACK_REHEARSAL_WORKER')result=await rollbackWorker({
      version:id=>cf(`/workers/scripts/${worker}/versions/${id}`),deployments:()=>cf(`/workers/scripts/${worker}/deployments`),
      schemaHash,
      deploy:body=>cf(`/workers/scripts/${worker}/deployments`,'POST',body),
      smoke:async()=>await probe('/api/ready')===200&&await probe('/api/ops/diagnostics')===401
    },o);
    else result=await probeAlerts({
      enableLogs:async()=>{
        await cf(`/workers/scripts/${worker}/script-settings`,'PATCH',{observability:{enabled:true,head_sampling_rate:1,logs:{enabled:true,invocation_logs:true,head_sampling_rate:1}}});
        const s=await cf(`/workers/scripts/${worker}/script-settings`);
        return s?.observability?.enabled===true&&s.observability.head_sampling_rate===1&&s.observability.logs?.enabled===true&&
          s.observability.logs.invocation_logs===true&&s.observability.logs.head_sampling_rate===1;
      },
      probe:id=>probe('/api/ready',{'X-Thebe-Rehearsal-ID':id})
    },o);
    return {...result,collectorSha:o.sourceSha};
  }finally{rmSync(scratch,{recursive:true,force:true})}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  process.umask(0o077);
  try{
    const e=process.env;
    const result=await runIsolatedRehearsal({mode:e.REHEARSAL_MODE,accountId:e.OPERATIONS_REHEARSAL_ACCOUNT_ID,token:e.OPERATIONS_REHEARSAL_CLOUDFLARE_TOKEN,
      databaseId:e.REHEARSAL_DATABASE_ID,sourceSha:e.EXPECTED_SHA,isolationApproval:e.REHEARSAL_ISOLATION_APPROVAL,runId:randomUUID(),
      backupHash:e.REHEARSAL_BACKUP_SHA256,objectHash:e.REHEARSAL_OBJECT_SHA256,backupApproval:e.REHEARSAL_BACKUP_APPROVAL,
      versionId:e.REHEARSAL_ROLLBACK_VERSION_ID,currentVersionId:e.REHEARSAL_CURRENT_VERSION_ID,schemaHash:e.REHEARSAL_SCHEMA_SHA256,
      compatibilityApproval:e.REHEARSAL_COMPATIBILITY_APPROVAL,alertApproval:e.REHEARSAL_ALERT_APPROVAL,baseUrl:e.REHEARSAL_BASE_URL});
    console.log(JSON.stringify(result,null,2));
  }catch(e){
    console.error(e instanceof RehearsalError?e.message:'rehearsal_failed_inspect_before_retry');
    if(e instanceof RehearsalError&&e.diagnostic)console.error(JSON.stringify(e.diagnostic));
    process.exitCode=1;
  }
}
