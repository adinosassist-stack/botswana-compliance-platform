import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {validateRehearsal,verifyPrivateBucket,inspectBackup,restoreBackup,rollbackWorker,probeAlerts,runIsolatedRehearsal} from '../scripts/isolated-operations-rehearsal.mjs';

const accountId='a'.repeat(32),databaseId='11111111-2222-4333-8444-555555555555';
const base={accountId,databaseId,token:'isolated-token',sourceSha:'b'.repeat(40),isolationApproval:'ISOLATED_REHEARSAL_ONLY',runId:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'};
const mode='RESTORE_APPROVED_BACKUP';
const sha=x=>createHash('sha256').update(x).digest('hex');
const backup=()=>Buffer.from(readFileSync('cloudflare/schema.sql','utf8')+"\nINSERT INTO tenants(id,name) VALUES('private-tenant','Private customer');\nINSERT INTO users(id,email,password_hash) VALUES('private-user','private@example.test','private-hash');\n");

test('reject production, regulatory staging, malformed IDs and absent authorization before transport',()=>{
  for(const patch of [{databaseId:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce'},{databaseId:'20c0d37e-552e-438f-a56d-3f12c27d38e2'},{accountId:'../prod'},{token:''},{sourceSha:'main'},{isolationApproval:undefined},{mode:'DROP_DATABASE'}]){
    assert.throws(()=>validateRehearsal({...base,mode,...patch}),/rehearsal_invalid_authority/);
  }
  assert.equal(validateRehearsal({...base,mode}).databaseName,'bw-compliance-os-ops-restore');
  assert.equal(validateRehearsal({...base,mode:'ROLLBACK_REHEARSAL_WORKER'}).databaseName,'bw-compliance-os-ops-rehearsal');
});

test('bucket privacy requires explicit disabled managed and custom public domains',()=>{
  assert.doesNotThrow(()=>verifyPrivateBucket({enabled:false},{domains:[]}));
  for(const args of [[{}, {domains:[]}],[{enabled:true},{domains:[]}],[{enabled:false},{}],[{enabled:false},{domains:[{enabled:true}]}],[{enabled:false},{domains:[{}]}]])assert.throws(()=>verifyPrivateBucket(...args),/rehearsal_bucket_not_private/);
});

test('backup inspection verifies real schema integrity and counts without surfacing row values',()=>{
  const sql=readFileSync('cloudflare/schema.sql','utf8')+"\nINSERT INTO tenants(id,name) VALUES('private-tenant','Private customer');\nINSERT INTO users(id,email,password_hash) VALUES('private-user','private@example.test','private-hash');\n";
  const r=inspectBackup(sql);
  assert.ok(r.counts.tenants===1&&r.counts.users===1);
  assert.equal(JSON.stringify(r).includes('private'),false);
  assert.throws(()=>inspectBackup(readFileSync('cloudflare/schema.sql','utf8')),/rehearsal_backup_data_missing/);
  assert.throws(()=>inspectBackup('ATTACH DATABASE \'/tmp/not-allowed.db\' AS other;'),/rehearsal_backup_rejected/);
  assert.throws(()=>inspectBackup(sql+'\0SELECT 1'),/rehearsal_backup_rejected/);
});

test('restore refuses existing database before download or import',async()=>{
  const calls=[];
  await assert.rejects(restoreBackup({query:async()=>[{object_count:1}],download:async()=>calls.push('download')},{...base,backupHash:'a'.repeat(64),objectHash:'c'.repeat(64),backupApproval:'review-1'}),/rehearsal_restore_requires_empty/);
  assert.deepEqual(calls,[]);
});

test('real isolated SQLite restore verifies all row counts and object byte roundtrip',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
    const sql=backup(),sample=Buffer.from('private evidence bytes'),written=[];
    const a={query:async s=>db.prepare(s).all(),download:async key=>key.endsWith('.sql')?sql:sample,
      importSql:async data=>db.exec(data.toString()),putObject:async(key,data)=>written.push({key,data}),getObject:async()=>written[0].data};
    const r=await restoreBackup(a,{...base,backupHash:sha(sql),objectHash:sha(sample),backupApproval:'independent-review-1'});
    assert.equal(r.rowCountsMatched,true);assert.equal(r.objectBytesMatched,true);assert.ok(r.tableCount>100);
    assert.equal(written[0].key,`rehearsals/${base.runId}/sample.bin`);
    assert.equal(r.productionRecoveryAccepted,false);assert.equal(JSON.stringify(r).includes('private'),false);
  }finally{db.close()}
});

test('checksum mismatch and concurrent target change stop before import',async()=>{
  for(const race of [false,true]){
    let imports=0,checks=0;
    const sql=backup(),sample=Buffer.from('evidence');
    const a={query:async()=>[{object_count:race&&++checks===2?1:0}],download:async key=>key.endsWith('.sql')?sql:sample,importSql:async()=>imports++};
    await assert.rejects(restoreBackup(a,{...base,backupHash:race?sha(sql):'f'.repeat(64),objectHash:sha(sample),backupApproval:'review-1'}),race?/requires_empty/:/checksum/);
    assert.equal(imports,0);
  }
});

test('failed restore verification never starts the object write or reports recovery success',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
    const sql=backup(),sample=Buffer.from('evidence');let writes=0;
    const a={query:async s=>s.startsWith('SELECT \'')?[]:db.prepare(s).all(),download:async key=>key.endsWith('.sql')?sql:sample,
      importSql:async data=>db.exec(data.toString()),putObject:async()=>writes++};
    const o={...base,backupHash:sha(sql),objectHash:sha(sample),backupApproval:'review-1'};
    await assert.rejects(restoreBackup(a,o),/restore_counts/);assert.equal(writes,0);
    // A possible partial import is retained for inspection; a retry cannot overwrite it.
    await assert.rejects(restoreBackup(a,o),/restore_requires_empty/);
  }finally{db.close()}
});

