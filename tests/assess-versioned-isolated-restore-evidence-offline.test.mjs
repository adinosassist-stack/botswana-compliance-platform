import test from 'node:test';
import assert from 'node:assert/strict';
import {assessVersionedRestoreEvidence} from '../scripts/assess-versioned-isolated-restore-evidence-offline.mjs';

const valid=()=>({
 sourceDatabaseId:'8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce',
 reviewedMainSha:'a'.repeat(40),
 observedAt:'2026-11-04T10:00:00.000Z',evaluatedAt:'2026-11-04T10:05:00.000Z',
 target:{databaseId:'be15acba-ba16-4704-9498-e296a164b3a2',name:'bw-compliance-os-ops-restore-candidate-20261103',schemaObjects:0,writes:0,workerBound:false},
 candidate:{bucket:'bw-compliance-ops-backups',key:'candidates/41709222476/1/production-d1.sql',bytes:3224706,
 sha256:'2363d0cfc85a76e3cfef7c33a9f2f70a38899174042e23683aa663dfcbaf3f33',
 byteHashIndependentlyVerified:true},
 retention:{ruleId:'candidates-30-day-retention',prefix:'candidates/',enabled:true,
 type:'Age',maxAgeSeconds:2592000,objectListed:true,lastModified:'2026-11-03T20:11:10.090Z'}
});
test('clean operator assertions remain HOLD, never import or claim independent verification',()=>{
 const x=assessVersionedRestoreEvidence(valid());
 assert.equal(x.operatorAssertionsPassed,true);
 for(const field of ['cloudflareObservationsAuthenticatedByThisFunction','historicalByteIntegrityIndependentlyReverifiedNow',
 'targetExclusivityIndependentlyConfirmed','objectDeleteProtectionObserved','actualRestoreApproved',
 'independentApprovalVerified','restoreImportAllowed','productionDatabaseWriteAllowed','restoreExecuted'])
 assert.equal(x[field],false,field);
 assert.match(x.disposition,/^HOLD_/);
});
test('production target, identity substitution or nonempty target are rejected',()=>{
 for(const patch of [
 {sourceDatabaseId:'be15acba-ba16-4704-9498-e296a164b3a2'},
 {target:{...valid().target,databaseId:valid().sourceDatabaseId}},
 {target:{...valid().target,schemaObjects:1}},
 {target:{...valid().target,writes:1}},
 {target:{...valid().target,workerBound:true}}
 ])assert.throws(()=>assessVersionedRestoreEvidence({...valid(),...patch}),/isolated_restore_evidence_hold_/);
});
test('forged candidate, broad retention scope, and missing lock coverage are rejected',()=>{
 for(const patch of [
 {candidate:{...valid().candidate,sha256:'b'.repeat(64)}},
 {candidate:{...valid().candidate,byteHashIndependentlyVerified:false}},
 {candidate:{...valid().candidate,bytes:1}},
 {candidate:{...valid().candidate,key:'approved-d1-backup.sql'}},
 {retention:{...valid().retention,prefix:'candidates'}},
 {retention:{...valid().retention,enabled:false}},
 {retention:{...valid().retention,objectListed:false}},
 {retention:{...valid().retention,maxAgeSeconds:3600}},
 {retention:{...valid().retention,lastModified:'2026-09-01T00:00:00.000Z'}}
 ])assert.throws(()=>assessVersionedRestoreEvidence({...valid(),...patch}),/isolated_restore_evidence_hold_/);
});
test('stale, future and malformed observations are rejected',()=>{
 for(const patch of [
 {observedAt:'2026-11-04T09:00:00.000Z'},
 {observedAt:'2026-11-04T10:06:00.000Z'},
 {evaluatedAt:'2026-11-04T10:05:00Z'},
 {reviewedMainSha:'current-main'},
 {retention:{...valid().retention,lastModified:'2026-11-04T10:07:00.000Z'}}
 ])assert.throws(()=>assessVersionedRestoreEvidence({...valid(),...patch}),/isolated_restore_evidence_hold_/);
});
test('additional unaudited authority fields are rejected',()=>{
 for(const patch of [{restoreApproved:true},{cloudflareToken:'secret'},
 {target:{...valid().target,productionWriteAllowed:true}},
 {candidate:{...valid().candidate,extra:'unreviewed'}}])
 assert.throws(()=>assessVersionedRestoreEvidence({...valid(),...patch}),/isolated_restore_evidence_hold_shape/);
});
