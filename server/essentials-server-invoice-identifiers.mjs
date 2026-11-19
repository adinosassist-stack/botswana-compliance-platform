/**
 * Source-only, server-generated identifiers for Essentials invoice drafts.
 * Unmounted and not a payment/invoice-issuance action.
 * Random references avoid unsafe SELECT MAX() and read-then-increment races.
 * D1 UNIQUE(tenant_id, invoice_number) remains the final collision authority.
 */
const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=code=>{throw new Error(code)};
export function createEssentialsServerInvoiceIdentifiers({randomUUID=globalThis.crypto?.randomUUID?.bind(globalThis.crypto)}={}){
 if(typeof randomUUID!=="function")fail("secure_uuid_generator_required");
 const next=()=>{
  const value=randomUUID();
  if(typeof value!=="string"||!UUID_V4.test(value))fail("invalid_secure_uuid");
  return value.replace(/-/g,"").toUpperCase();
 };
 const invoiceReference="ED_"+next();
 const draftId="ess_"+next().toLowerCase();
 if(invoiceReference.length>80||draftId.length>100)fail("identifier_overflow");
 return Object.freeze({invoiceReference,draftId});
}
