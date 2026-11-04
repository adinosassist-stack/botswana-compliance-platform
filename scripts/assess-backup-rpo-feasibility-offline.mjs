// Offline policy feasibility assessment. Never starts a backup, restores data or approves RPO.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const fail=c=>{throw Error('backup_rpo_hold_'+c)};
const EXACT_KEYS=['maximumRpoMinutes','retentionDays','observedAt','windowStart','verifiedRecoveryPoints'];
const POINT_KEYS=['completedAt','candidateKey','sha256','receiptAndBytesMatched'];
const SHA=/^[a-f0-9]{64}$/;
const KEY=/^candidates\/[1-9][0-9]*\/[1-9][0-9]*\/production-d1\.sql$/;
const exact=(v,k,c)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==k.length||k.some(x=>!Object.hasOwn(v,x)))fail(c)};
const date=s=>{if(typeof s!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/.test(s))fail('time_format');const n=Date.parse(s);if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,19)!==s.slice(0,19))fail('time_invalid');return n};
export function assessBackupRpoWindow(input,{workflowHasSchedule=false}={}){
 exact(input,EXACT_KEYS,'input_shape');
 if(input.maximumRpoMinutes!==120||input.retentionDays!==30)fail('unreviewed_policy');
 if(typeof workflowHasSchedule!=='boolean')fail('schedule_assertion');
 const now=date(input.observedAt),start=date(input.windowStart);
 if(start>=now)fail('window_invalid');
 if(!Array.isArray(input.verifiedRecoveryPoints)||input.verifiedRecoveryPoints.length>10000)fail('points_shape');
 let prev=start,maxGap=0;
 const points=[];
 for(const p of input.verifiedRecoveryPoints){
  exact(p,POINT_KEYS,'point_shape');
  if(typeof p.candidateKey!=='string'||!KEY.test(p.candidateKey)||typeof p.sha256!=='string'||!SHA.test(p.sha256)||p.receiptAndBytesMatched!==true)fail('unverified_point');
  const t=date(p.completedAt);
  if(t<=prev||t>now)fail('point_order_or_bounds');
  maxGap=Math.max(maxGap,t-prev);prev=t;
  points.push({key:p.candidateKey,completedAt:p.completedAt});
 }
 maxGap=Math.max(maxGap,now-prev);
 const maxGapMinutes=maxGap/60000;
 // An operator-supplied timestamp list is never cryptographic proof of backup freshness.
 return {kind:'offline_backup_rpo_feasibility_review',maximumRpoMinutes:120,retentionDays:30,
  observedRecoveryPoints:points.length,maximumObservedGapMinutes:maxGapMinutes,
  suppliedWindowWithinTarget:maxGapMinutes<=120,
  scheduleTriggerObservedInWorkflow:workflowHasSchedule,
  operatorTimestampsIndependentlyVerified:false,
  sustainedRpoQualified:false,immutableRetentionConfigured:false,restoreAuthorized:false,
  disposition:'HOLD_INDEPENDENT_BACKUP_CADENCE_RETENTION_AND_RESTORE_REVIEW'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length!==4)fail('input_and_workflow_required');
  const workflow=readFileSync(process.argv[3],'utf8');
  // Intentionally conservative: do not treat cron strings in comments as an enabled trigger.
  const hasSchedule=/^  schedule:\s*$/m.test(workflow);
  const result=assessBackupRpoWindow(JSON.parse(readFileSync(process.argv[2],'utf8')),{workflowHasSchedule:hasSchedule});
  console.log(JSON.stringify(result,null,2));
 }catch(e){console.error(String(e?.message||'').startsWith('backup_rpo_hold_')?e.message:'backup_rpo_hold_invalid_input');process.exitCode=2}
}
