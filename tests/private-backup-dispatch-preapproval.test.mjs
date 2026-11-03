import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {verifyPrivateBackupDispatch} from '../scripts/verify-private-backup-dispatch.mjs';

const base={
  GITHUB_REPOSITORY:'adinosassist-stack/botswana-compliance-platform',
  GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
  BACKUP_CONFIRM:'PREPARE_PRIVATE_PRODUCTION_BACKUP',
  EXPECTED_SHA:'a'.repeat(40),GITHUB_SHA:'a'.repeat(40)
};

test('exact reviewed main dispatch can enter independent environment review',()=>{
  const o=verifyPrivateBackupDispatch(base);
  assert.deepEqual(o,{validated:true,kind:'private_backup_preapproval',sourceSha:base.EXPECTED_SHA});
});

test('stale expected SHA is refused before production export or environment review',()=>{
  assert.throws(()=>verifyPrivateBackupDispatch({...base,GITHUB_SHA:'b'.repeat(40)}),/backup_dispatch_stale_expected_sha/);
});

test('invalid authority, branch, event and malformed SHA are denied',()=>{
  const invalid=[
    {GITHUB_REPOSITORY:'another/organization'},
    {GITHUB_REF:'refs/heads/feature'},
    {GITHUB_EVENT_NAME:'pull_request'},
    {BACKUP_CONFIRM:'DO_NOT_RUN'},
    {EXPECTED_SHA:'invalid'},
    {EXPECTED_SHA:'A'.repeat(40)},
    {EXPECTED_SHA:''}
  ];
  for(const patch of invalid){
    assert.throws(()=>verifyPrivateBackupDispatch({...base,...patch}),/backup_dispatch_/);
  }
});

test('protected workflow rejects mismatched input before any approval-gated prepare job',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/private-production-backup-candidate.yml',import.meta.url),'utf8');
  const check=workflow.indexOf('node scripts/verify-private-backup-dispatch.mjs');
  const environment=workflow.indexOf('environment: operations-rehearsal');
  assert.ok(check>0&&environment>check,'preapproval check must precede protected environment');
  assert.match(workflow,/if: github\.event_name == 'workflow_dispatch' && inputs\.confirmation == 'PREPARE_PRIVATE_PRODUCTION_BACKUP'/);
  assert.match(workflow,/needs: qualify/);
  assert.match(workflow,/node --test tests\/private-d1-backup\.test\.mjs tests\/private-backup-dispatch-preapproval\.test\.mjs/);
  assert.match(workflow,/\[\[ "\$EXPECTED_SHA" == "\$GITHUB_SHA" \]\]/,'protected prepare must independently enforce exact checkout SHA');
  assert.match(workflow,/environment: operations-rehearsal/);
  assert.doesNotMatch(workflow,/cancel-in-progress: true/);
});