test('untrusted SQLite error text cannot impersonate an allowlisted operator diagnostic',()=>{
  const sql=backup().toString()+"\nCREATE TRIGGER fake_error BEFORE INSERT ON tenants BEGIN SELECT RAISE(ABORT,'rehearsal_private_secret'); END; INSERT INTO tenants(id,name) VALUES('another','private');";
  assert.throws(()=>inspectBackup(sql),e=>e.message==='rehearsal_backup_rejected');
});

test('rollback only posts the exact reviewed version after binding and schema checks',async()=>{
  const versionId='aaaaaaaa-2222-4333-8444-555555555555',currentVersionId='bbbbbbbb-2222-4333-8444-555555555555';
  const bindings=[{type:'d1',name:'DB',id:databaseId},{type:'r2_bucket',name:'EVIDENCE',bucket_name:'bw-compliance-ops-evidence'},{type:'plain_text',name:'APP_ENV',text:'rehearsal'}];
  const calls=[];
  const adapter={version:async()=>({id:versionId,resources:{bindings}}),deployments:async()=>({deployments:[{versions:[{version_id:calls.length?versionId:currentVersionId,percentage:100}]},{versions:[{version_id:versionId,percentage:100}]}]}),schemaHash:async()=> 'c'.repeat(64),deploy:async body=>{calls.push(body);return {versions:body.versions}},smoke:async()=>true};
  const r=await rollbackWorker(adapter,{...base,versionId,currentVersionId,schemaHash:'c'.repeat(64),compatibilityApproval:'review-2'});
  assert.equal(r.stagedRollbackVerified,true);
  assert.deepEqual(calls,[{strategy:'percentage',versions:[{version_id:versionId,percentage:100}]}]);
  bindings[0].id='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
  await assert.rejects(rollbackWorker(adapter,{...base,versionId,currentVersionId,schemaHash:'c'.repeat(64),compatibilityApproval:'review-2'}),/rehearsal_worker_bindings/);
  assert.equal(calls.length,1);
});

test('stale deployment and schema mismatch deny rollback before a deployment write',async()=>{
  const versionId='aaaaaaaa-2222-4333-8444-555555555555',currentVersionId='bbbbbbbb-2222-4333-8444-555555555555';
  const bindings=[{type:'d1',id:databaseId},{type:'plain_text',name:'APP_ENV',text:'rehearsal'}];
  for(const stale of [false,true]){
    let writes=0;
    const a={version:async()=>({id:versionId,resources:{bindings}}),deployments:async()=>({deployments:[{versions:[{version_id:stale?versionId:currentVersionId,percentage:100}]},{versions:[{version_id:versionId,percentage:100}]}]}),schemaHash:async()=> 'f'.repeat(64),deploy:async()=>writes++};
    await assert.rejects(rollbackWorker(a,{...base,versionId,currentVersionId,schemaHash:'c'.repeat(64),compatibilityApproval:'review-2'}),stale?/rollback_history/:/schema_compatibility/);
    assert.equal(writes,0);
  }
});

