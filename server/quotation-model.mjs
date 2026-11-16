/** Pure BWP quotation model. No authorization, persistence, issuance or PDF output. */
const reject = reason => { throw Error(reason); };
const required = (value,max=200) => {
 if(typeof value!=="string" || !value.trim() || value.length>max || /[\u0000-\u001f\u007f]/.test(value))reject("invalid_text");
 return value.trim();
};
export function moneyToMinor(value) {
 if(typeof value!=="string" && typeof value!=="number")reject("invalid_money");
 const valueString=String(value);
 if(!/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(valueString))reject("invalid_money");
 const [major,minor=""]=valueString.split(".");
 const cents=Number(major)*100+Number(minor.padEnd(2,"0"));
 if(!Number.isSafeInteger(cents))reject("invalid_money");
 return cents;
}
export function formatBwpMinor(cents) {
 if(!Number.isSafeInteger(cents)||cents<0)reject("invalid_money");
 return Math.floor(cents/100).toLocaleString("en-US")+"."+String(cents%100).padStart(2,"0");
}
export function evaluateQuotationDraft(draft) {
 if(!draft || typeof draft!=="object" || Array.isArray(draft))reject("invalid_draft");
 if(!Array.isArray(draft.items)||draft.items.length<1||draft.items.length>8)reject("invalid_items");
 const items=draft.items.map(row=>{
  if(!row||typeof row!=="object"||Array.isArray(row))reject("invalid_item");
  const description=required(row.description,100),quantity=row.quantity;
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>9999)reject("invalid_quantity");
  const suppliedBy=row.suppliedBy||"company";
  if(!["company","customer"].includes(suppliedBy))reject("invalid_supplier");
  const free=row.free===true;
  if(free&&suppliedBy==="customer")reject("invalid_free_item");
  const unitMinor=moneyToMinor(row.unitPrice??"0");
  if((free||suppliedBy==="customer")&&unitMinor!==0)reject("nonzero_no_charge");
  const lineMinor=unitMinor*quantity;
  if(!Number.isSafeInteger(lineMinor))reject("invalid_money");
  return {description,quantity,suppliedBy,free,unitMinor,lineMinor,
   unitDisplay:free?"free":formatBwpMinor(unitMinor),
   totalDisplay:free?"free":formatBwpMinor(lineMinor)};
 });
 const subtotalMinor=items.reduce((total,item)=>total+item.lineMinor,0);
 if(!Number.isSafeInteger(subtotalMinor))reject("invalid_money");
 const discountMinor=moneyToMinor(draft.discount??"0");
 if(discountMinor>subtotalMinor)reject("discount_exceeds_subtotal");
 const totalMinor=subtotalMinor-discountMinor;
 return {items,subtotalMinor,discountMinor,totalMinor,
  subtotalDisplay:formatBwpMinor(subtotalMinor),
  discountDisplay:formatBwpMinor(discountMinor),
  totalDisplay:formatBwpMinor(totalMinor)};
}
export function prepareQuotationSnapshot({company,customer,draft,reference,issuedAt}={}) {
 if(!company||!customer||!draft)reject("invalid_snapshot");
 const date=required(issuedAt,40);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||
    new Date(date+"T00:00:00Z").toISOString().slice(0,10)!==date)reject("invalid_date");
 const values=evaluateQuotationDraft(draft);
 return Object.freeze({companyId:required(company.id,100),customerId:required(customer.id,100),
  reference:required(reference,60),issuedAt:date,
  companyName:required(company.name,150),customerName:required(customer.name,150),
  templateKey:required(company.templateKey,100),
  termsVersion:required(company.termsVersion,100),logoVersion:required(company.logoVersion,100),
  ...values});
}