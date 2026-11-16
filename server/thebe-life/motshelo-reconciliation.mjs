/**
 * Motshelo reporting reconciliation, offline/read-only.
 * Does NOT authenticate bank settlement evidence. Matched and cleared amounts
 * must come from separately authenticated trusted records before real use.
 */
const ID=/^[A-Za-z0-9_-]{1,80}$/;
const amount=(value,name)=>{
  if(!Number.isSafeInteger(value)||value<0)throw new RangeError('invalid_'+name);
  return value;
};
const add=(left,right)=>{
  const sum=left+right;
  if(!Number.isSafeInteger(sum))throw new RangeError('reconciliation_overflow');
  return sum;
};
export function reconcileMotsheloReports({groupId,expectedMinor,reports=[]}={}){
  if(typeof groupId!=='string'||!ID.test(groupId))throw new TypeError('invalid_group_id');
  amount(expectedMinor,'expected');
  if(!Array.isArray(reports)||reports.length>250)throw new TypeError('invalid_reports');
  const seen=new Set();
  const totals={reportedMinor:0,matchedMinor:0,clearedMinor:0};
  const byMember=new Map();
  for(const report of reports){
    if(!report||typeof report!=='object'||Array.isArray(report)||
      typeof report.id!=='string'||!ID.test(report.id)||
      typeof report.memberId!=='string'||!ID.test(report.memberId)||
      report.groupId!==groupId||seen.has(report.id))throw new TypeError('invalid_or_duplicate_report');
    seen.add(report.id);
    const reportedMinor=amount(report.reportedMinor,'reported');
    const matchedMinor=amount(report.matchedMinor??0,'matched');
    const clearedMinor=amount(report.clearedMinor??0,'cleared');
    if(clearedMinor>matchedMinor||matchedMinor>reportedMinor)
      throw new RangeError('invalid_verification_progression');
    totals.reportedMinor=add(totals.reportedMinor,reportedMinor);
    totals.matchedMinor=add(totals.matchedMinor,matchedMinor);
    totals.clearedMinor=add(totals.clearedMinor,clearedMinor);
    const prior=byMember.get(report.memberId)||{reportedMinor:0,clearedMinor:0};
    byMember.set(report.memberId,{
      reportedMinor:add(prior.reportedMinor,reportedMinor),
      clearedMinor:add(prior.clearedMinor,clearedMinor)
    });
  }
  const members=Array.from(byMember.entries(),([memberId,t])=>Object.freeze({
    memberId,reportedMinor:t.reportedMinor,clearedMinor:t.clearedMinor,
    outstandingVerificationMinor:t.reportedMinor-t.clearedMinor
  })).sort((a,b)=>a.memberId.localeCompare(b.memberId));
  return Object.freeze({
    groupId,currency:'BWP',expectedMinor,
    ...totals,
    reportingDifferenceMinor:expectedMinor-totals.reportedMinor,
    outstandingVerificationMinor:totals.reportedMinor-totals.clearedMinor,
    members:Object.freeze(members),
    verificationSource:'external_trusted_records_required',
    fundsAvailableToDisburse:false,
    paymentExecutionEnabled:false
  });
}
