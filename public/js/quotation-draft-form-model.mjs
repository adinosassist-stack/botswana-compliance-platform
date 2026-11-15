/**
 * Browser-only quotation form calculations. Values are strings from inputs.
 * All amounts become integer Pula cents, never floating-point BWP.
 * Server independently recalculates the totals before issuing a preview.
 */
const error=code=>{throw Error(code)};
export function parseBwpCents(raw) {
 if(typeof raw!=="string")error("invalid_bwp_amount");
 const value=raw.trim();
 const match=/^(0|[1-9][0-9]{0,7})(?:\.([0-9]{1,2}))?$/.exec(value);
 if(!match)error("invalid_bwp_amount");
 const amount=Number(match[1])*100+Number((match[2]||"").padEnd(2,"0"));
 if(!Number.isSafeInteger(amount)||amount>1_000_000_000)
  error("invalid_bwp_amount");
 return amount;
}
export function formatBwpCents(cents) {
 if(!Number.isSafeInteger(cents)||cents<0||cents>1_000_000_000)
  error("invalid_bwp_amount");
 return "P"+(cents/100).toLocaleString("en-US",{
  minimumFractionDigits:2,maximumFractionDigits:2
 });
}
export function prepareQuotationFormDraft(values) {
 if(!values||typeof values!=="object"||Array.isArray(values))
  error("invalid_quotation_form");
 const fields=["quoteNumber","issueDate","customerName","customerContact"];
 const draft={};
 for(const key of fields){
  if(typeof values[key]!=="string")error("invalid_quotation_"+key);
  draft[key]=values[key].trim();
 }
 if(typeof values.paymentMethod==="string"&&values.paymentMethod.trim())
  draft.paymentMethod=values.paymentMethod.trim();
 if(!Array.isArray(values.items)||values.items.length<1||values.items.length>8)
  error("invalid_quotation_item_count");
 let subtotal=0;
 draft.items=values.items.map(item=>{
  if(!item||typeof item.description!=="string"||
     !/^[1-9][0-9]{0,2}$/.test(String(item.quantity).trim()))
   error("invalid_quotation_item");
  const quantity=Number(String(item.quantity).trim());
  const unitPriceCents=parseBwpCents(item.unitPrice);
  const lineTotalCents=quantity*unitPriceCents;
  if(!Number.isSafeInteger(lineTotalCents)||lineTotalCents>1_000_000_000)
   error("invalid_quotation_line_total");
  subtotal+=lineTotalCents;
  if(!Number.isSafeInteger(subtotal)||subtotal>1_000_000_000)
   error("invalid_quotation_subtotal");
  return {description:item.description.trim(),quantity,unitPriceCents};
 });
 draft.discountCents=parseBwpCents(values.discount||"0");
 if(draft.discountCents>subtotal)error("invalid_quotation_discount");
 if(Object.keys(values).some(k=>!["quoteNumber","issueDate","customerName",
  "customerContact","paymentMethod","items","discount"].includes(k)))
  error("unsupported_quotation_form_field");
 return Object.freeze({draft,subtotalCents:subtotal,
  discountCents:draft.discountCents,grandTotalCents:subtotal-draft.discountCents});
}
