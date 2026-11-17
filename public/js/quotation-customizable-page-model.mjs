/**
 * Browser-only, review-only customizable quotation page model.
 * Separate from the SHA-pinned, legally unapproved private PDF template.
 * No customer issuance, payment, or persistence authority.
 */
export const QUOTATION_CUSTOM_MAX_ITEMS=12;
export const QUOTATION_CUSTOM_DEFAULT_COPY=Object.freeze({
 brandName:"Lovely Tombstones & Granite",
 heading:"QUOTATION",
 quoteNumberLabel:"Quote No",
 dateLabel:"Date",
 customerHeading:"CUSTOMER DETAILS",
 customerNameLabel:"Customer name",
 customerPhoneLabel:"Customer number",
 locationLabel:"Location",
 descriptionLabel:"Description",
 quantityLabel:"Quantity",
 unitPriceLabel:"Unit price (P)",
 lineTotalLabel:"Total (P)",
 subtotalLabel:"Sub total",
 discountLabel:"Discount",
 grandTotalLabel:"Grand total",
 paymentHeading:"Payment details",
 paymentMethodLabel:"Payment method",
 bankLabel:"Bank",
 bankBranchLabel:"Branch",
 bankAccountLabel:"Account number",
 bankName:"First National Bank",
 bankBranch:"Riverwalk Plaza",
 bankAccount:"",
 paymentMethod:"Bank transfer",
 note:"Thanks for your business!",
 termsHeading:"General terms and conditions",
 signatureLabel:"Customer acknowledgement",
 footerLocations:"Mahalapye | Gaborone | Palapye | Maun | Francistown",
 footerEmail:"lovelystones26@gmail.com",
 footerPhone:"+267 74 583 606"
});
const invalid=code=>{throw Error(code)};
const validateText=(value,max,{allowBlank=false,multiline=false}={})=>{
 if(typeof value!=="string"||value.length>max||(!allowBlank&&!value.trim())||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)||
    (!multiline&&/[\r\n\t]/.test(value)))invalid("invalid_quotation_custom_text");
 return value.trim();
};
export function quotationCustomMoneyCents(raw){
 if(typeof raw!=="string")invalid("invalid_quotation_money");
 const v=raw.trim();
 if(!/^(0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(v))invalid("invalid_quotation_money");
 const [p,c=""]=v.split(".");
 const value=Number(p)*100+Number(c.padEnd(2,"0"));
 if(!Number.isSafeInteger(value)||value>1_000_000_000)invalid("invalid_quotation_money");
 return value;
}
export function quotationCustomFormatMoney(cents){
 if(!Number.isSafeInteger(cents)||cents<0||cents>1_000_000_000)invalid("invalid_quotation_money");
 return "P"+(cents/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
}
export function quotationCustomSample(){
 return {
  quoteNumber:"DEMO-80",issueDate:"2026-11-16",
  customerName:"Sample customer",customerPhone:"+267 71 000 000",
  location:"Mahalapye",discount:"0.00",
  items:[
   {description:"Tombstone",quantity:"1",unitPrice:"14000.00"},
   {description:"Cement",quantity:"2",unitPrice:"0.00"},
   {description:"Wheelbarrow (river sand)",quantity:"8",unitPrice:"0.00"},
   {description:"20 KG Adhesive",quantity:"5",unitPrice:"0.00"},
   {description:"600 x 600 Black floor tiles",quantity:"7",unitPrice:"0.00"},
   {description:"Bricks",quantity:"60",unitPrice:"0.00"},
   {description:"Concrete",quantity:"1",unitPrice:"0.00"},
   {description:"Grout 2kg",quantity:"1",unitPrice:"0.00"},
   {description:"Labour / Transport",quantity:"1",unitPrice:"0.00"}
  ],
  copy:{...QUOTATION_CUSTOM_DEFAULT_COPY},
  // Terms must be supplied from a separately reviewed, operator-controlled
  // source; do not silently replace the original agreement with invented text.
  termsText:""
 };
}
export function validateQuotationCustomPage(value){
 if(!value||typeof value!=="object"||Array.isArray(value))invalid("invalid_quotation_custom_page");
 const allowed=["quoteNumber","issueDate","customerName","customerPhone","location","discount","items","copy","termsText"];
 if(Object.keys(value).some(k=>!allowed.includes(k)))invalid("unsupported_quotation_custom_page_field");
 const required=(key,max)=>validateText(value[key],max);
 const quoteNumber=required("quoteNumber",40);
 const date=required("issueDate",10);
 if(!/^\d{4}-\d\d-\d\d$/.test(date)||Number.isNaN(Date.parse(date+"T00:00:00Z"))||
    new Date(date+"T00:00:00Z").toISOString().slice(0,10)!==date)
    invalid("invalid_quotation_custom_date");
 const customerName=required("customerName",90);
 const customerPhone=required("customerPhone",50);
 const location=required("location",120);
 if(!value.copy||typeof value.copy!=="object"||Array.isArray(value.copy)||
    Object.keys(value.copy).some(k=>!Object.hasOwn(QUOTATION_CUSTOM_DEFAULT_COPY,k)))
    invalid("unsupported_quotation_custom_copy_field");
 const copy={};
 for(const key of Object.keys(QUOTATION_CUSTOM_DEFAULT_COPY)){
  const optional=["bankAccount","footerEmail","footerPhone"].includes(key);
  copy[key]=validateText(value.copy[key]??QUOTATION_CUSTOM_DEFAULT_COPY[key],240,{allowBlank:optional});
 }
 const termsText=validateText(value.termsText??"",7500,{allowBlank:true,multiline:true});
 if(!Array.isArray(value.items)||value.items.length<1||value.items.length>QUOTATION_CUSTOM_MAX_ITEMS)
    invalid("invalid_quotation_custom_item_count");
 let subtotalCents=0;
 const items=value.items.map(row=>{
  if(!row||typeof row!=="object"||Array.isArray(row)||
     Object.keys(row).some(k=>!["description","quantity","unitPrice"].includes(k)))
     invalid("invalid_quotation_custom_item");
  const description=validateText(row.description,100);
  const quantityString=String(row.quantity);
  if(!/^[1-9]\d{0,2}$/.test(quantityString))invalid("invalid_quotation_custom_quantity");
  const quantity=Number(quantityString),unitPriceCents=quotationCustomMoneyCents(row.unitPrice);
  const totalCents=quantity*unitPriceCents;
  if(!Number.isSafeInteger(totalCents)||totalCents>1_000_000_000)
     invalid("invalid_quotation_custom_total");
  subtotalCents+=totalCents;
  if(!Number.isSafeInteger(subtotalCents)||subtotalCents>1_000_000_000)
     invalid("invalid_quotation_custom_total");
  return {description,quantity,unitPriceCents,totalCents,unitPrice:row.unitPrice.trim()};
 });
 const discountCents=quotationCustomMoneyCents(value.discount);
 if(discountCents>subtotalCents)invalid("invalid_quotation_custom_discount");
 return {
  quoteNumber,issueDate:date,customerName,customerPhone,location,
  copy,termsText,items,discountCents,subtotalCents,
  totalCents:subtotalCents-discountCents,
  // This must never become an issuance or template-approval claim.
  reviewOnly:true
 };
}
