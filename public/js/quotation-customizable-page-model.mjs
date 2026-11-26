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
 bankAccountHolder:"",
 bankBranchCode:"",
 bankPaymentReference:"",
 paymentMethod:"Bank transfer",
 note:"Thanks for your business!",
 termsHeading:"General terms and conditions",
 signatureLabel:"Customer acknowledgement",
 footerLocations:"Mahalapye | Gaborone | Palapye | Maun | Francistown",
 footerEmail:"lovelystones26@gmail.com",
 footerPhone:"+267 74 583 606"
});
const LOVELY_TOMBSTONES_DEFAULT_TERMS=[
 "Dear Lovely Tombstone customer,",
 "We at Lovely Tombstone understand that purchasing a tombstone is an investment towards the memory of your loved ones.Please take note of the following as to ensure that your purchase at Lovely Tombstone is a memorable and stress free experience.",
 "1. Ensure that all information given to Lovely Tombstone is accurate and correct. Lovely Tombstone will not be liable for any costs as a result of incorrect or wrong information given, whether intentional or unintentional, and the customer will not be entitled to any compensation or refund as a result of incorrect or wrong information.",
 "2. On the date of installation:",
 "I. Please ensure that we are able to reach you on the contact numbers you provided as to ensure that proper communication between yourself and Lovely Tombstone personnel can take place in the event of any unforeseen circumstances that might cause the installation to be delayed.",
 "II. Please note that should we be unable to reach you, or you are unavailable to meet the installation team on the date scheduled and the tombstone cannot be installed, Lovely Tombstone will not be responsible for any costs incurred, you also not be entitled to a refund however, Lovely Tombstone will re-schedule your installation to the soonest opening on the installation schedule, such costs will be for the customer's account.",
 "Ill. Although every effort will be made to erect stones on dates indicated we cannot guarantee the erection date. Therefore erection dates should be seen as an indicative date and not as a confirmed date.",
 "IV. The customer is responsible for cleaning the grave (old foundations and rocks etc), if the grave is not cleaned on the day of installation the client will be charged five hundred pula for us to do it.",
 "V. Should the installation not be able to take place as scheduled due to any unforeseen circumstances like rainy weather, accidents, vehicle breakdowns or manufacturing defects you will not be entitled to a refund, however, Lovely Tombstone will re-schedule your installation for a later date, the customer exempts Lovely Tombstone from any civil or legal liability in such an event.",
 "4. Should you decide to cancel a lay buy purchase, you will only be entitled to a refund of 80% of the amount paid during the first month of the lay-buy due to Administration and Bank fee's, and 30% of the amount paid after the first month due to the fact that the manufacturing process of your tombstone had already started.",
 "5. Refunds will be given within 3 days of purchaing the tombstone!",
 "6. Please ensure that the lettering and colour of your tombstone is correct. Incorrect information will result in additional costs to rectify. Such costs will be for the customer's account if incorrect information was given .",
 "7. Be sure that you were given the contact details of Lovely Tombstone to enable you to contact us with any queries or further requests, also to enable us to provide you with personal, professional after sales service.",
 "8. All products supplied remain the property of Lovely Tombstone until paid in full.",
 "9. Lay-buy not paid up in full after the agreed period of 12 Months will be cancelled, should you still want to continue due to unforeseen circumstances then you have to apply for extension in writing before the expiry date. In such a case you will pay in any difference in price increases provided your extension is approved by Lovely Tombstones.",
 "10. If a Tombstones has to be stored after manufacturing, no storage fee will be charged for a maximum period of six months after which the stone will be destroyed or recycled to defray any costs and no refund will given.",
 "11. No tombstone will be erected under any circumstance in rainy weather.",
 "12. The Client acknowledges that Lovely may put their Company Name and Contact details on every tombstone.",
 "13. Transport of P50.00 per kilometre will be charged on the clients account if the erection place is further than specified on this Quote and paid for before installation will commence.",
 "14. Obtaining a Permit is the clients own responsibility and for the client's own account. Permits need to be faxed or mailed to Lovely Tombstones. Permission to enter and install must be obtained by the client.",
 "15. Granite and Marble are natural products and no uniformity in pattern and colour can be guaranteed.",
 "Customer Declaration:",
 "I the under signed understand and accept the content of this document and agree that I am the responsible person for this order and acknowledge the correctness of all information supplied."
].join("\n");
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
  termsText:LOVELY_TOMBSTONES_DEFAULT_TERMS
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
  const optional=["bankAccount","bankAccountHolder","bankBranchCode","bankPaymentReference","footerEmail","footerPhone"].includes(key);
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
