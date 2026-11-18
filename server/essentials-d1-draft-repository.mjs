/** D1 draft repository primitive. Requires a trusted, tenant-scoped caller.
 * Uses a single atomic INSERT with DB unique constraints; no read-then-write race.
 * Does not issue invoices or touch Finance Core.
 */
export async function insertEssentialsDraftD1({db,record}={}){
 if(!db||typeof db.prepare!=="function")throw new TypeError("db_required");
 const keys=["id","tenantId","customerId","sourceQuotationId","idempotencyKey","invoiceNumber","createdByUserId"];
 if(!record||keys.some(k=>typeof record[k]!=="string"||!record[k].trim()||record[k].length>128))throw new TypeError("invalid_record");
 const draft=record.draft;
 if(!draft||draft.status!=="draft"||draft.tenantId!==record.tenantId||draft.customerId!==record.customerId||draft.invoiceReference!==record.invoiceNumber)throw new TypeError("invalid_draft");
 const payload=JSON.stringify(draft);
 if(payload.length>65536)throw new TypeError("payload_too_large");
 const statement=db.prepare("INSERT INTO essentials_invoice_drafts (id,tenant_id,customer_id,source_quotation_id,idempotency_key,invoice_number,draft_payload_json,status,created_by_user_id) VALUES (?,?,?,?,?,?,?,'draft',?)");
 const result=await statement.bind(record.id,record.tenantId,record.customerId,record.sourceQuotationId,record.idempotencyKey,record.invoiceNumber,payload,record.createdByUserId).run();
 if(result?.success!==true)throw new Error("draft_insert_failed");
 return Object.freeze({id:record.id,tenantId:record.tenantId,sourceQuotationId:record.sourceQuotationId,status:"draft",inserted:true});
}
export async function findEssentialsDraftByKeyD1({db,tenantId,idempotencyKey}={}){
 if(!db||typeof db.prepare!=="function")throw new TypeError("db_required");
 if(typeof tenantId!=="string"||!tenantId||typeof idempotencyKey!=="string"||!idempotencyKey)throw new TypeError("invalid_lookup");
 const row=await db.prepare("SELECT id,tenant_id,source_quotation_id,invoice_number,status FROM essentials_invoice_drafts WHERE tenant_id=? AND idempotency_key=? LIMIT 1").bind(tenantId,idempotencyKey).first();
 return row?Object.freeze({id:row.id,tenantId:row.tenant_id,sourceQuotationId:row.source_quotation_id,invoiceReference:row.invoice_number,status:row.status}):null;
}
