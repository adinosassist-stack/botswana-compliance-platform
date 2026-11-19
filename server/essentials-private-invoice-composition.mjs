/**
 * Private staging source-only composition for accepted quotation -> draft D1.
 * Host must first authenticate session, membership, Origin and CSRF.
 * Host must supply trusted, tenant-scoped quotation retrieval.
 * Important: this function does NOT prove quotation read and D1 write share
 * a single transaction; do not mount publicly or enable production routes.
 */
import {prepareAuthorizedInvoiceDraft} from "./essentials-invoice-draft-adapter.mjs";
import {createEssentialsServerInvoiceIdentifiers} from "./essentials-server-invoice-identifiers.mjs";
import {insertAuthorizedEssentialsDraftBatch} from "./essentials-d1-atomic-batch.mjs";

const valid=v=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
const fail=code=>{throw Error(code)};
export function createEssentialsPrivateInvoiceComposition({
 enabled=false,environment,loadAcceptedQuotationForTenant,
 db,randomUUID
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  fail("essentials_composition_disabled");
 if(typeof loadAcceptedQuotationForTenant!=="function"||
    typeof db?.prepare!=="function"||typeof db?.batch!=="function"||
    typeof randomUUID!=="function")
  fail("essentials_composition_unconfigured");
 return Object.freeze({
  async createDraft({principal,quotationId,idempotencyKey,createdAt}={}){
   if(!principal||!valid(principal.tenantId)||!valid(principal.userId)||
      !Array.isArray(principal.permissions)||
      !principal.permissions.includes("invoice:draft:create"))fail("permission_denied");
   if(!valid(quotationId)||!valid(idempotencyKey))fail("invalid_request");
   const tenantId=principal.tenantId;
   // The client cannot supply companyId or customerId as authority.
   const quotation=await loadAcceptedQuotationForTenant({tenantId,quotationId,principal});
   if(!quotation)fail("quotation_not_found");
   if(quotation.id!==quotationId||quotation.companyId!==tenantId)
    fail("quotation_tenant_mismatch");
   if(quotation.status!=="accepted")fail("quotation_not_accepted");
   const {draftId,invoiceReference}=createEssentialsServerInvoiceIdentifiers({randomUUID});
   const prepared=prepareAuthorizedInvoiceDraft({
    principal,tenantId,quotation,invoiceReference,createdAt
   });
   const invoice=await insertAuthorizedEssentialsDraftBatch({db,principal,record:{
    id:draftId,tenantId,customerId:draftCustomer(prepared.draft),
    sourceQuotationId:quotationId,idempotencyKey,invoiceNumber:invoiceReference,
    createdByUserId:principal.userId,draft:prepared.draft
   }});
   return Object.freeze({invoice,replayed:false});
  }
 });
}
function draftCustomer(draft){
 if(!valid(draft?.customerId))fail("invalid_customer");
 return draft.customerId;
}
