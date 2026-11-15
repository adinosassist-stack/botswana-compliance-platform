/**
 * Inert, synthetic-friendly quotation data validation.
 * All money is integer BWP cents. No floating-point totals.
 * Not a quote issuance / accounting / tax determination service.
 */
const deny=code=>{throw Error(code)};
const text=(v,max)=>typeof v==="string"&&v.trim().length>0&&v.trim().length<=max&&
 !/[\x00-\x1f\x7f]/.test(v)&&/^[\x20-\x7e]*$/.test(v);
const cents=v=>Number.isSafeInteger(v)&&v>=0&&v<=1_000_000_000;
const safeSum=(a,b)=>{const n=a+b;if(!Number.isSafeInteger(n))deny("quotation_money_overflow");return n};
export const moneyBwp=amount=>{
 if(!cents(amount))deny("invalid_quotation_money");
 return "P"+(amount/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
};
export function validateQuotationDraft(data){
 if(!data||typeof data!=="object"||Array.isArray(data))deny("invalid_quotation_draft");
 const keys=["quoteNumber","issueDate","customerName","customerContact","items","discountCents","paymentMethod","bankName","bankAccount"];
 if(Object.keys(data).some(key=>!keys.includes(key)))deny("unsupported_quotation_field");
 for(const field of ["quoteNumber","customerName","customerContact"]){
  if(!text(data[field],field==="customerName"?60:40))deny("invalid_quotation_"+field);
 }
 if(typeof data.issueDate!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(data.issueDate)||
    Number.isNaN(Date.parse(data.issueDate+"T00:00:00Z"))||
    new Date(data.issueDate+"T00:00:00Z").toISOString().slice(0,10)!==data.issueDate)
    deny("invalid_quotation_issue_date");
 for(const key of ["paymentMethod","bankName","bankAccount"]){
  if(data[key]!==undefined&&data[key]!==""&&!text(data[key],55))deny("invalid_quotation_"+key);
 }
 if(!Array.isArray(data.items)||data.items.length<1||data.items.length>8)
  deny("invalid_quotation_item_count");
 let subtotal=0;
 const items=data.items.map(item=>{
  if(!item||typeof item!=="object"||Array.isArray(item)||
     Object.keys(item).some(k=>!["description","quantity","unitPriceCents"].includes(k))||
     !text(item.description,60)||!Number.isSafeInteger(item.quantity)||
     item.quantity<1||item.quantity>999||!cents(item.unitPriceCents))
   deny("invalid_quotation_item");
  const lineTotalCents=item.quantity*item.unitPriceCents;
  if(!cents(lineTotalCents))deny("invalid_quotation_line_total");
  subtotal=safeSum(subtotal,lineTotalCents);
  if(!cents(subtotal))deny("invalid_quotation_subtotal");
  return Object.freeze({description:item.description,quantity:item.quantity,unitPriceCents:item.unitPriceCents,lineTotalCents});
 });
 const discountCents=data.discountCents??0;
 if(!cents(discountCents)||discountCents>subtotal)deny("invalid_quotation_discount");
 return Object.freeze({
  quoteNumber:data.quoteNumber.trim(),issueDate:data.issueDate,
  customerName:data.customerName.trim(),customerContact:data.customerContact.trim(),
  paymentMethod:data.paymentMethod?.trim()||"",
  bankName:data.bankName?.trim()||"",bankAccount:data.bankAccount?.trim()||"",
  items:Object.freeze(items),subtotalCents:subtotal,discountCents,
  grandTotalCents:subtotal-discountCents,currency:"BWP"
 });
}
