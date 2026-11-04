import test from 'node:test';
import assert from 'node:assert/strict';
import {planIsolatedVersionedRestore} from '../scripts/plan-isolated-versioned-restore-offline.mjs';
const base={
 sourceDatabaseId:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce',
 targetDatabaseId:'be15acba-ba16-4704-9498-e296a164b3a2',
 candidateKey:'candidates/41709222476/1/production-d1.sql',
 sha256:'2363d0cfc85a76e3cfef7c33a9f2f70a38899174042e23683aa663dfcbaf3f33',
 exportBookmark:'00000631-00000000-00005118-8099f81bbc6bad9cf65686bdc2a6b851',
 bytes:3224706,targetObjectCount:0,targetRowsWritten:0,
 reviewedMainSha:'a'.repeat(40),ownerRestoreApproval:false,independentRestoreApproval:false
};
test('identifies source and isolated destination but never authorizes Time Travel or import',()=>{
 const result=planIsolatedVersionedRestore(base);
 for(const key of ['timeTravelRestoreAllowed','productionDatabaseMutationAllowed','isolatedD1ImportAuthorized','ownerRestoreApprovalVerified','independentRestoreApprovalVerified','restoreExecuted','retentionEnforced'])assert.equal(result[key],false);
 assert.match(result.disposition,/^HOLD_/);
});
test('refuses production or substitute database as isolated target',()=>{
 for(const target of [base.sourceDatabaseId,'07c1aaeb-215a-4f01-80b6-a5e0ebedfcd8','11111111-2222-4333-8444-555555555555']){
 assert.throws(()=>planIsolatedVersionedRestore({...base,targetDatabaseId:target}),/versioned_restore_hold_database_identity/);
 }
});
test('refuses unsupported evidence, nonempty target, approval assertions or extra fields',()=>{
 for(const patch of [
 {candidateKey:'approved-d1-backup.sql'},{sha256:'b'.repeat(64)},{bytes:1},
 {exportBookmark:'wrong'}, {targetObjectCount:1},{targetRowsWritten:1},
 {ownerRestoreApproval:true},{independentRestoreApproval:true},
 {reviewedMainSha:'stale'}, {sql:'PRIVATE'}
 ])assert.throws(()=>planIsolatedVersionedRestore({...base,...patch}),/versioned_restore_hold_/);
});
