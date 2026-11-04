// Scheduled, opt-in, GET-only candidate freshness observation; never qualifies RPO or executes backups.
import {readCandidateFreshness} from './assess-r2-candidate-freshness.mjs';
import {pathToFileURL} from 'node:url';
const fail=code=>{throw Error('backup_monitor_hold_'+code)};
export function validateMonitorAuthority(env){
 if(env.GITHUB_REPOSITORY!=='adinosassist-stack/botswana-compliance-platform'||
    env.GITHUB_REF!=='refs/heads/main'||!(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||''))||
    !['schedule','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)||
    env.BACKUP_CADENCE_OBSERVER_ENABLED!=='true')fail('authority');
 if(env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.BACKUP_MONITOR_CONFIRM!=='READ_ONLY_CADENCE_OBSERVATION')fail('manual_confirmation');
 if(env.BACKUP_MONITOR_ACCOUNT_ID!=='ddd23cab31928a4bb3d4998df9b26d1d'||
    !env.BACKUP_R2_READONLY_TOKEN?.trim())fail('read_only_credential_missing');
 return true;
}
export function decideCandidateCadence(report){
 if(report?.kind!=='r2_backup_candidate_metadata_freshness_only'||
   report.sustainedRpoQualified!==false||report.restoreAuthorized!==false||
   report.productionWriteAuthorized!==false||
   !Number.isFinite(report.latestAgeMinutes)||report.latestAgeMinutes<0||
   report.observationWindowHours!==24||
   !Number.isFinite(report.maxObservedGapLast24hMinutes)||
   report.maxObservedGapLast24hMinutes<0||report.maxObservedGapLast24hMinutes>1440||
   !Number.isSafeInteger(report.observedCandidateCountLast24h)||
   report.observedCandidateCountLast24h<0||report.observedCandidateCountLast24h>1000)fail('untrusted_observation');
 const minutes=report.latestAgeMinutes;
 // Even a brand-new candidate is not a healthy cadence if the preceding
 // observation window contains a gap longer than the two-hour policy.
 const windowGapDetected=report.maxObservedGapLast24hMinutes>120;
 const severity=minutes>120?'STALE':windowGapDetected?'WINDOW_GAP':minutes>=90?'WARNING':'OBSERVED_RECENT';
 return {kind:'backup_candidate_recency_watchdog',severity,
  newestCandidateKey:report.newestCandidateKey,
  newestCandidateLastModified:report.newestCandidateLastModified,
  latestAgeMinutes:minutes,twoHourPolicyMinutes:120,earlyWarningMinutes:90,
  maxObservedGapLast24hMinutes:report.maxObservedGapLast24hMinutes,
  observedCandidateCountLast24h:report.observedCandidateCountLast24h,
  observationWindowHours:24,windowGapDetected,
  metadataCompletenessIndependentlyVerified:false,
  rpoQualified:false,restoreAuthorized:false,productionWriteAuthorized:false,
  disposition:severity==='OBSERVED_RECENT'?'HOLD_REQUIRE_RECOVERY_POINT_RECEIPTS':'HOLD_BACKUP_CADENCE_OPERATOR_INVESTIGATION'};
}
export async function runBackupMonitor(env=process.env,{fetchImpl=fetch,now=new Date().toISOString()}={}){
 validateMonitorAuthority(env);
 const report=await readCandidateFreshness({
  accountId:env.BACKUP_MONITOR_ACCOUNT_ID,token:env.BACKUP_R2_READONLY_TOKEN,observedAt:now,fetchImpl});
 return decideCandidateCadence(report);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const result=await runBackupMonitor();
  // Contains only filenames, timestamps and metadata — no bearer tokens or SQL.
  console.log(JSON.stringify(result));
  if(result.severity!=='OBSERVED_RECENT')process.exitCode=2;
 }catch{
  console.error('backup_monitor_hold_unverified_metadata_or_authority');
  process.exitCode=2;
 }
}