test('rollback cannot report success when provider still reports the old active version',async()=>{
  const versionId='aaaaaaaa-2222-4333-8444-555555555555',currentVersionId='bbbbbbbb-2222-4333-8444-555555555555';
  const bindings=[{type:'d1',id:databaseId},{type:'plain_text',name:'APP_ENV',text:'rehearsal'}];
  const a={version:async()=>({id:versionId,resources:{bindings}}),deployments:async()=>({deployments:[{versions:[{version_id:currentVersionId,percentage:100}]},{versions:[{version_id:versionId,percentage:100}]}]}),schemaHash:async()=> 'c'.repeat(64),deploy:async body=>({versions:body.versions}),smoke:async()=>true};
  await assert.rejects(rollbackWorker(a,{...base,versionId,currentVersionId,schemaHash:'c'.repeat(64),compatibilityApproval:'review-2'}),/rollback_unconfirmed/);
});

test('preflight uses only the isolated identities and GET requests; public backups refuse all later work',async()=>{
  for(const publicAccess of [false,true]){
    const calls=[];
    const fetchImpl=async(url,options)=>{
      calls.push({url,options});let result;
      if(url.endsWith(`/d1/database/${databaseId}`))result={uuid:databaseId,name:'bw-compliance-os-ops-restore'};
      else if(url.endsWith('/domains/managed'))result={enabled:publicAccess};
      else if(url.endsWith('/domains/custom'))result={domains:[]};
      else if(url.endsWith('/settings'))result={bindings:[]};
      else if(url.endsWith('/schedules'))result={schedules:[]};
      else result={name:url.split('/').at(-1)};
      return new Response(JSON.stringify({success:true,result}));
    };
    const promise=runIsolatedRehearsal({...base,mode:'PREFLIGHT_ONLY'},{fetchImpl});
    if(publicAccess)await assert.rejects(promise,/bucket_not_private/);else assert.equal((await promise).liveWritesPerformed,false);
    for(const c of calls){assert.equal(c.options.method,'GET');assert.equal(c.options.redirect,'error');assert.equal(c.url.includes(blockedProductionId),false)}
  }
});
const blockedProductionId='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';

test('provider refusals expose numeric diagnostics without echoed credentials or response text',async()=>{
  const fetchImpl=async()=>new Response(JSON.stringify({success:false,errors:[{code:10000,message:base.token},{code:base.token}]}),{status:401});
  await assert.rejects(runIsolatedRehearsal({...base,mode:'PREFLIGHT_ONLY'},{fetchImpl}),e=>{
    assert.deepEqual(e.diagnostic,{stage:'d1',method:'GET',httpStatus:401,providerCodes:[10000]});
    assert.equal(JSON.stringify(e).includes(base.token),false);return true;
  });
});

test('R2 refusals identify only fixed bucket and operation labels and stop without writes',async()=>{
  for(const bucket of ['bw-compliance-ops-backups','bw-compliance-ops-restore','bw-compliance-ops-evidence']){
    for(const [suffix,operation] of [['','bucket_metadata'],['/domains/managed','managed_domain'],['/domains/custom','custom_domains']]){
      const calls=[];
      const fetchImpl=async(url,options)=>{
        calls.push({url,method:options.method});
        if(url.endsWith(`/r2/buckets/${bucket}${suffix}`))return new Response(JSON.stringify({success:false,errors:[{code:10000,message:`${base.token} ${accountId} private-provider-body`}]}),{status:403});
        let result;
        if(url.endsWith(`/d1/database/${databaseId}`))result={uuid:databaseId,name:'bw-compliance-os-ops-restore'};
        else if(url.endsWith('/domains/managed'))result={enabled:false};
        else if(url.endsWith('/domains/custom'))result={domains:[]};
        else result={name:url.split('/').at(-1)};
        return new Response(JSON.stringify({success:true,result}));
      };
      await assert.rejects(runIsolatedRehearsal({...base,mode:'PREFLIGHT_ONLY'},{fetchImpl}),e=>{
        assert.deepEqual(e.diagnostic,{stage:'r2',method:'GET',bucket,operation,httpStatus:403,providerCodes:[10000]});
        for(const secret of [base.token,accountId,databaseId,'private-provider-body'])assert.equal(JSON.stringify(e).includes(secret),false);
        return true;
      });
      assert.ok(calls.every(c=>c.method==='GET'));
      assert.ok(calls.at(-1).url.endsWith(`/r2/buckets/${bucket}${suffix}`));
    }
  }
});

