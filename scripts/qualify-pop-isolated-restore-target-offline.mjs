// Offline-only recovery-target inventory contract. Never creates a database or runs SQL.
const ACCOUNT='ddd23cab31928a4bb3d4998df9b26d1d';
const FORBIDDEN=new Set([
 '8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce', // production
 '07c1aaeb-215a-4f01-80b6-a5e0ebedfcd8', // historical populated restore
 'c5c232a8-8fe7-440c-81ba-021a44fd3fdd', // rehearsal app
 '812f9021-890b-41e6-8fa1-6001f90a9b53', // POP staging
 '9d1b8852-4424-46e9-ba24-cdad5ced215f' // billing staging
]);
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const SHA=/^[a-f0-9]{40}$/;
const fail=code=>{throw Error('isolated_restore_target_hold_'+code)};
export function qualifyIsolatedRestoreTarget({accountId,databaseId,databaseName,expectedDatabaseId,inventory,workerBindings,approvedSourceSha,reviewedSourceSha}={}){
 if(accountId!==ACCOUNT)fail('account');
 if(typeof databaseId!=='string'||!UUID.test(databaseId)||FORBIDDEN.has(databaseId)||databaseId!==expectedDatabaseId)fail('database_identity');
 if(typeof databaseName!=='string'||!/^bw-compliance-os-ops-restore-candidate-[a-z0-9-]{4,40}$/.test(databaseName))fail('database_name');
 if(!SHA.test(approvedSourceSha||'')||approvedSourceSha!==reviewedSourceSha)fail('source_sha');
 if(!inventory||inventory.databaseId!==databaseId||inventory.databaseName!==databaseName||inventory.success!==true||inventory.rowsWritten!==0||inventory.objectCount!==0)fail('nonempty_or_unverified');
 if(!Array.isArray(workerBindings)||workerBindings.length===0)fail('bindings_missing');
 if(workerBindings.some(b=>!b||typeof b!=='object'||typeof b.worker!=='string'||!Array.isArray(b.databaseIds)))fail('bindings_invalid');
 if(workerBindings.some(b=>b.databaseIds.includes(databaseId)))fail('database_bound_to_worker');
 // A checked list is not proof all Workers were enumerated.
 return {
  kind:'isolated_restore_target_offline_review',
  databaseId,databaseName,sourceSha:approvedSourceSha,
  emptyCatalogObserved:true,listedWorkerBindingsDoNotContainTarget:true,
  allAccountAccessPathsVerified:false,
  isolatedRestoreAuthorized:false,
  retainedBackupApproved:false,
  backupSha256IndependentlyVerified:false,
  restoreExecuted:false,
  productionWriteAuthorized:false,
  status:'HOLD_OWNER_AND_INDEPENDENT_RECOVERY_APPROVAL'
 };
}
