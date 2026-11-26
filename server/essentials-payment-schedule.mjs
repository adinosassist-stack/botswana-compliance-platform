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

/** Read-only schedule projection from an already verified canonical invoice net
 * allocation. Never stores a schedule or accepts a payment claim from a customer.
 * Deposits are allocated first, then instalments by due date and stable ID.
 * Allocation here is a display convention, not a ledger posting.
 */
export function projectInvoiceSchedule({invoiceTotalMinor,allocatedMinor,depositDueMinor=0,depositDueDate,instalments=[],asOf}={}){
 const today=validScheduleDate(asOf),paid=amount(allocatedMinor,"allocated");
 const base=previewInvoicePayments({invoiceTotalMinor,depositDueMinor,instalments});
 if(paid>base.invoiceTotalMinor)throw new TypeError("overpayment");
 if(depositDueMinor>0)validScheduleDate(depositDueDate);
 if(base.instalments.some(row=>row.amountMinor===0))throw new TypeError("invalid_zero_instalment");
 let available=paid;
 const rows=[];
 const allocate=(kind,id,dueDate,amountMinor)=>{
  const coveredMinor=Math.min(available,amountMinor);
  available-=coveredMinor;
  const remainingMinor=amountMinor-coveredMinor;
  rows.push(Object.freeze({kind,id,dueDate,amountMinor,coveredMinor,remainingMinor,
   status:remainingMinor===0?"paid":dueDate<today?"overdue":coveredMinor>0?"partially_paid":"unpaid"}));
 };
 if(depositDueMinor>0)allocate("deposit",null,depositDueDate,depositDueMinor);
 for(const row of [...base.instalments].sort((a,b)=>a.dueDate<b.dueDate?-1:a.dueDate>b.dueDate?1:a.id<b.id?-1:a.id>b.id?1:0))
  allocate("instalment",row.id,row.dueDate,row.amountMinor);
 const outstandingMinor=base.invoiceTotalMinor-paid;
 const unscheduledOutstandingMinor=base.unscheduledMinor-available;
 return Object.freeze({currency:"BWP",outstandingMinor,unscheduledOutstandingMinor,
  scheduledOutstandingMinor:outstandingMinor-unscheduledOutstandingMinor,
  overdueMinor:rows.reduce((sum,row)=>sum+(row.status==="overdue"?row.remainingMinor:0),0),
  rows:Object.freeze(rows),previewOnly:true});
}
function validScheduleDate(v){
 if(typeof v!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw new TypeError("invalid_schedule_date");
 return v;
}
