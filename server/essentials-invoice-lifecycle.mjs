/** Read-only projection. Call only after authenticated tenant-scoped ledger reads.
 * Never accepts payment evidence, issues invoices or mutates financial records.
 */
function date(value) {
 if(typeof value!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value) throw new TypeError("invalid_date");
 return value;
}
function minor(value) {
 if(!Number.isSafeInteger(value)||value<0) throw new TypeError("invalid_amount");
 return value;
}
export function projectInvoiceLifecycle({tenantId,invoice,asOf}={}) {
 if(typeof tenantId!=="string"||!tenantId.trim()||!invoice||invoice.tenantId!==tenantId) throw new Error("tenant_mismatch");
 if(invoice.currency!=="BWP") throw new TypeError("invalid_currency");
 const total=minor(invoice.totalMinor), allocated=minor(invoice.allocatedMinor);
 if(allocated>total) throw new TypeError("overallocated_invoice");
 const today=date(asOf);
 if(!["draft","issued","void"].includes(invoice.status)) throw new TypeError("invalid_status");
 if(invoice.status!=="issued"&&allocated!==0) throw new TypeError("unexpected_allocation");
 const due=invoice.status==="issued"?date(invoice.dueDate):null;
 if(invoice.status==="issued"&&total===0) throw new TypeError("invalid_issued_total");
 const outstanding=invoice.status==="issued"?total-allocated:0;
 const overdue=outstanding>0&&due<today;
 const status=invoice.status==="draft"?"draft":invoice.status==="void"?"cancelled":outstanding===0?"paid":overdue?"overdue":allocated>0?"partially_paid":"unpaid";
 return Object.freeze({currency:"BWP",status,totalMinor:total,allocatedMinor:allocated,outstandingMinor:outstanding,overdue,partiallyPaid:allocated>0&&outstanding>0,reminderEligible:invoice.status==="issued"&&outstanding>0});
}
