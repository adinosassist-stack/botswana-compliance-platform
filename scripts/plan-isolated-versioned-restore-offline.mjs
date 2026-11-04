// Non-executing plan. Does not read SQL, call Cloudflare, or authorize a restore.
const fail=code=>{throw Error('versioned_restore_hold_'+code)};
const SOURCE='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
const TARGET='be15acba-ba16-4704-9498-e296a164b3a2';
const KEY='candidates/41709222476/1/production-d1.sql';
const HASH='2363d0cfc85a76e3cfef7c33a9f2f70a38899174042e23683aa663dfcbaf3f33';
const BOOKMARK='00000631-00000000-00005118-8099f81bbc6bad9cf65686bdc2a6b851';
const exact=(obj,names)=>{if(!obj||Array.isArray(obj)||typeof obj!=='object'||Object.keys(obj).length!==names.length||names.some(k=>!Object.hasOwn(obj,k)))fail('shape')};
export function planIsolatedVersionedRestore(input){
 exact(input,['sourceDatabaseId','targetDatabaseId','candidateKey','sha256','exportBookmark','bytes','targetObjectCount','targetRowsWritten','reviewedMainSha','ownerRestoreApproval','independentRestoreApproval']);
 if(input.sourceDatabaseId!==SOURCE||input.targetDatabaseId!==TARGET||input.sourceDatabaseId===input.targetDatabaseId)fail('database_identity');
 if(input.candidateKey!==KEY||input.sha256!==HASH||input.exportBookmark!==BOOKMARK||input.bytes!==3224706)fail('candidate_evidence');
 if(input.targetObjectCount!==0||input.targetRowsWritten!==0)fail('nonempty_target');
 if(typeof input.reviewedMainSha!=='string'||!/^[a-f0-9]{40}$/.test(input.reviewedMainSha))fail('revision');
 if(input.ownerRestoreApproval!==false||input.independentRestoreApproval!==false)fail('unverified_approval_claim');
 return Object.freeze({kind:'isolated_versioned_restore_review_only',candidateKey:KEY,sourceDatabaseId:SOURCE,targetDatabaseId:TARGET,
  reviewedMainSha:input.reviewedMainSha,expectedSha256:HASH,bytes:3224706,
  timeTravelRestoreAllowed:false,productionDatabaseMutationAllowed:false,
  isolatedD1ImportAuthorized:false,originalExportBookmark:BOOKMARK,
  sourceEvidenceIndependentlyCheckedInThisInvocation:false,targetEmptyIndependentlyCheckedInThisInvocation:false,
  ownerRestoreApprovalVerified:false,independentRestoreApprovalVerified:false,
  retentionEnforced:false,restoreExecuted:false,productionWriteAuthorized:false,
  disposition:'HOLD_FOR_SEPARATE_VERSIONED_RESTORE_DESIGN_AND_INDEPENDENT_APPROVAL'});
}
