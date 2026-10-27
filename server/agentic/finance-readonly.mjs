// Read-only deterministic finance preparation. Never executes payments.
const money = value => {
  if (!Number.isSafeInteger(value)) throw new Error("INVALID_MINOR_UNITS");
  return value;
};
export function reconcileLedger({ledger=[],bank=[]}={}) {
  if(!Array.isArray(ledger)||!Array.isArray(bank)||ledger.length>10000||bank.length>10000) throw new Error("INVALID_RECONCILIATION_INPUT");
  const used=new Set(),matches=[],unmatchedLedger=[];
  for(const entry of ledger){
    if(typeof entry?.id!=="string" || !entry.id || typeof entry.reference!=="string") throw new Error("INVALID_LEDGER_ENTRY");
    const amount=money(entry.amountMinor);
    const index=bank.findIndex((candidate,i)=>!used.has(i)&&candidate?.reference===entry.reference&&candidate?.amountMinor===amount);
    if(index<0) unmatchedLedger.push(entry.id);
    else {used.add(index);matches.push({ledgerId:entry.id,bankId:bank[index].id});}
  }
  for(const entry of bank){if(typeof entry?.id!=="string"||!entry.id||typeof entry.reference!=="string")throw new Error("INVALID_BANK_ENTRY");money(entry.amountMinor);}
  return Object.freeze({matches,unmatchedLedger,unmatchedBank:bank.filter((_,i)=>!used.has(i)).map(e=>e.id),readOnly:true});
}
export function prepareSupplierPaymentReview({invoices=[]}={}){
  if(!Array.isArray(invoices)||invoices.length>10000)throw new Error("INVALID_INVOICES");
  const seen=new Set(),proposals=[],duplicates=[];
  for(const item of invoices){
    if(typeof item?.id!=="string"||!item.id||typeof item.supplierId!=="string"||!item.supplierId||typeof item.invoiceNumber!=="string"||!item.invoiceNumber)throw new Error("INVALID_INVOICE");
    const amount=money(item.amountMinor);
    if(amount<0)throw new Error("INVALID_INVOICE_AMOUNT");
    const key=JSON.stringify([item.supplierId,item.invoiceNumber]);
    if(seen.has(key))duplicates.push(item.id);
    else {seen.add(key);proposals.push({invoiceId:item.id,supplierId:item.supplierId,amountMinor:amount,status:"review_required"});}
  }
  return Object.freeze({proposals,duplicates,readOnly:true,paymentExecutionEnabled:false});
}
