import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyIsolatedRestoreTarget} from '../scripts/qualify-pop-isolated-restore-target-offline.mjs';
const id='11111111-2222-4333-8444-555555555555';
const name='bw-compliance-os-ops-restore-candidate-20261103';
const sha='a'.repeat(40);
const valid={accountId:'ddd23cab31928a4bb3d4998df9b26d1d',databaseId:id,expectedDatabaseId:id,databaseName:name,approvedSourceSha:sha,reviewedSourceSha:sha,
 inventory:{databaseId:id,databaseName:name,success:true,rowsWritten:0,objectCount:0},
 workerBindings:[{worker:'rehearsal-service',databaseIds:['cccccccc-2222-4333-8444-555555555555']}]};
test('empty distinct candidate qualifies only for independent review',()=>{
 const q=qualifyIsolatedRestoreTarget(valid);
 assert.equal(q.emptyCatalogObserved,true);
 assert.equal(q.status,'HOLD_OWNER_AND_INDEPENDENT_RECOVERY_APPROVAL');
 for(const x of ['allAccountAccessPathsVerified','isolatedRestoreAuthorized','retainedBackupApproved','backupSha256IndependentlyVerified','restoreExecuted','productionWriteAuthorized']) assert.equal(q[x],false);
});
test('prohibits all known real database roles',()=>{
 for(const databaseId of ['8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce','07c1aaeb-215a-4f01-80b6-a5e0ebedfcd8','c5c232a8-8fe7-440c-81ba-021a44fd3fdd','812f9021-890b-41e6-8fa1-6001f90a9b53','9d1b8852-4424-46e9-ba24-cdad5ced215f'])
 assert.throws(()=>qualifyIsolatedRestoreTarget({...valid,databaseId,expectedDatabaseId:databaseId,inventory:{...valid.inventory,databaseId}}),/database_identity/);
});
test('refuses nonempty, missing and unverifiable inventories',()=>{
 for(const inventory of [null,{...valid.inventory,objectCount:1},{...valid.inventory,objectCount:572},{...valid.inventory,rowsWritten:1},{...valid.inventory,success:false},{...valid.inventory,databaseId:'other'}])
 assert.throws(()=>qualifyIsolatedRestoreTarget({...valid,inventory}),/nonempty_or_unverified/);
});
test('refuses wrong account, source mismatch and unexpected target identity',()=>{
 assert.throws(()=>qualifyIsolatedRestoreTarget({...valid,accountId:'wrong'}),/account/);
 assert.throws(()=>qualifyIsolatedRestoreTarget({...valid,reviewedSourceSha:'b'.repeat(40)}),/source_sha/);
 assert.throws(()=>qualifyIsolatedRestoreTarget({...valid,expectedDatabaseId:'other'}),/database_identity/);
 assert.throws(()=>qualifyIsolatedRestoreTarget({...valid,databaseName:'bw-compliance-os-ops-restore'}),/database_name/);
});
test('refuses exposed or unknown worker bindings',()=>{
 assert.throws(()=>qualifyIsolatedRestoreTarget({...valid,workerBindings:[]}),/bindings_missing/);
 assert.throws(()=>qualifyIsolatedRestoreTarget({...valid,workerBindings:[{worker:'x',databaseIds:[id]}]}),/database_bound_to_worker/);
 assert.throws(()=>qualifyIsolatedRestoreTarget({...valid,workerBindings:[{}]}),/bindings_invalid/);
});
