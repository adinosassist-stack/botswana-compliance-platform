import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileHistoricalCandidateReceipt} from '../scripts/reconcile-historical-private-candidate-offline.mjs';
import {validateCandidateReceipt} from '../scripts/qualify-private-pop-backup-evidence-offline.mjs';
const hash='2363d0cfc85a76e3cfef7c33a9f2f70a38899174042e23683aa663dfcbaf3f33';
const key='candidates/41709222476/1/production-d1.sql';
const historical={kind:'private_production_backup_candidate',sourceSha:'a474d04678f6dfdec75507a8ee58058b2db3d1f2',
 sourceDatabase:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce',candidateKey:key,bytes:3224706,
 sha256:hash,exportBookmark:'00000631-00000000-00005118-8099f81bbc6bad9cf65686bdc2a6b851',
 privateRoundtripVerified:true,backupIndependentlyApproved:false,restorePerformed:false,productionDataOrSchemaWritten:false};
const observation={kind:'protected_versioned_candidate_bytes_readonly',candidateKey:key,bytes:3224706,
 sha256:hash,tableCount:231,rowCountsSha256:'c3ef5ea2dba1cefe82b38e5b8029e79bfba7194cf0c8a20087389294541e885b',
 sqliteIntegrityPassed:true,foreignKeyViolations:0,
 originalProtectedReceiptAuthenticated:false,exportBookmarkIndependentlyVerified:false,
 rpoApproved:false,retentionEnforced:false,representativeR2ObjectVerified:false,
 independentRestoreApproval:false,restoreExecuted:false,productionWriteAuthorized:false,
 disposition:'HOLD_PROVENANCE_RETENTION_AND_INDEPENDENT_RESTORE_APPROVAL_REQUIRED'};
const clone=v=>structuredClone(v);
test('canonicalizes matched historical fields for newer offline planner, but cannot confer authority',()=>{
 const result=reconcileHistoricalCandidateReceipt(historical,observation);
 assert.equal(result.candidate.sha256,hash);
 assert.equal(result.candidate.exportBookmark,historical.exportBookmark);
 assert.equal(result.candidate.runId,'41709222476');
 assert.equal(validateCandidateReceipt(result.candidate).disposition,'HOLD_INDEPENDENT_EVIDENCE_AND_RECOVERY_APPROVAL_REQUIRED');
 for(const k of ['githubReceiptOriginIndependentlyAuthenticated','protectedObservationOriginIndependentlyAuthenticated','retentionEnforced','restoreApproved','productionWriteAuthorized'])assert.equal(result[k],false);
});
test('rejects forged source identity, forged approval flags and unknown private fields',()=>{
 for(const patch of [{sourceSha:'b'.repeat(40)},{sourceDatabase:'fake'},{backupIndependentlyApproved:true},{restorePerformed:true},{privateRoundtripVerified:false},{secret:'do-not-persist'},{candidateKey:'approved-d1-backup.sql'}]){
  assert.throws(()=>reconcileHistoricalCandidateReceipt({...historical,...patch},observation),/historical_candidate_hold_/);
 }
});
test('rejects fake or inconsistent independent object observations',()=>{
 for(const patch of [{sha256:'a'.repeat(64)},{bytes:8},{tableCount:0},{foreignKeyViolations:1},{sqliteIntegrityPassed:false},{originalProtectedReceiptAuthenticated:true},{retentionEnforced:true},{restoreExecuted:true},{extra:'private'}]){
  assert.throws(()=>reconcileHistoricalCandidateReceipt(historical,{...observation,...patch}),/historical_candidate_hold_/);
 }
});
test('rejects historical hash/bookmark tampering and returns no false approval',()=>{
 for(const patch of [{sha256:'b'.repeat(64)},{exportBookmark:'bad bookmark'},{exportBookmark:''},{bytes:3224705}]){
  assert.throws(()=>reconcileHistoricalCandidateReceipt({...historical,...patch},clone(observation)));
 }
});
