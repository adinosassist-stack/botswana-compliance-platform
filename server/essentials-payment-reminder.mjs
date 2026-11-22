/** Prepare-only customer payment reminders. Caller must authorize tenant and invoice access.
 * Never send, verify settlement, or mark an invoice paid from this helper.
 */
const clean=(v,max)=>typeof v==="string"&&v.trim().length>0&&v.trim().length<=max&&!/[\u0000-\u001f\u007f\u0085\u2028\u2029\u202a-\u202e\u2066-\u2069]/u.test(v)?v.trim():null;
const formatBwpMinor=minor=>{
 const value=BigInt(minor);
 return `P${value/100n}.${String(value%100n).padStart(2,"0")}`;
};
export function preparePaymentReminder({type,customerName,invoiceReference,outstandingMinor,dueDate}={}){
 if(!["upcoming","overdue","receipt_request"].includes(type))throw new TypeError("invalid_type");
 const customer=clean(customerName,150),ref=clean(invoiceReference,80);
 // Zero-balance reminders falsely imply debt. Payment settlement is checked elsewhere.
 if(!customer||!ref||!Number.isSafeInteger(outstandingMinor)||outstandingMinor<=0)throw new TypeError("invalid_reminder");
 if(type!=="receipt_request"&&(typeof dueDate!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||Number.isNaN(Date.parse(dueDate+"T00:00:00Z"))||new Date(dueDate+"T00:00:00Z").toISOString().slice(0,10)!==dueDate))throw new TypeError("invalid_due_date");
 const value=formatBwpMinor(outstandingMinor);
 const text=type==="upcoming"?`Hello ${customer}, this is a reminder that invoice ${ref} for ${value} is due on ${dueDate}. Please contact us if you need assistance.`:type==="overdue"?`Hello ${customer}, our records show ${value} outstanding on invoice ${ref}, due ${dueDate}. If you have already paid, please disregard this reminder while we verify the payment.`:`Hello ${customer}, regarding invoice ${ref}, our records currently show ${value} outstanding. Please contact us if you would like to discuss the balance.`;
 return Object.freeze({text,prepareOnly:true,providerSend:false,requiresHumanReview:true});
}
