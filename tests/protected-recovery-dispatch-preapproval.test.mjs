import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {verifyProtectedRecoveryDispatch} from '../scripts/verify-protected-recovery-dispatch.mjs';
const sha='a'.repeat(40);
const base={GITHUB_REPOSITORY:'adinosassist-stack/botswana-compliance-platform',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_SHA:sha,EXPECTED_SHA:sha};
const isolated={...base,RECOVERY_DISPATCH_KIND:'isolated',RECOVERY_CONFIRM:'RUN_ISOLATED_REHEARSAL',RECOVERY_MODE:'PREFLIGHT_ONLY'};
const integrity={...base,RECOVERY_DISPATCH_KIND:'backup_integrity',RECOVERY_CONFIRM:'QUALIFY_PRIVATE_BACKUP_CANDIDATES'};
test('valid exact-SHA requests can seek independent review, not authority',()=>{
 for(const request of [isolated,integrity]){
  const result=verifyProtectedRecoveryDispatch(request);
  assert.equal(result.preapprovalSourceCheckPassed,true);
  assert.equal(result.independentEnvironmentApprovalObtained,false);
  assert.equal(result.remoteMutationsPerformed,false);
 }
});
test('stale or malformed SHA is rejected for both modes',()=>{
 for(const v of [isolated,integrity])for(const patch of [{GITHUB_SHA:'b'.repeat(40)},{EXPECTED_SHA:'A'.repeat(40)},{EXPECTED_SHA:'invalid'},{EXPECTED_SHA:''}])
 assert.throws(()=>verifyProtectedRecoveryDispatch({...v,...patch}),/protected_recovery_dispatch_refused/);
});
test('disallow unintended events, repos, refs and confirmations',()=>{
 for(const v of [isolated,integrity])for(const patch of [{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REF:'refs/heads/feature'},{GITHUB_REPOSITORY:'other/repo'},{RECOVERY_CONFIRM:'DO_NOT_RUN'},{RECOVERY_DISPATCH_KIND:'unknown'}])
 assert.throws(()=>verifyProtectedRecoveryDispatch({...v,...patch}),/protected_recovery_dispatch_refused/);
});
test('isolated mode can only choose known protected operations',()=>{
 for(const mode of ['RESTORE_APPROVED_BACKUP','VERIFY_EXISTING_RESTORE','ROLLBACK_REHEARSAL_WORKER','PREFLIGHT_WORKER','ALERT_PROBE'])
 assert.equal(verifyProtectedRecoveryDispatch({...isolated,RECOVERY_MODE:mode}).preapprovalSourceCheckPassed,true);
 for(const mode of ['PRODUCTION_MIGRATION','',null,'DELETE_DATABASE'])
 assert.throws(()=>verifyProtectedRecoveryDispatch({...isolated,RECOVERY_MODE:mode}),/protected_recovery_dispatch_refused/);
});
test('both workflows enforce no-secret check in qualify before protected environment',()=>{
 for(const path of ['isolated-operations-rehearsals.yml','private-backup-integrity.yml']){
  const wf=readFileSync(new URL('../.github/workflows/'+path,import.meta.url),'utf8');
  const guard=wf.indexOf('node scripts/verify-protected-recovery-dispatch.mjs');
  const protectedJob=wf.indexOf('environment: operations-rehearsal');
  assert.ok(guard>0&&protectedJob>guard);
  const mainLookup=wf.indexOf('gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/main"');
  const staleFail=wf.indexOf('Protected recovery dispatch is stale relative to current main.');
  assert.ok(guard<mainLookup&&mainLookup<staleFail&&staleFail<protectedJob,
    'live remote main must be checked and stale source rejected before environment approval');
  assert.ok(wf.includes('GH_TOKEN: ${{ github.token }}'));
  assert.match(wf,/needs: qualify/);
  assert.match(wf,/node --test[^\n]*protected-recovery-dispatch-preapproval\.test\.mjs/);
  assert.doesNotMatch(wf,/cancel-in-progress: true/);
 }
});

test('versioned import requires distinct numeric approval IDs before environment review',()=>{
 const request={...isolated,RECOVERY_MODE:'RESTORE_VERSIONED_CANDIDATE',VERSIONED_OWNER_APPROVAL_ID:'123',VERSIONED_REVIEW_APPROVAL_ID:'456'};
 assert.equal(verifyProtectedRecoveryDispatch(request).preapprovalSourceCheckPassed,true);
 for(const patch of [{VERSIONED_OWNER_APPROVAL_ID:''},{VERSIONED_REVIEW_APPROVAL_ID:'123'},{VERSIONED_OWNER_APPROVAL_ID:'1;echo unsafe'}])
 assert.throws(()=>verifyProtectedRecoveryDispatch({...request,...patch}),/dispatch_refused/);
});

