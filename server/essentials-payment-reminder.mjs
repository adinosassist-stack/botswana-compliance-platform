/** Prepare-only customer payment reminders. Caller must authorize tenant and invoice access. */
const clean=(v,max)=>typeof v==="string"&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v)?v.trim():null;
export function preparePaymentReminder({type,customerName,invoiceReference,outstandingMinor,dueDate}={}){
 if(!["upcoming","overdue","receipt_request"].includes(type))throw new TypeError("invalid_type");
 const customer=clean(customerName,150),ref=clean(invoiceReference,80);
 if(!customer||!ref||!Number.isSafeInteger(outstandingMinor)||outstandingMinor<0)throw new TypeError("invalid_reminder");
 if(type!=="receipt_request"&&(typeof dueDate!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||Number.isNaN(Date.parse(dueDate+"T00:00:00Z"))||new Date(dueDate+"T00:00:00Z").toISOString().slice(0,10)!==dueDate))throw new TypeError("invalid_due_date");
 const value=`P${(outstandingMinor/100).toFixed(2)}`;
 const text=type==="upcoming"?`Hello ${customer}, this is a reminder that invoice ${ref} for ${value} is due on ${dueDate}. Please contact us if you need assistance.`:type==="overdue"?`Hello ${customer}, our records show ${value} outstanding on invoice ${ref}, due ${dueDate}. If you have already paid, please disregard this reminder while we verify the payment.`:`Hello ${customer}, regarding invoice ${ref}, our records currently show ${value} outstanding. Please contact us if you would like to discuss the balance.`;
 return Object.freeze({text,prepareOnly:true,providerSend:false,requiresHumanReview:true});
}
