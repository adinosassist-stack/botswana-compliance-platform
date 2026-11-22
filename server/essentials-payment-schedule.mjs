/** Pure invoice payment schedule and allocation preview. No bank verification or writes.
 * Only server-authorized, independently verified settled receipts may be passed as settled allocations.
 */
const amount=(v,name)=>{if(!Number.isSafeInteger(v)||v<0)throw new TypeError("invalid_"+name);return v;};
const id=v=>typeof v==="string"&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
export function previewInvoicePayments({invoiceTotalMinor,depositDueMinor=0,instalments=[],settledAllocations=[]}={}){
 const total=amount(invoiceTotalMinor,"invoice_total"),deposit=amount(depositDueMinor,"deposit");
 if(deposit>total)throw new TypeError("deposit_exceeds_total");
 if(!Array.isArray(instalments)||instalments.length>120||!Array.isArray(settledAllocations)||settledAllocations.length>1000)throw new TypeError("invalid_entries");
 const seen=new Set();
 const schedule=instalments.map(row=>{
  if(!row||!id(row.id)||seen.has(row.id)||typeof row.dueDate!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(row.dueDate)||Number.isNaN(Date.parse(row.dueDate+"T00:00:00Z"))||new Date(row.dueDate+"T00:00:00Z").toISOString().slice(0,10)!==row.dueDate)throw new TypeError("invalid_instalment");
  seen.add(row.id);return Object.freeze({id:row.id,dueDate:row.dueDate,amountMinor:amount(row.amountMinor,"instalment")});
 });
 const scheduled=schedule.reduce((n,r)=>n+r.amountMinor,deposit);
 if(!Number.isSafeInteger(scheduled)||scheduled>total)throw new TypeError("schedule_exceeds_total");
 const txSeen=new Set();
 const paid=settledAllocations.reduce((n,r)=>{
  if(!r||!id(r.bankTransactionId)||txSeen.has(r.bankTransactionId)||r.settlementVerified!==true)throw new TypeError("invalid_settlement");
  txSeen.add(r.bankTransactionId);
  const credit=amount(r.amountMinor,"allocation");
  if(credit===0)throw new TypeError("invalid_zero_settlement");
  const next=n+credit;if(!Number.isSafeInteger(next))throw new TypeError("amount_overflow");return next;
 },0);
 if(paid>total)throw new TypeError("overpayment");
 return Object.freeze({currency:"BWP",invoiceTotalMinor:total,depositDueMinor:deposit,scheduledMinor:scheduled,unscheduledMinor:total-scheduled,settledMinor:paid,outstandingMinor:total-paid,instalments:Object.freeze(schedule),previewOnly:true});
}
