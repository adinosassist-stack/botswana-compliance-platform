// OFFLINE evidence/architecture gate. No Cloudflare calls, no credentials, no exports.
const SHA=/^[a-f0-9]{40}$/;
const KEY=/^candidates\/[1-9][0-9]*\/[1-9][0-9]*\/production-d1\.sql$/;
const fail=(reason)=>({eligibleForSecurityReview:false,reason,rpoQualified:false,restoreAuthorized:false,productionWriteAuthorized:false,productionReleaseAuthorized:false});
export function qualifyBackupCadenceAdmission(input){
  if(!input||typeof input!=='object'||Array.isArray(input))return fail('invalid_packet');
  if(input.sourceSha===undefined||!SHA.test(input.sourceSha)||input.sourceSha!==input.currentMainSha)return fail('source_not_current');
  if(input.designApprovedByOwner!==true||input.designApprovedByIndependentReviewer!==true)return fail('design_review_missing');
  if(input.dedicatedWriterIdentityReviewed!==true||input.monitorIdentitySeparate!==true||input.exclusiveWritePathReviewed!==true||input.lockChangeAuthoritiesReviewed!==true)return fail('access_review_missing');
  if(input.scheduleMinutes===undefined||!Number.isInteger(input.scheduleMinutes)||input.scheduleMinutes<15||input.scheduleMinutes>60)return fail('cadence_design_out_of_bounds');
  if(!Array.isArray(input.receipts)||input.receipts.length<3||input.receipts.length>1000)return fail('insufficient_receipts');
  const receipts=input.receipts;
  const seen=new Set();
  for(const r of receipts){
    if(!r||typeof r!=='object'||!KEY.test(r.candidateKey||'')||!SHA.test(r.sourceSha||'')||r.sourceSha!==input.sourceSha||
      !/^[a-f0-9]{64}$/.test(r.sha256||'')||!Number.isSafeInteger(r.bytes)||r.bytes<=0||
      r.privateRoundtripVerified!==true||r.lockVerified!==true||r.bookmarkVerified!==true||
      !Number.isFinite(Date.parse(r.finishedAt||'')))return fail('invalid_receipt');
    if(seen.has(r.candidateKey))return fail('duplicate_candidate_key');seen.add(r.candidateKey);
  }
  const times=receipts.map(r=>Date.parse(r.finishedAt));
  if(times.some((t,i)=>i>0&&t<=times[i-1]))return fail('unordered_or_duplicate_receipts');
  const threshold=120*60000;
  if(times.some((t,i)=>i>0&&t-times[i-1]>threshold))return fail('observed_gap_exceeds_rpo');
  if(!Number.isFinite(Date.parse(input.observedAt||''))||Date.parse(input.observedAt)<times.at(-1)||Date.parse(input.observedAt)-times.at(-1)>threshold)return fail('latest_receipt_stale');
  if(input.incidentEscalationTestPassed!==true||input.isolatedRestoreTestPassed!==true||input.tenantIsolationTestPassed!==true||input.rollbackTestPassed!==true)return fail('recovery_drills_missing');
  return {eligibleForSecurityReview:true,reason:'OFFLINE_PACKET_READY_FOR_INDEPENDENT_ACCEPTANCE',observedGapMaxMinutes:Math.max(...times.slice(1).map((t,i)=>(t-times[i])/60000)),rpoQualified:false,restoreAuthorized:false,productionWriteAuthorized:false,productionReleaseAuthorized:false};
}
