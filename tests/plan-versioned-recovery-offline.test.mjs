import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVersionedRecoveryReviewPlan} from '../scripts/plan-versioned-recovery-offline.mjs';
const main='c'.repeat(40),id='be15acba-ba16-4704-9498-e296a164b3a2';
const input={
 candidate:{kind:'private_production_backup_candidate',accountId:'ddd23cab31928a4bb3d4998df9b26d1d',databaseId:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce',bucket:'bw-compliance-ops-backups',sourceSha:'a474d04678f6dfdec75507a8ee58058b2db3d1f2',runId:'41709222476',attempt:'1',candidateKey:'candidates/41709222476/1/production-d1.sql',bytes:3224706,sha256:'a'.repeat(64),exportBookmark:'backup-v1-token',privateRoundtripVerified:true},
 target:{accountId:'ddd23cab31928a4bb3d4998df9b26d1d',databaseId:id,expectedDatabaseId:id,databaseName:'bw-compliance-os-ops-restore-candidate-20261103',approvedSourceSha:main,reviewedSourceSha:main,inventory:{databaseId:id,databaseName:'bw-compliance-os-ops-restore-candidate-20261103',success:true,rowsWritten:0,objectCount:0},workerBindings:[{worker:'ops-rehearsal',databaseIds:['c5c232a8-8fe7-440c-81ba-021a44fd3fdd']}]},
 policy:{maximumRpoMinutes:120,retentionDays:30,retentionPolicyReview:'review/retention-001',storageAccessReview:'review/access-001',restoreIsolationReview:'review/isolation-001',sampleEvidenceReview:'review/sample-001'},
 review:{owner:'owner',independentReviewer:'thusico',ownerReference:'owner/ticket-001',independentReference:'review/ticket-001',reviewedMainSha:main}
};
const clone=()=>structuredClone(input);
test('valid synthetic evidence produces deterministic no-write HOLD, not authority',()=>{
 const a=buildVersionedRecoveryReviewPlan(input);
 const b=buildVersionedRecoveryReviewPlan(clone());
 assert.equal(a.evidenceDigest,b.evidenceDigest);
 assert.equal(a.claims.restoreExecuted,false);
 assert.equal(a.claims.ownerApprovalIndependentlyVerified,false);
 assert.equal(a.claims.retentionEnforced,false);
 assert.equal(a.claims.productionWriteAuthorized,false);
 assert.notEqual(a.backupExportSourceSha,a.reviewedMainSha);
});
test('rejects missing and extra evidence fields to avoid accidental secrets',()=>{
 for(const update of [null,{}, {...clone(),secret:'x'}])assert.throws(()=>buildVersionedRecoveryReviewPlan(update),/input_shape/);
});
test('candidate key, hash and source cannot be fabricated',()=>{
 for(const patch of [{candidateKey:'approved-d1-backup.sql'},{sha256:'etag-not-sha256'},{sourceSha:'other'}]){
  const o=clone();Object.assign(o.candidate,patch);
  assert.throws(()=>buildVersionedRecoveryReviewPlan(o),/pop_candidate_evidence_hold_/);
 }
});
test('historical populated, exposed and production targets are forbidden',()=>{
 for(const patch of [{inventory:{...input.target.inventory,objectCount:572}},{workerBindings:[{worker:'x',databaseIds:[id]}]},{databaseId:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce'}]){
  const o=clone();Object.assign(o.target,patch);
  assert.throws(()=>buildVersionedRecoveryReviewPlan(o),/isolated_restore_target_hold_/);
 }
});
test('rejects absent policy references, unreasonable RPO and retention',()=>{
 for(const patch of [{maximumRpoMinutes:0},{retentionDays:0},{maximumRpoMinutes:20000},{retentionDays:3651},{retentionPolicyReview:''},{sampleEvidenceReview:'x'}]){
  const o=clone();Object.assign(o.policy,patch);
  assert.throws(()=>buildVersionedRecoveryReviewPlan(o),/versioned_recovery_plan_hold_/);
 }
});
test('requires distinct owner and independent reviewer and exact current-source review',()=>{
 for(const patch of [{independentReviewer:'owner'},{ownerReference:'x'},{reviewedMainSha:'b'.repeat(40)}]){
  const o=clone();Object.assign(o.review,patch);
  assert.throws(()=>buildVersionedRecoveryReviewPlan(o),/versioned_recovery_plan_hold_/);
 }
});
test('material evidence changes the deterministic digest',()=>{
 const o=clone();o.policy.retentionDays=60;
 assert.notEqual(buildVersionedRecoveryReviewPlan(o).evidenceDigest,buildVersionedRecoveryReviewPlan(input).evidenceDigest);
});

test('rejects an unreviewed substitute empty D1 even with matching assertions',()=>{
 const o=clone();
 const substitute='11111111-2222-4333-8444-555555555555';
 o.target.databaseId=substitute;
 o.target.expectedDatabaseId=substitute;
 o.target.inventory.databaseId=substitute;
 assert.throws(()=>buildVersionedRecoveryReviewPlan(o),/unapproved_restore_target/);
});
test('rejects alternate candidate names despite using the approved database UUID',()=>{
 const o=clone();
 o.target.databaseName='bw-compliance-os-ops-restore-candidate-test1';
 o.target.inventory.databaseName=o.target.databaseName;
 assert.throws(()=>buildVersionedRecoveryReviewPlan(o),/unapproved_restore_target/);
});
