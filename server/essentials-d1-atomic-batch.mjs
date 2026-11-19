/**
 * Unmounted D1 atomic write primitive for a pre-authorized invoice draft.
 * This is NOT the complete quote-to-invoice transaction: a trusted host
 * must authenticate the actor, resolve the tenant, verify the accepted quote,
 * assign the unique server reference and construct the draft.
 *
 * A single D1 batch commits the draft INSERT and read-back together;
 * Cloudflare D1 rolls the entire batch back if a statement fails.
 * Never use this primitive against Finance Core production.
 */
const valid=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const fail=code=>{throw new Error(code)};
export async function insertAuthorizedEssentialsDraftBatch({db,principal,record}={}){
 if(!db||typeof db.prepare!=="function"||typeof db.batch!=="function")
  throw new TypeError("d1_batch_required");
 if(!principal||!valid(principal.userId)||!valid(principal.tenantId)||
    !Array.isArray(principal.permissions)||
    !principal.permissions.includes("invoice:draft:create"))
  fail("permission_denied");
 const required=["id","tenantId","customerId","sourceQuotationId","idempotencyKey","invoiceNumber","createdByUserId"];
 if(!record||required.some(key=>!valid(record[key]))||
    record.tenantId!==principal.tenantId||record.createdByUserId!==principal.userId)
  fail("draft_tenant_mismatch");
 if(!record.draft||record.draft.status!=="draft"||
    record.draft.tenantId!==record.tenantId||
    record.draft.customerId!==record.customerId||
    record.draft.invoiceReference!==record.invoiceNumber)
  fail("invalid_draft");
 const payload=JSON.stringify(record.draft);
 if(payload.length>65536)fail("payload_too_large");
 const insert=db.prepare("INSERT INTO essentials_invoice_drafts (id,tenant_id,customer_id,source_quotation_id,idempotency_key,invoice_number,draft_payload_json,status,created_by_user_id) VALUES (?,?,?,?,?,?,?,'draft',?)")
  .bind(record.id,record.tenantId,record.customerId,record.sourceQuotationId,record.idempotencyKey,record.invoiceNumber,payload,record.createdByUserId);
 const verify=db.prepare("SELECT id,tenant_id,customer_id,source_quotation_id,idempotency_key,invoice_number,status,created_by_user_id FROM essentials_invoice_drafts WHERE id=? AND tenant_id=? LIMIT 1")
  .bind(record.id,record.tenantId);
 const results=await db.batch([insert,verify]);
 if(!Array.isArray(results)||results.length!==2||
    results.some(x=>x?.success!==true)||!Array.isArray(results[1].results)||
    results[1].results.length!==1)fail("atomic_batch_failed");
 const row=results[1].results[0];
 if(row.id!==record.id||row.tenant_id!==record.tenantId||
    row.customer_id!==record.customerId||row.source_quotation_id!==record.sourceQuotationId||
    row.idempotency_key!==record.idempotencyKey||row.invoice_number!==record.invoiceNumber||
    row.status!=="draft"||row.created_by_user_id!==record.createdByUserId)
  fail("atomic_batch_readback_mismatch");
 return Object.freeze({id:row.id,tenantId:row.tenant_id,sourceQuotationId:row.source_quotation_id,
  invoiceReference:row.invoice_number,status:"draft"});
}
