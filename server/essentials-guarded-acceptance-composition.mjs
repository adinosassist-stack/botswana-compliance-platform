/**
 * Source-only private staging bridge from an accepted quotation to the SAME-D1
 * guarded draft INSERT. Does not mount HTTP, deploy, or prove host verification.
 * A trusted host supplies tenant-scoped quote retrieval and authenticated
 * session/membership/origin/CSRF. A failed D1 acceptance predicate is fail-closed.
 * Deliberately does NOT claim idempotent replay; retry is a separate gate.
 */
import {prepareAuthorizedInvoiceDraft} from "./essentials-invoice-draft-adapter.mjs";
import {createEssentialsServerInvoiceIdentifiers} from "./essentials-server-invoice-identifiers.mjs";
import {insertAcceptedEssentialsDraftGuarded} from "./essentials-accepted-quotation-guard.mjs";

const valid=v=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
export function createEssentialsGuardedAcceptanceComposition({
 enabled=false,environment,db,randomUUID,loadAcceptedQuotationForTenant
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("guarded_composition_disabled");
 if(typeof db?.prepare!=="function"||typeof randomUUID!=="function"||
    typeof loadAcceptedQuotationForTenant!=="function")
  throw Error("guarded_composition_unconfigured");
 return Object.freeze({
  async createDraft({principal,quotationId,idempotencyKey,createdAt}={}){
   if(!principal||!valid(principal.tenantId)||!valid(principal.userId)||
      !Array.isArray(principal.permissions)||
      !principal.permissions.includes("invoice:draft:create"))
    throw Error("permission_denied");
   if(!valid(quotationId)||!valid(idempotencyKey))throw Error("invalid_request");
   const tenantId=principal.tenantId;
   const quotation=await loadAcceptedQuotationForTenant({tenantId,quotationId,principal});
   if(!quotation)throw Error("quotation_not_found");
   if(quotation.id!==quotationId||quotation.companyId!==tenantId)
    throw Error("quotation_tenant_mismatch");
   if(quotation.status!=="accepted")throw Error("quotation_not_accepted");
   if(!Number.isSafeInteger(quotation.acceptanceVersion)||
      quotation.acceptanceVersion<1||quotation.acceptanceVersion>2147483647)
    throw Error("acceptance_version_unverified");
   const {draftId,invoiceReference}=createEssentialsServerInvoiceIdentifiers({randomUUID});
   const {draft}=prepareAuthorizedInvoiceDraft({principal,tenantId,quotation,
      invoiceReference,createdAt});
   const persisted=await insertAcceptedEssentialsDraftGuarded({
    db,principal,acceptanceVersion:quotation.acceptanceVersion,
    sourceQuotationReference:quotation.reference,
    record:{id:draftId,tenantId,customerId:draft.customerId,
     sourceQuotationId:quotationId,idempotencyKey,
     invoiceNumber:invoiceReference,createdByUserId:principal.userId,draft}
   });
   return Object.freeze({invoice:persisted,replayed:false});
  }
 });
}
