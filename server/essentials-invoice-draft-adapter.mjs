import {assertEssentialsDraftAccess} from "./essentials-access-boundary.mjs";
import {prepareInvoiceFromQuotation} from "./essentials-quote-to-invoice.mjs";
/** Adapter for an authenticated, tenant-scoped invoice draft transaction.
 * The caller owns session authentication, CSRF, DB transaction and uniqueness.
 * No database access or invoice issuance occurs here.
 */
export function prepareAuthorizedInvoiceDraft({principal,tenantId,quotation,invoiceReference,createdAt}={}){
 assertEssentialsDraftAccess({principal,tenantId,recordTenantId:quotation?.companyId,permission:"invoice:draft:create"});
 const draft=prepareInvoiceFromQuotation({quotation,invoiceReference,createdAt});
 if(draft.tenantId!==tenantId)throw new Error("tenant_access_denied");
 return Object.freeze({draft,uniquenessKey:`${draft.tenantId}:${draft.invoiceReference}`,requiresAtomicInsert:true,requiresServerAssignedReference:true,previewOnly:true});
}
