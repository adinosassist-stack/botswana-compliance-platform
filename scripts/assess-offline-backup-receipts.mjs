// Offline, untrusted metadata evaluation only. Never authorizes backup creation,
// restore, a sustained RPO claim, or any production operation.
const SHA=/^[a-f0-9]{40}$/;
const HASH=/^[a-f0-9]{64}$/;
const KEY=/^candidates\/[1-9]\d*\/[1-9]\d*\/production-d1\.sql$/;
const reject=code=>{throw new Error('candidate_receipt_hold_'+code)};
const parseTime=value=>{
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value))reject('timestamp');
 const ms=Date.parse(value);
 if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,19)!==value.slice(0,19))reject('timestamp');
 return ms;
};
export function assessOfflineReceiptWindow(receipts,{sourceSha,observedAt,windowHours=24,maxGapMinutes=120}={}){
 if(!SHA.test(sourceSha||'')||windowHours!==24||maxGapMinutes!==120||
    !Array.isArray(receipts)||receipts.length>1000)reject('authority_or_bounds');
 const end=parseTime(observedAt),start=end-windowHours*3600000;
 const seen=new Set();
 const records=receipts.map(r=>{
  if(!r||r.kind!=='private_production_backup_candidate'||r.sourceSha!==sourceSha||
   r.accountId!=='ddd23cab31928a4bb3d4998df9b26d1d'||
   r.databaseId!=='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce'||
   r.bucket!=='bw-compliance-ops-backups'||!KEY.test(r.candidateKey||'')||
   !HASH.test(r.sha256||'')||!Number.isSafeInteger(r.bytes)||r.bytes<=0||
   r.bytes>25*1024*1024||r.privateRoundtripVerified!==true||
   typeof r.exportBookmark!=='string'||r.exportBookmark.length<6||
   r.exportBookmark.length>300)reject('invalid_receipt');
  const parts=r.candidateKey.split('/');
  if(r.runId!==parts[1]||r.attempt!==parts[2]||seen.has(r.candidateKey))reject('duplicate_or_identity');
  seen.add(r.candidateKey);
  // Operator-supplied receiptTime is NOT proof of provider export/finish time.
  const time=parseTime(r.receiptTime);
  if(time>end)reject('future_receipt');
  return {time};
 }).sort((a,b)=>a.time-b.time);
 const within=records.filter(x=>x.time>=start);
 const before=records.filter(x=>x.time<start).at(-1);
 let previous=start,maxGap=0;
 if(before)previous=start; // Receipt prior to window cannot prove any interval within it.
 for(const record of within){
  maxGap=Math.max(maxGap,(record.time-previous)/60000);
  previous=record.time;
 }
 maxGap=Math.max(maxGap,(end-previous)/60000);
 const missingCoverage=within.length<2;
 const gapExceeds=maxGap>maxGapMinutes;
 return Object.freeze({
  kind:'offline_candidate_receipt_window_review',
  observationWindowHours:windowHours,
  observedReceiptCount:within.length,
  maxCandidateReceiptGapMinutes:Number(maxGap.toFixed(2)),
  candidateCadenceWithinThreshold:!missingCoverage&&!gapExceeds,
  // Metadata cannot prove object retention, non-overwrite, timestamp provenance,
  // scheduling reliability, export success or a restorable backup.
  independentlyVerified:false,sustainedRpoQualified:false,
  retentionAccepted:false,restoreAuthorized:false,productionWriteAuthorized:false,
  disposition:missingCoverage||gapExceeds?'HOLD_CANDIDATE_CADENCE_GAP':'HOLD_PROVIDER_EVIDENCE_AND_INDEPENDENT_ACCEPTANCE'
 });
}
