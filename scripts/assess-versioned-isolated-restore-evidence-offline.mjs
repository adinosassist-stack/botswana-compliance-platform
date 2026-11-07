// Offline-only gate for proposed versioned isolated restore evidence. No API calls or writes.
// Operator-provided observations are never authenticated by this function.
const fail=reason=>{throw Error('isolated_restore_evidence_hold_'+reason)};
const SOURCE='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce';
const TARGET='be15acba-ba16-4704-9498-e296a164b3a2';
const BUCKET='bw-compliance-ops-backups';
const KEY='candidates/42293276778/1/production-d1.sql';
const HASH='4e1674e65b7cae766ba07f1c009550b0aee60bca6fc08121ce91928d55f04a1a';
const SHA=/^[0-9a-f]{40}$/;
const fields=(x,keys)=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).length!==keys.length||keys.some(k=>!Object.hasOwn(x,k)))fail('shape')};
const instant=value=>{if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail('timestamp');return Date.parse(value)};
export function assessVersionedRestoreEvidence(input){
 fields(input,['sourceDatabaseId','target','candidate','retention','reviewedMainSha','observedAt','evaluatedAt']);
 const now=instant(input.evaluatedAt),at=instant(input.observedAt);
 if(now<at||now-at>15*60*1000)fail('stale_observation');
 if(!SHA.test(input.reviewedMainSha)||input.sourceDatabaseId!==SOURCE)fail('source_identity');
 fields(input.target,['databaseId','name','schemaObjects','writes','workerBound']);
 if(input.target.databaseId!==TARGET||input.target.name!=='bw-compliance-os-ops-restore-candidate-20261103'||
    input.target.schemaObjects!==0||input.target.writes!==0||input.target.workerBound!==false)fail('target_not_isolated_empty');
 fields(input.candidate,['bucket','key','bytes','sha256','byteHashIndependentlyVerified']);
 if(input.candidate.bucket!==BUCKET||input.candidate.key!==KEY||input.candidate.bytes!==3393714||
    input.candidate.sha256!==HASH||input.candidate.byteHashIndependentlyVerified!==true)fail('backup_provenance');
 fields(input.retention,['ruleId','prefix','enabled','type','maxAgeSeconds','objectListed','lastModified']);
 if(input.retention.ruleId!=='candidates-30-day-retention'||input.retention.prefix!=='candidates/'||
   input.retention.enabled!==true||input.retention.type!=='Age'||input.retention.maxAgeSeconds!==2592000||
   input.retention.objectListed!==true)fail('retention_policy');
 const modified=instant(input.retention.lastModified);
 if(modified>now||now-modified>=2592000*1000)fail('outside_retention_window');
 return Object.freeze({
   kind:'versioned_isolated_restore_evidence_preflight',reviewedMainSha:input.reviewedMainSha,
   expectedCandidateKey:KEY,expectedSha256:HASH,sourceDatabaseId:SOURCE,targetDatabaseId:TARGET,
   operatorAssertionsPassed:true,cloudflareObservationsAuthenticatedByThisFunction:false,
   historicalByteIntegrityIndependentlyReverifiedNow:false,
   targetExclusivityIndependentlyConfirmed:false,objectDeleteProtectionObserved:false,
   actualRestoreApproved:false,independentApprovalVerified:false,
   restoreImportAllowed:false,productionDatabaseWriteAllowed:false,restoreExecuted:false,
   disposition:'HOLD_PROTECTED_VERSIONED_RESTORE_APPROVAL_AND_OPERATIONAL_QUALIFICATION'
 });
}