test('a different account hostname cannot receive the alert probe or cause a logging write',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});let result;
    if(url.endsWith(`/d1/database/${databaseId}`))result={uuid:databaseId,name:'bw-compliance-os-ops-rehearsal'};
    else if(url.endsWith('/domains/managed'))result={enabled:false};
    else if(url.endsWith('/domains/custom'))result={domains:[]};
    else if(url.endsWith('/settings'))result={bindings:[{type:'d1',id:databaseId},{type:'plain_text',name:'APP_ENV',text:'rehearsal'}]};
    else if(url.endsWith('/schedules'))result={schedules:[]};
    else if(url.endsWith('/subdomain'))result={subdomain:'correct-account'};
    else result={name:url.split('/').at(-1)};
    return new Response(JSON.stringify({success:true,result}));
  };
  await assert.rejects(runIsolatedRehearsal({...base,mode:'ALERT_PROBE',alertApproval:'review-3',baseUrl:'https://bw-compliance-os-ops-rehearsal.wrong-account.workers.dev/'},{fetchImpl}),/worker_url_account_mismatch/);
  for(const call of calls){assert.equal(call.options.method,'GET');assert.equal(new URL(call.url).hostname,'api.cloudflare.com')}
});

test('alert probe strengthens only rehearsal logging and never claims delivered alerts',async()=>{
  const calls=[];
  const r=await probeAlerts({enableLogs:async()=>{calls.push('enable');return true},probe:async()=>503},{...base,alertApproval:'review-3'});
  assert.deepEqual(calls,['enable']);assert.equal(r.probeStatus,503);assert.equal(r.alertDeliveryVerified,false);
  await assert.rejects(probeAlerts({enableLogs:async()=>true,probe:async()=>200},{...base,alertApproval:'review-3'}),/rehearsal_expected_controlled_failure/);
  await assert.rejects(probeAlerts({enableLogs:async()=>undefined,probe:async()=>503},{...base,alertApproval:'review-3'}),/rehearsal_logging_unconfirmed/);
});

test('workflow has credential-free PR tests and manually authorized isolated operations only',()=>{
  const s=readFileSync('.github/workflows/isolated-operations-rehearsals.yml','utf8');
  assert.match(s,/workflow_dispatch:/);assert.doesNotMatch(s,/^  (push|schedule|pull_request_target):/m);
  assert.match(s,/environment: operations-rehearsal/);assert.doesNotMatch(s,/environment: production|secrets\.CLOUDFLARE_API_TOKEN\b|upload-artifact/);
  assert.match(s,/default: DO_NOT_RUN/);assert.match(s,/github.ref == 'refs\/heads\/main'/);assert.match(s,/live_sha/);
  assert.match(s,/OPERATIONS_REHEARSAL_CLOUDFLARE_TOKEN/);assert.match(s,/RUN_ISOLATED_REHEARSAL/);
  for(const line of s.split('\n').filter(x=>x.includes('uses:')))assert.match(line,/@[a-f0-9]{40}\b/);
});

test('existing restore continuation never imports and requires exact inventory before object writes',async()=>{
  for(const mismatch of ['none','extra','count']){
    const db=new DatabaseSync(':memory:');
    try{
      const sql=backup(),sample=Buffer.from('private sample');db.exec(sql.toString());
      if(mismatch==='extra')db.exec('CREATE TABLE unexpected(id INTEGER)');
      let writes=0;const saved=[];
      const a={query:async s=>{
        const rows=db.prepare(s).all();
        if(mismatch==='count'&&s.startsWith("SELECT '"))rows[0].n++;
        return rows;
      },download:async key=>key.endsWith('.sql')?sql:sample,
      importSql:async()=>assert.fail('continuation must never import'),
      putObject:async(key,data)=>{writes++;saved.push(data)},getObject:async()=>saved[0]};
      const o={...base,mode:'VERIFY_EXISTING_RESTORE',backupHash:sha(sql),objectHash:sha(sample),backupApproval:'review-1'};
      if(mismatch==='none'){
        const r=await restoreBackup(a,o);assert.equal(r.sqlImportPerformed,false);
        assert.equal(r.existingRestoreVerified,true);assert.equal(writes,1);
      }else{await assert.rejects(restoreBackup(a,o),mismatch==='extra'?/restore_schema/:/restore_counts/);assert.equal(writes,0)}
    }finally{db.close()}
  }
});
