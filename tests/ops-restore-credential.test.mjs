import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectRehearsalToken,runIsolatedRehearsal,rehearsalProbeBase,readRestoredCounts} from '../scripts/isolated-operations-rehearsal.mjs';
const env={OPERATIONS_REHEARSAL_CLOUDFLARE_TOKEN:'readonly-test-token',PRIVATE_BACKUP_CLOUDFLARE_TOKEN:'backup-test-token'};
test('restore selects dedicated write credential while preflight keeps existing credential',()=>{
  assert.equal(selectRehearsalToken('RESTORE_APPROVED_BACKUP',env),'backup-test-token');
  for(const mode of ['PREFLIGHT_ONLY','PREFLIGHT_WORKER','ROLLBACK_REHEARSAL_WORKER','ALERT_PROBE'])
    assert.equal(selectRehearsalToken(mode,env),'readonly-test-token');
});
test('restore never falls back to read-only credential',()=>{
  for(const token of [undefined,null,'','   '])assert.throws(()=>selectRehearsalToken('RESTORE_APPROVED_BACKUP',
    {...env,PRIVATE_BACKUP_CLOUDFLARE_TOKEN:token}),/rehearsal_restore_credential_required/);
  assert.throws(()=>selectRehearsalToken('UNKNOWN',env),/rehearsal_invalid_authority/);
});
test('production database remains rejected even with the dedicated credential',async()=>{
  let calls=0;await assert.rejects(runIsolatedRehearsal({mode:'RESTORE_APPROVED_BACKUP',
    accountId:'ddd23cab31928a4bb3d4998df9b26d1d',databaseId:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce',
    token:selectRehearsalToken('RESTORE_APPROVED_BACKUP',env),sourceSha:'a'.repeat(40),
    runId:'11111111-1111-4111-8111-111111111111',isolationApproval:'ISOLATED_REHEARSAL_ONLY'},
    {fetchImpl:async()=>{calls++;throw Error('unexpected')}}),/rehearsal_invalid_authority/);
  assert.equal(calls,0);
});
test('write credential is mode-restricted and existing independent gates remain',()=>{
  const workflow=readFileSync('.github/workflows/isolated-operations-rehearsals.yml','utf8');
  assert.ok(workflow.includes("PRIVATE_BACKUP_CLOUDFLARE_TOKEN: ${{ inputs.mode == 'RESTORE_APPROVED_BACKUP' && secrets.PRIVATE_BACKUP_CLOUDFLARE_TOKEN || '' }}"));
  assert.match(workflow,/environment: operations-rehearsal/);
  assert.match(workflow,/inputs.confirmation == 'RUN_ISOLATED_REHEARSAL'/);
  assert.match(workflow,/Reviewed revision is no longer current main/);
  assert.match(workflow,/REHEARSAL_BACKUP_APPROVAL: \$\{\{ vars.REHEARSAL_BACKUP_APPROVAL \}\}/);
});

test('restore does not parse an unused empty Worker URL; probe modes still validate it',()=>{
  assert.equal(rehearsalProbeBase('RESTORE_APPROVED_BACKUP',''),undefined);
  assert.equal(rehearsalProbeBase('RESTORE_APPROVED_BACKUP','malformed'),undefined);
  for(const mode of ['ROLLBACK_REHEARSAL_WORKER','ALERT_PROBE']){
    for(const url of ['', 'malformed','http://bw-compliance-os-ops-rehearsal.test.workers.dev','https://other.test.workers.dev'])
      assert.throws(()=>rehearsalProbeBase(mode,url),/rehearsal_worker_url/);
    assert.equal(rehearsalProbeBase(mode,'https://bw-compliance-os-ops-rehearsal.test.workers.dev').protocol,'https:');
  }
});

test('all 231 restored table counts use individual D1-compatible statements',async()=>{
  const names=Array.from({length:231},(_,i)=>`table_${i}`);
  let calls=0;
  const rows=await readRestoredCounts(async sql=>{
    assert.ok(!sql.includes('UNION'));
    const name=names[calls++];
    assert.equal(sql,`SELECT '${name}' AS name,COUNT(*) AS n FROM "${name}"`);
    return [{name,n:calls}];
  },names);
  assert.equal(calls,231);assert.equal(rows.length,231);
  assert.equal(rows[230].n,231);
  await assert.rejects(readRestoredCounts(async()=>assert.fail('unsafe transport'),['bad"name']),/backup_schema/);
});
