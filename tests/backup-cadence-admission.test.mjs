import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyBackupCadenceAdmission as qualify} from '../scripts/qualify-backup-cadence-admission.mjs';
const sha='a'.repeat(40);
const receipt=(id,time)=>({candidateKey:`candidates/${id}/1/production-d1.sql`,sourceSha:sha,sha256:'b'.repeat(64),bytes:2500000,privateRoundtripVerified:true,lockVerified:true,bookmarkVerified:true,finishedAt:time});
const base=()=>({sourceSha:sha,currentMainSha:sha,designApprovedByOwner:true,designApprovedByIndependentReviewer:true,dedicatedWriterIdentityReviewed:true,monitorIdentitySeparate:true,exclusiveWritePathReviewed:true,lockChangeAuthoritiesReviewed:true,scheduleMinutes:60,receipts:[receipt(1,'2026-11-04T18:00:00Z'),receipt(2,'2026-11-04T19:00:00Z'),receipt(3,'2026-11-04T20:00:00Z')],observedAt:'2026-11-04T20:30:00Z',incidentEscalationTestPassed:true,isolatedRestoreTestPassed:true,tenantIsolationTestPassed:true,rollbackTestPassed:true});
test('passing offline evidence still denies restore, production write, release and formal RPO',()=>{let r=qualify(base());assert.equal(r.eligibleForSecurityReview,true);for(let f of ['rpoQualified','restoreAuthorized','productionWriteAuthorized','productionReleaseAuthorized'])assert.equal(r[f],false)});
for(const [name,mutate,reason] of [
 ['missing review',p=>p.designApprovedByIndependentReviewer=false,'design_review_missing'],
 ['stale source',p=>p.currentMainSha='c'.repeat(40),'source_not_current'],
 ['overprivileged writer unreviewed',p=>p.dedicatedWriterIdentityReviewed=false,'access_review_missing'],
 ['unreviewed lock authority',p=>p.lockChangeAuthoritiesReviewed=false,'access_review_missing'],
 ['too infrequent schedule',p=>p.scheduleMinutes=121,'cadence_design_out_of_bounds'],
 ['missing receipts',p=>p.receipts=p.receipts.slice(0,2),'insufficient_receipts'],
 ['duplicate key',p=>p.receipts[2].candidateKey=p.receipts[1].candidateKey,'duplicate_candidate_key'],
 ['unverified hash',p=>p.receipts[1].sha256='bad','invalid_receipt'],
 ['unverified private readback',p=>p.receipts[1].privateRoundtripVerified=false,'invalid_receipt'],
 ['no lock evidence',p=>p.receipts[1].lockVerified=false,'invalid_receipt'],
 ['unverified bookmark',p=>p.receipts[1].bookmarkVerified=false,'invalid_receipt'],
 ['gap over two hours',p=>p.receipts[2].finishedAt='2026-11-04T22:05:00Z','observed_gap_exceeds_rpo'],
 ['stale newest',p=>p.observedAt='2026-11-04T23:00:01Z','latest_receipt_stale'],
 ['unqualified restore',p=>p.isolatedRestoreTestPassed=false,'recovery_drills_missing'],
 ['unqualified tenant isolation',p=>p.tenantIsolationTestPassed=false,'recovery_drills_missing'],
 ['rollback not tested',p=>p.rollbackTestPassed=false,'recovery_drills_missing']
])test('fails closed: '+name,()=>{let p=base();mutate(p);const r=qualify(p);assert.equal(r.reason,reason);assert.equal(r.eligibleForSecurityReview,false);assert.equal(r.productionReleaseAuthorized,false)});
