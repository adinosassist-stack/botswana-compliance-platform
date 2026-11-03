import test from 'node:test';
import assert from 'node:assert/strict';
import {assessBackupRpoWindow} from '../scripts/assess-backup-rpo-feasibility-offline.mjs';
const point=(time,n)=>({completedAt:time,candidateKey:'candidates/'+n+'/1/production-d1.sql',sha256:'a'.repeat(64),receiptAndBytesMatched:true});
const base={maximumRpoMinutes:120,retentionDays:30,windowStart:'2026-11-03T10:00:00Z',observedAt:'2026-11-03T14:00:00Z',verifiedRecoveryPoints:[point('2026-11-03T11:30:00Z',41709222476),point('2026-11-03T13:00:00Z',41710740133)]};
test('fitting declared RPO gaps never grant release authority',()=>{
 const x=assessBackupRpoWindow(base);
 assert.equal(x.maximumObservedGapMinutes,90);
 assert.equal(x.suppliedWindowWithinTarget,true);
 assert.equal(x.sustainedRpoQualified,false);
 assert.equal(x.immutableRetentionConfigured,false);
 assert.equal(x.scheduleTriggerObservedInWorkflow,false);
});
test('missing backups reveal RPO gap but still no write authority',()=>{
 const x=assessBackupRpoWindow({...base,verifiedRecoveryPoints:[point('2026-11-03T11:30:00Z',41709222476)]});
 assert.equal(x.maximumObservedGapMinutes,150);
 assert.equal(x.suppliedWindowWithinTarget,false);
 assert.equal(x.restoreAuthorized,false);
});
test('rejects source tampering and false recovery point records',()=>{
 for(const patch of [{retentionDays:31},{maximumRpoMinutes:60},
 {verifiedRecoveryPoints:[{...base.verifiedRecoveryPoints[0],receiptAndBytesMatched:false}]},
 {verifiedRecoveryPoints:[{...base.verifiedRecoveryPoints[0],sha256:'etag'}]},
 {verifiedRecoveryPoints:[base.verifiedRecoveryPoints[1],base.verifiedRecoveryPoints[0]]},
 {observedAt:'invalid'}]){
 assert.throws(()=>assessBackupRpoWindow({...structuredClone(base),...patch}),/backup_rpo_hold_/);
 }
});
