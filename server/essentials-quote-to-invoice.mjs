/** Pure, side-effect-free quote to invoice draft preparation.
 * Authorization, tenant ownership, persistence, unique invoice numbering and issuance
 * MUST be enforced by the authenticated server transaction that calls this helper.
 */
const required=(v,max=150)=>{if(typeof v!=="string"||!v.trim()||v.length>max||/[\u0000-\u001f\u007f]/.test(v))throw new TypeError("invalid_text");return v.trim();};
const minor=v=>{if(!Number.isSafeInteger(v)||v<0)throw new TypeError("invalid_amount");return v;};
export function prepareInvoiceFromQuotation({quotation,invoiceReference,createdAt}={}){
 if(!quotation||typeof quotation!=="object"||Array.isArray(quotation))throw new TypeError("invalid_quotation");
 // Legacy BWP-only quotation snapshots have no currency field. An explicitly
 // supplied foreign/unknown currency must never be silently relabelled BWP.
 if(quotation.currency!==undefined&&quotation.currency!=="BWP")throw new TypeError("invalid_currency");
 const tenantId=required(quotation.companyId,100),customerId=required(quotation.customerId,100);
 const sourceReference=required(quotation.reference,80),reference=required(invoiceReference,80);
 const date=required(createdAt,40);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+"T00:00:00Z"))||new Date(date+"T00:00:00Z").toISOString().slice(0,10)!==date)throw new TypeError("invalid_date");
 if(!Array.isArray(quotation.items)||quotation.items.length===0||quotation.items.length>100)throw new TypeError("invalid_items");
 const items=quotation.items.map(item=>Object.freeze({description:required(item.description,200),quantity:minor(item.quantity),unitMinor:minor(item.unitMinor),lineMinor:minor(item.lineMinor)}));
 if(items.some(i=>i.quantity===0||!Number.isSafeInteger(i.quantity*i.unitMinor)||i.quantity*i.unitMinor!==i.lineMinor))throw new TypeError("invalid_line");
 const subtotalMinor=items.reduce((n,i)=>n+i.lineMinor,0),discountMinor=minor(quotation.discountMinor),totalMinor=minor(quotation.totalMinor);
 if(!Number.isSafeInteger(subtotalMinor)||discountMinor>subtotalMinor||subtotalMinor-discountMinor!==totalMinor)throw new TypeError("invalid_totals");
 return Object.freeze({tenantId,customerId,sourceQuotationReference:sourceReference,invoiceReference:reference,createdAt:date,status:"draft",currency:"BWP",items:Object.freeze(items),subtotalMinor,discountMinor,totalMinor});
}
