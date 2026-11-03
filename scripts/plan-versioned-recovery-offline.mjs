// Deterministic, offline-only recovery plan generator. Does not approve or execute a restore.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {validateCandidateReceipt} from './qualify-private-pop-backup-evidence-offline.mjs';
import {qualifyIsolatedRestoreTarget} from './qualify-pop-isolated-restore-target-offline.mjs';
const fail=code=>{throw Error('versioned_recovery_plan_hold_'+code)};
const sha=v=>createHash('sha256').update(v).digest('hex');
const R=/^[A-Za-z0-9_.:/#-]{8,240}$/;
const keys=(o,expected,code)=>{
 if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).length!==expected.length||
 expected.some(k=>!Object.hasOwn(o,k)))fail(code);
};
export function buildVersionedRecoveryReviewPlan(input){
 keys(input,['candidate','target','policy','review'], 'input_shape');
 const c=validateCandidateReceipt(input.candidate);
 const t=qualifyIsolatedRestoreTarget(input.target);
 keys(input.policy,['maximumRpoMinutes','retentionDays','retentionPolicyReview','storageAccessReview','restoreIsolationReview','sampleEvidenceReview'], 'policy_shape');
 keys(input.review,['owner','independentReviewer','ownerReference','independentReference','reviewedMainSha'], 'review_shape');
 if(!Number.isInteger(input.policy.maximumRpoMinutes)||input.policy.maximumRpoMinutes<1||input.policy.maximumRpoMinutes>10080)fail('rpo_unreviewable');
 if(!Number.isInteger(input.policy.retentionDays)||input.policy.retentionDays<1||input.policy.retentionDays>3650)fail('retention_unreviewable');
 for(const k of ['retentionPolicyReview','storageAccessReview','restoreIsolationReview','sampleEvidenceReview'])
  if(typeof input.policy[k]!=='string'||!R.test(input.policy[k]))fail('policy_review_reference');
 if(typeof input.review.owner!=='string'||typeof input.review.independentReviewer!=='string'||!R.test(input.review.ownerReference)||!R.test(input.review.independentReference)||
 !/^[a-f0-9]{40}$/.test(input.review.reviewedMainSha)||input.review.owner===input.review.independentReviewer)fail('review_identity');
 if(t.sourceSha!==input.review.reviewedMainSha)fail('reviewed_main_mismatch');
 // Backup source SHA is a historical export source; it need not equal current main.
 // Require no substitution of arbitrary historic database IDs/objects for this receipt.
 if(c.candidateKey!==input.candidate.candidateKey||t.databaseId!==input.target.databaseId)fail('identity');
 const evidence={
  candidate:{key:c.candidateKey,runId:c.runId,attempt:c.attempt,exportSourceSha:c.sourceSha,sha256:c.sha256,exportBookmark:c.exportBookmark,bytes:c.bytes},
  target:{databaseId:t.databaseId,databaseName:t.databaseName,reviewedMainSha:t.sourceSha},
  policy:{maximumRpoMinutes:input.policy.maximumRpoMinutes,retentionDays:input.policy.retentionDays},
  refs:{retention:input.policy.retentionPolicyReview,access:input.policy.storageAccessReview,isolation:input.policy.restoreIsolationReview,
   sample:input.policy.sampleEvidenceReview,owner:input.review.ownerReference,independent:input.review.independentReference},
 };
 const evidenceDigest=sha(JSON.stringify(evidence));
 return {
  kind:'versioned_recovery_nonexecuting_handoff',
  evidenceDigest,
  candidateKey:c.candidateKey,
  targetDatabaseId:t.databaseId,
  reviewedMainSha:t.sourceSha,
  backupExportSourceSha:c.sourceSha,
  claims:{candidateReceiptShapeVerified:true,targetInventoryShapeVerified:true,distinctListedWorkerBindingsChecked:true,
   backupBytesIndependentlyHashed:false,retentionEnforced:false,allWorkerBindingsAudited:false,
   ownerApprovalIndependentlyVerified:false,independentApprovalIndependentlyVerified:false,
   actualRecoveryPointAccepted:false,restoreExecuted:false,productionWriteAuthorized:false},
  next:'HOLD_FOR_INDEPENDENT_APPROVAL_AND_PROTECTED_VERSIONED_RESTORE'
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length!==3)fail('input_required');
  const plan=buildVersionedRecoveryReviewPlan(JSON.parse(readFileSync(process.argv[2],'utf8')));
  console.log(JSON.stringify(plan,null,2));
 }catch(e){
  console.error(String(e?.message||'').startsWith('versioned_recovery_plan_hold_')||
   String(e?.message||'').startsWith('isolated_restore_target_hold_')||
   String(e?.message||'').startsWith('pop_candidate_evidence_hold_')?e.message:'versioned_recovery_plan_hold_invalid_input');
  process.exitCode=2;
 }
}
