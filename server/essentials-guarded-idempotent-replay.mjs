/**
 * UNMOUNTED source-only tenant-scoped retry adapter for acceptance-guarded
 * draft INSERT. The caller must already prove the current accepted quotation,
 * authorization, membership, session, origin and CSRF. No public route.
 *
 * Replays only an existing identical draft for the same actor, tenant,
 * customer and quotation. A revoked/stale acceptance cannot be bypassed by
 * this module: every request must first pass caller's current acceptance
 * verification. Database INSERT still verifies acceptance in the same write.
 */
import {findEssentialsDraftByKeyD1} from "./essentials-d1-draft-repository.mjs";
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
 const read=()=>findEssentialsDraftByKeyD1({
  db,tenantId:principal.tenantId,idempotencyKey:record.idempotencyKey
 });
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
