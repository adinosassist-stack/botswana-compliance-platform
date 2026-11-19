/**
 * UNMOUNTED source-only tenant-scoped retry adapter for acceptance-guarded
 * draft INSERT. The caller must already prove the current accepted quotation,
 * authorization, membership, session, origin and CSRF. No public route.
 *
 * Replays only an existing identical draft for the same actor, tenant,
 * customer and quotation. A revoked/stale acceptance cannot be bypassed by
 * this module: every request must first pass caller's current acceptance
 * verification. The replay SELECT itself also checks the accepted snapshot
 * status/version, tenant/customer/reference/total in the same D1 statement.
 * Database INSERT still verifies acceptance in the same write.
 */
import {insertAcceptedEssentialsDraftGuarded} from "./essentials-accepted-quotation-guard.mjs";

const valid=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const canonical=x=>Array.isArray(x)?x.map(canonical):
 x&&typeof x==="object"?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
function comparable(draft){
 if(!draft||typeof draft!=="object"||Array.isArray(draft))throw Error("idempotency_conflict");
 const copy={...draft};delete copy.invoiceReference;
 return JSON.stringify(canonical(copy));
}
function checkPrincipal(principal,record){
 if(!principal||!valid(principal.tenantId)||!valid(principal.userId)||
    !Array.isArray(principal.permissions)||
    !principal.permissions.includes("invoice:draft:create")||
    !record||!valid(record.tenantId)||!valid(record.idempotencyKey)||
    !valid(record.sourceQuotationId)||!valid(record.customerId)||
    !valid(record.createdByUserId)||!valid(record.invoiceNumber)||
    record.tenantId!==principal.tenantId||
    record.createdByUserId!==principal.userId||
    record.draft?.tenantId!==record.tenantId||
    record.draft?.customerId!==record.customerId||
    record.draft?.invoiceReference!==record.invoiceNumber||
    record.draft?.status!=="draft")
  throw Error("permission_denied");
}
function match(existing,record){
 if(!existing)return null;
 if(existing.tenantId!==record.tenantId||
    existing.sourceQuotationId!==record.sourceQuotationId||
    existing.customerId!==record.customerId||
    existing.createdByUserId!==record.createdByUserId||
    existing.status!=="draft"||
    comparable(existing.draft)!==comparable(record.draft))
  throw Error("idempotency_conflict");
 return Object.freeze({invoice:Object.freeze({
  id:existing.id,tenantId:existing.tenantId,
  sourceQuotationId:existing.sourceQuotationId,
  invoiceReference:existing.invoiceReference,status:"draft"
 }),replayed:true});
}
export async function insertOrReplayAcceptedEssentialsDraft({
 db,principal,record,acceptanceVersion,sourceQuotationReference
}={}){
 if(typeof db?.prepare!=="function")throw TypeError("d1_required");
 checkPrincipal(principal,record);
 if(!Number.isSafeInteger(acceptanceVersion)||acceptanceVersion<1||
    acceptanceVersion>2147483647||
    !valid(sourceQuotationReference)||
    record.draft?.sourceQuotationReference!==sourceQuotationReference)
  throw Error("acceptance_version_unverified");
 const read=async()=>{
  // Do not replay a previously saved draft if acceptance was revoked,
  // versioned out or mismatches current trusted quotation evidence.
  // Query eligibility and the draft row in ONE D1 SELECT statement.
  const row=await db.prepare(`
   SELECT d.id,d.tenant_id,d.customer_id,d.source_quotation_id,
    d.invoice_number,d.status,d.created_by_user_id,d.draft_payload_json
   FROM essentials_invoice_drafts AS d
   JOIN essentials_accepted_quotation_snapshots AS a
    ON a.tenant_id=d.tenant_id AND a.quotation_id=d.source_quotation_id
   WHERE d.tenant_id=? AND d.idempotency_key=? AND d.source_quotation_id=?
    AND d.customer_id=? AND a.state='accepted'
    AND a.acceptance_version=? AND a.quotation_reference=?
    AND a.total_minor=? AND a.customer_id=d.customer_id
   LIMIT 1
  `).bind(principal.tenantId,record.idempotencyKey,record.sourceQuotationId,
   record.customerId,acceptanceVersion,sourceQuotationReference,
   record.draft.totalMinor).first();
  if(!row)return null;
  return Object.freeze({id:row.id,tenantId:row.tenant_id,
   sourceQuotationId:row.source_quotation_id,invoiceReference:row.invoice_number,
   customerId:row.customer_id,createdByUserId:row.created_by_user_id,
   draft:JSON.parse(row.draft_payload_json),status:row.status});
 };
 const previous=match(await read(),record);
 if(previous)return previous;
 try{
  const invoice=await insertAcceptedEssentialsDraftGuarded({
   db,principal,record,acceptanceVersion,sourceQuotationReference
  });
  return Object.freeze({invoice,replayed:false});
 }catch(error){
  // A failing SQL eligibility predicate (0 rows), transport error, or
  // invoice number/source uniqueness is NEVER an idempotent success.
  if(!/UNIQUE constraint failed:\s*essentials_invoice_drafts\.tenant_id,\s*essentials_invoice_drafts\.idempotency_key/i.test(String(error?.message??"")))
   throw error;
  const recovered=match(await read(),record);
  if(recovered)return recovered;
  throw error;
 }
}
