/**
 * Inert D1 draft repository bridge; NOT a D1 transaction implementation.
 * A host MUST supply a verified atomic transaction executor that runs ALL
 * callbacks against the same isolated connection/transaction and rolls back
 * on any error. D1 .batch alone is not accepted as this contract.
 * This module does not open databases, mount routes, or deploy.
 */
import {findEssentialsDraftByKeyD1} from "./essentials-d1-draft-repository.mjs";
import {insertOrReplayEssentialsDraftD1} from "./essentials-d1-idempotency.mjs";

const valid=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const fail=code=>{throw Error(code)};

/**
 * withAtomicTransaction(async context => value) must guarantee rollback
 * and serialize reference reservations with D1 INSERT; not an emulated
 * read-modify-write sequence or a series of REST calls.
 *
 * context = {db,tenantId,atomic:true,loadQuotationForTenant,
 *            reserveInvoiceReference,generateDraftId}
 *
 * All callbacks/DB handles are injected by a independently-reviewed host.
 */
export function createEssentialsD1AtomicRepository({
 enabled=false,environment,withAtomicTransaction
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  fail("essentials_atomic_repository_disabled");
 if(typeof withAtomicTransaction!=="function")
  fail("essentials_atomic_transaction_required");
 return Object.freeze({
  async transaction(callback){
   if(typeof callback!=="function")throw TypeError("transaction_callback_required");
   let entered=false;
   const result=await withAtomicTransaction(async context=>{
    if(entered)fail("transaction_reentry_denied");
    entered=true;
    if(!context||context.atomic!==true||!valid(context.tenantId)||
       typeof context.db?.prepare!=="function"||
       typeof context.loadQuotationForTenant!=="function"||
       typeof context.reserveInvoiceReference!=="function"||
       typeof context.generateDraftId!=="function")
     fail("atomic_transaction_context_unverified");
    const tenant=context.tenantId;
    return callback(Object.freeze({
     getDraftByIdempotencyKey:async ({tenantId,idempotencyKey})=>{
      if(tenantId!==tenant||!valid(idempotencyKey))fail("tenant_access_denied");
      return findEssentialsDraftByKeyD1({db:context.db,tenantId:tenant,idempotencyKey});
     },
     getQuotationForTenant:async ({tenantId,quotationId})=>{
      if(tenantId!==tenant||!valid(quotationId))fail("tenant_access_denied");
      const quote=await context.loadQuotationForTenant({tenantId:tenant,quotationId,db:context.db});
      if(quote && (quote.id!==quotationId||quote.companyId!==tenant))fail("quotation_tenant_mismatch");
      return quote;
     },
     reserveInvoiceReference:async ({tenantId})=>{
      if(tenantId!==tenant)fail("tenant_access_denied");
      const reference=await context.reserveInvoiceReference({tenantId:tenant,db:context.db});
      if(!valid(reference))fail("invalid_invoice_reference");
      return reference;
     },
     insertDraftInvoice:async ({tenantId,sourceQuotationId,idempotencyKey,draft})=>{
      if(tenantId!==tenant||!valid(sourceQuotationId)||!valid(idempotencyKey)||
         !draft||draft.tenantId!==tenant||draft.status!=="draft"||
         !valid(draft.customerId)||!valid(draft.invoiceReference))
       fail("draft_tenant_mismatch");
      const id=await context.generateDraftId({tenantId:tenant,db:context.db});
      if(!valid(id))fail("invalid_draft_id");
      const result=await insertOrReplayEssentialsDraftD1({db:context.db,record:{
       id,tenantId:tenant,customerId:draft.customerId,
       sourceQuotationId,idempotencyKey,invoiceNumber:draft.invoiceReference,
       createdByUserId:context.actorUserId,draft
      }});
      const invoice=result.invoice;
      if(!invoice||invoice.tenantId!==tenant||invoice.sourceQuotationId!==sourceQuotationId||
         invoice.status!=="draft")fail("invalid_draft_insert");
      return Object.freeze({id:invoice.id,tenantId:tenant,
       sourceQuotationId,status:"draft",
       invoiceReference:invoice.invoiceReference??draft.invoiceReference});
     }
    }));
   });
   if(!entered)fail("atomic_transaction_not_executed");
   return result;
  }
 });
}
