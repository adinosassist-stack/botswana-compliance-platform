import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCandidateReceipt} from '../scripts/qualify-private-pop-backup-evidence-offline.mjs';
const sha='a'.repeat(40);
const valid={kind:'private_production_backup_candidate',accountId:'ddd23cab31928a4bb3d4998df9b26d1d',
 databaseId:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce',bucket:'bw-compliance-ops-backups',
 sourceSha:sha,runId:'41709222476',attempt:'1',candidateKey:'candidates/41709222476/1/production-d1.sql',
 bytes:3224706,sha256:'b'.repeat(64),exportBookmark:'v1-backup-bookmark',privateRoundtripVerified:true};
test('complete candidate receipt remains explicitly unapproved',()=>{
 const x=validateCandidateReceipt(valid,{expectedMainSha:sha});
 assert.equal(x.candidateKey,valid.candidateKey);
 assert.equal(x.disposition,'HOLD_INDEPENDENT_EVIDENCE_AND_RECOVERY_APPROVAL_REQUIRED');
 for(const flag of ['remotelyVerifiedSha256','retentionApproved','restoreApproved','tenantIsolationApproved','rollbackApproved','productionWriteAuthorized','productionMigrationExecuted','popIngestionEnabled','subscriptionActivated'])assert.equal(x[flag],false);
});
test('cannot silently change target account, bucket, or database',()=>{
 for(const patch of [{accountId:'other'},{databaseId:'other'},{bucket:'public'}])assert.throws(()=>validateCandidateReceipt({...valid,...patch}),/authority/);
});
test('rejects stale source, mismatched key, run or attempt',()=>{
 assert.throws(()=>validateCandidateReceipt(valid,{expectedMainSha:'c'.repeat(40)}),/stale_source/);
 for(const patch of [{runId:'0'},{attempt:'0'},{candidateKey:'approved-d1-backup.sql'},{candidateKey:'candidates/41709222476/2/production-d1.sql'}])assert.throws(()=>validateCandidateReceipt({...valid,...patch}),/run_identity|candidate_key_mismatch/);
});
test('rejects malformed checksums, missing bookmark and size drift',()=>{
 for(const patch of [{sha256:'e0421f30a8b558fe884d0b779452ac24'},{sha256:'f'.repeat(63)},{exportBookmark:''},{bytes:0},{bytes:25*1024*1024+1},{bytes:3.1},{privateRoundtripVerified:false}])assert.throws(()=>validateCandidateReceipt({...valid,...patch}),/pop_candidate_evidence_hold_/);
});
test('forbids extra fields that might carry secrets or private backup content',()=>{
 for(const patch of [{signedUrl:'https://example.com'},{token:'secret'},{tenantIds:['example']},{sql:'CREATE TABLE...'}])assert.throws(()=>validateCandidateReceipt({...valid,...patch}),/unexpected_fields/);
});
test('missing or non-structural receipt fails closed',()=>{
 for(const input of [null,[],{},'text',{...valid,exportBookmark:undefined}])assert.throws(()=>validateCandidateReceipt(input),/pop_candidate_evidence_hold_/);
});
