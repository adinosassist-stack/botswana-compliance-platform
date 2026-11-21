import {prepareAuthorizedInvoiceDraft} from "./essentials-invoice-draft-adapter.mjs";
/** Transaction boundary: repository implementation MUST enforce tenant-scoped reads,
 * atomic unique constraints, idempotency and rollback. No database is bundled here.
 */
export async function createEssentialsInvoiceDraft({principal,tenantId,quotationId,idempotencyKey,createdAt,repository}={}){
 const valid=v=>typeof v==="string"&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
 if(!valid(quotationId)||!valid(idempotencyKey)||!valid(tenantId))throw new TypeError("invalid_request");
 if(!repository||typeof repository.transaction!=="function")throw new TypeError("transaction_required");
 if(!principal||principal.tenantId!==tenantId||!Array.isArray(principal.permissions)||!principal.permissions.includes("invoice:draft:create"))throw new Error("permission_denied");
 return repository.transaction(async tx=>{
  if(typeof tx.getQuotationForTenant!=="function"||typeof tx.getDraftByIdempotencyKey!=="function"||typeof tx.reserveInvoiceReference!=="function"||typeof tx.insertDraftInvoice!=="function")throw new TypeError("transaction_contract_missing");
  // Revalidate the current quotation *inside the transaction* before replay.
  // A revoked, superseded or cross-tenant quote must never return a successful
  // prior draft solely because an idempotency key already exists.
  const quotation=await tx.getQuotationForTenant({tenantId,quotationId});
  if(!quotation)throw new Error("quotation_not_found");
  if(quotation.id!==quotationId||quotation.companyId!==tenantId)throw new Error("tenant_access_denied");
  if(quotation.status!=="accepted")throw new Error("quotation_not_accepted");
  const existing=await tx.getDraftByIdempotencyKey({tenantId,idempotencyKey});
  if(existing){
   if(existing.tenantId!==tenantId||existing.sourceQuotationId!==quotationId||
      existing.customerId!==quotation.customerId||
      existing.createdByUserId!==principal.userId||
      existing.status!=="draft")throw new Error("idempotency_conflict");
   return Object.freeze({invoice:existing,replayed:true});
  }
  const invoiceReference=await tx.reserveInvoiceReference({tenantId});
  const prepared=prepareAuthorizedInvoiceDraft({principal,tenantId,quotation,invoiceReference,createdAt});
  const invoice=await tx.insertDraftInvoice({tenantId,sourceQuotationId:quotationId,idempotencyKey,draft:prepared.draft});
  if(!invoice||invoice.tenantId!==tenantId||invoice.sourceQuotationId!==quotationId||
     invoice.customerId!==quotation.customerId||
     invoice.createdByUserId!==principal.userId||
     invoice.status!=="draft")throw new Error("invalid_insert_result");
  return Object.freeze({invoice,replayed:false});
 });
}
