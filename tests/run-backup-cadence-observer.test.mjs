import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMonitorAuthority,decideCandidateCadence,runBackupMonitor} from '../scripts/run-backup-cadence-observer.mjs';
const env=()=>({
 GITHUB_REPOSITORY:'adinosassist-stack/botswana-compliance-platform',GITHUB_REF:'refs/heads/main',
 GITHUB_SHA:'a'.repeat(40),GITHUB_EVENT_NAME:'schedule',BACKUP_CADENCE_OBSERVER_ENABLED:'true',
 BACKUP_MONITOR_ACCOUNT_ID:'ddd23cab31928a4bb3d4998df9b26d1d',BACKUP_R2_READONLY_TOKEN:'synthetic-token'
});
const report=age=>({kind:'r2_backup_candidate_metadata_freshness_only',
 latestAgeMinutes:age,newestCandidateKey:'candidates/41710740133/1/production-d1.sql',
 newestCandidateLastModified:'2026-11-03T20:16:23.971Z',
 maxObservedGapLast24hMinutes:age,observedCandidateCountLast24h:12,observationWindowHours:24,
 sustainedRpoQualified:false,restoreAuthorized:false,productionWriteAuthorized:false});
test('a schedule requires an exact repo/main, enabled operator flag and separate read-only token',()=>{
 assert.equal(validateMonitorAuthority(env()),true);
 for(const patch of [
  {GITHUB_REPOSITORY:'other/repo'},{GITHUB_REF:'refs/heads/test'},
  {GITHUB_SHA:'bad'},{GITHUB_EVENT_NAME:'pull_request'},
  {BACKUP_CADENCE_OBSERVER_ENABLED:'false'},
  {BACKUP_MONITOR_ACCOUNT_ID:'other'},{BACKUP_R2_READONLY_TOKEN:''},
  {GITHUB_EVENT_NAME:'workflow_dispatch',BACKUP_MONITOR_CONFIRM:'DO_NOT_RUN'}
 ])assert.throws(()=>validateMonitorAuthority({...env(),...patch}),/backup_monitor_hold_/);
 assert.equal(validateMonitorAuthority({...env(),GITHUB_EVENT_NAME:'workflow_dispatch',BACKUP_MONITOR_CONFIRM:'READ_ONLY_CADENCE_OBSERVATION'}),true);
});
test('90 and 120 minute thresholds remain a HOLD, including on fresh metadata',()=>{
 for(const [age,want] of [[5,'OBSERVED_RECENT'],[89.99,'OBSERVED_RECENT'],[90,'WARNING'],[120,'WARNING'],[120.01,'STALE']]){
  const r=decideCandidateCadence(report(age));
  assert.equal(r.severity,want);assert.equal(r.rpoQualified,false);
  assert.equal(r.restoreAuthorized,false);assert.equal(r.productionWriteAuthorized,false);
  assert.match(r.disposition,/^HOLD_/);
 }
});
test('a fresh newest candidate cannot conceal a two-hour breach in the observed 24-hour window',()=>{
 const alert=decideCandidateCadence({...report(15),maxObservedGapLast24hMinutes:1080,observedCandidateCountLast24h:2});
 assert.equal(alert.severity,'WINDOW_GAP');
 assert.equal(alert.windowGapDetected,true);
 assert.equal(alert.latestAgeMinutes,15);
 assert.equal(alert.maxObservedGapLast24hMinutes,1080);
 assert.equal(alert.rpoQualified,false);
 assert.match(alert.disposition,/^HOLD_/);
 const healthyObservation=decideCandidateCadence({...report(10),maxObservedGapLast24hMinutes:119.99});
 assert.equal(healthyObservation.severity,'OBSERVED_RECENT');
 assert.equal(healthyObservation.windowGapDetected,false);
 assert.equal(healthyObservation.rpoQualified,false);
 const boundary=decideCandidateCadence({...report(10),maxObservedGapLast24hMinutes:120});
 assert.equal(boundary.severity,'OBSERVED_RECENT');
 const gap=decideCandidateCadence({...report(10),maxObservedGapLast24hMinutes:120.01});
 assert.equal(gap.severity,'WINDOW_GAP');
});

test('rejects invented restore authority and malformed metadata',()=>{
 for(const item of [{...report(45),restoreAuthorized:true},{...report(45),sustainedRpoQualified:true},
   {...report(45),productionWriteAuthorized:true},report(-1),report(NaN),
   {...report(45),maxObservedGapLast24hMinutes:NaN},
   {...report(45),maxObservedGapLast24hMinutes:1440.01},
   {...report(45),observedCandidateCountLast24h:-1},
   {...report(45),observationWindowHours:23}])
  assert.throws(()=>decideCandidateCadence(item),/backup_monitor_hold_/);
});
test('live transport adapter is restricted to two GET metadata requests',async()=>{
 const lock={success:true,result:{rules:[{id:'candidates-30-day-retention',enabled:true,prefix:'candidates/',condition:{type:'Age',maxAgeSeconds:2592000}}]}};
 const listing={success:true,result:[{key:'candidates/41710740133/1/production-d1.sql',size:3225845,last_modified:'2026-11-03T20:16:23.971Z'}]};
 let n=0;
 const result=await runBackupMonitor(env(),{now:'2026-11-04T17:30:00Z',fetchImpl:async(url,options)=>{
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  assert.match(url,/\/(lock|objects\?prefix=candidates%2F&per_page=1000)$/);
  return {ok:true,text:async()=>JSON.stringify([lock,listing][n++])};
 }});
 assert.equal(n,2);assert.equal(result.severity,'STALE');assert.equal(result.productionWriteAuthorized,false);
});
