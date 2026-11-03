// Offline-only compatibility for pre-contract protected backup export receipts.
// The supplied JSON is data, never independent proof that a GitHub run occurred.
import {validateCandidateReceipt} from './qualify-private-pop-backup-evidence-offline.mjs';
const fail=code=>{throw Error('historical_candidate_hold_'+code)};
const exact=(v,names,code)=>{
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==names.length||
 names.some(k=>!Object.hasOwn(v,k)))fail(code);
};
const historicalKeys=['kind','sourceSha','sourceDatabase','candidateKey','bytes','sha256','exportBookmark','privateRoundtripVerified','backupIndependentlyApproved','restorePerformed','productionDataOrSchemaWritten'];
const observationKeys=['kind','candidateKey','bytes','sha256','tableCount','rowCountsSha256','sqliteIntegrityPassed','foreignKeyViolations','originalProtectedReceiptAuthenticated','exportBookmarkIndependentlyVerified','rpoApproved','retentionEnforced','representativeR2ObjectVerified','independentRestoreApproval','restoreExecuted','productionWriteAuthorized','disposition'];
const ACCOUNT='ddd23cab31928a4bb3d4998df9b26d1d';
const DATABASE='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
const BUCKET='bw-compliance-ops-backups';
const ORIGINAL='candidates/41709222476/1/production-d1.sql';
const ORIGINAL_SOURCE='a474d04678f6dfdec75507a8ee58058b2db3d1f2';
const ORIGINAL_BYTES=3224706;
export function reconcileHistoricalCandidateReceipt(historical,observation){
 exact(historical,historicalKeys,'historical_shape');
 exact(observation,observationKeys,'observation_shape');
 if(historical.kind!=='private_production_backup_candidate'||
 historical.sourceDatabase!==DATABASE||historical.sourceSha!==ORIGINAL_SOURCE||
 historical.candidateKey!==ORIGINAL||historical.bytes!==ORIGINAL_BYTES||
 historical.privateRoundtripVerified!==true||
 historical.backupIndependentlyApproved!==false||
 historical.restorePerformed!==false||historical.productionDataOrSchemaWritten!==false)fail('historical_authority');
 if(observation.kind!=='protected_versioned_candidate_bytes_readonly'||
 observation.candidateKey!==historical.candidateKey||
 observation.bytes!==historical.bytes||
 observation.sha256!==historical.sha256||
 observation.sqliteIntegrityPassed!==true||
 observation.foreignKeyViolations!==0||
 !Number.isSafeInteger(observation.tableCount)||observation.tableCount<1||
 !/^[a-f0-9]{64}$/.test(observation.rowCountsSha256||''))fail('observation_mismatch');
 if(observation.originalProtectedReceiptAuthenticated!==false||
 observation.exportBookmarkIndependentlyVerified!==false||
 observation.rpoApproved!==false||observation.retentionEnforced!==false||
 observation.representativeR2ObjectVerified!==false||
 observation.independentRestoreApproval!==false||observation.restoreExecuted!==false||
 observation.productionWriteAuthorized!==false||
 observation.disposition!=='HOLD_PROVENANCE_RETENTION_AND_INDEPENDENT_RESTORE_APPROVAL_REQUIRED')fail('unexpected_observation_claim');
 const candidate={kind:'private_production_backup_candidate',accountId:ACCOUNT,databaseId:DATABASE,bucket:BUCKET,
 sourceSha:historical.sourceSha,runId:'41709222476',attempt:'1',
 candidateKey:historical.candidateKey,bytes:historical.bytes,sha256:historical.sha256,
 exportBookmark:historical.exportBookmark,privateRoundtripVerified:true};
 validateCandidateReceipt(candidate);
 return Object.freeze({kind:'historical_candidate_offline_reconciliation',candidate,
  receiptAndObservationFieldsMatch:true,
  githubReceiptOriginIndependentlyAuthenticated:false,
  protectedObservationOriginIndependentlyAuthenticated:false,
  retentionEnforced:false,restoreApproved:false,productionWriteAuthorized:false,
  disposition:'HOLD_AUTHENTIC_SOURCE_REFS_POLICY_AND_RESTORE_APPROVAL'});
}
