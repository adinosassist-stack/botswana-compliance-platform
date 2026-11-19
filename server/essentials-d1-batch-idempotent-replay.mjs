/**
 * Source-only, unmounted tenant-scoped idempotent draft batch adapter.
 * Host MUST first authenticate the principal and verify quotation eligibility.
 * No route, Worker, database binding, invoice issuance or production activation.
 */
import {findEssentialsDraftByKeyD1} from "./essentials-d1-draft-repository.mjs";
import {insertAuthorizedEssentialsDraftBatch} from "./essentials-d1-atomic-batch.mjs";

const valid=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const deny=code=>{throw Error(code)};
const canonical=x=>Array.isArray(x)?x.map(canonical):
 x&&typeof x==="object"?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const comparable=draft=>{
 if(!draft||typeof draft!=="object"||Array.isArray(draft))deny("invalid_draft");
 const copy={...draft};
 // Invoice reference is server-generated per attempt. An existing matching
 // request is allowed to return its ORIGINAL reference, never a new one.
 delete copy.invoiceReference;
 return JSON.stringify(canonical(copy));
};
function authorize({principal,record}){
 if(!principal||!valid(principal.userId)||!valid(principal.tenantId)||
    !Array.isArray(principal.permissions)||!principal.permissions.includes("invoice:draft:create"))
  deny("permission_denied");
 if(!record||!valid(record.id)||!valid(record.tenantId)||!valid(record.customerId)||
    !valid(record.sourceQuotationId)||!valid(record.idempotencyKey)||
    !valid(record.invoiceNumber)||!valid(record.createdByUserId)||
    record.tenantId!==principal.tenantId||record.createdByUserId!==principal.userId||
    record.draft?.status!=="draft"||record.draft?.tenantId!==principal.tenantId||
    record.draft?.customerId!==record.customerId||
    record.draft?.invoiceReference!==record.invoiceNumber)
  deny("draft_tenant_mismatch");
}
function verifyReplay(existing,record){
 if(!existing)return null;
 if(existing.tenantId!==record.tenantId||
    existing.sourceQuotationId!==record.sourceQuotationId||
    existing.customerId!==record.customerId||
    existing.createdByUserId!==record.createdByUserId||
    existing.status!=="draft"||
    comparable(existing.draft)!==comparable(record.draft))
  deny("idempotency_conflict");
 return Object.freeze({invoice:Object.freeze({
  id:existing.id,tenantId:existing.tenantId,sourceQuotationId:existing.sourceQuotationId,
  invoiceReference:existing.invoiceReference,status:"draft"
 }),replayed:true});
}
export async function insertOrReplayEssentialsDraftBatch({db,principal,record}={}){
 if(!db||typeof db.prepare!=="function"||typeof db.batch!=="function")
  throw TypeError("d1_batch_required");
 authorize({principal,record});
 const read=()=>findEssentialsDraftByKeyD1({
  db,tenantId:principal.tenantId,idempotencyKey:record.idempotencyKey
 });
 const before=verifyReplay(await read(),record);
 if(before)return before;
 try{
  const invoice=await insertAuthorizedEssentialsDraftBatch({db,principal,record});
  return Object.freeze({invoice,replayed:false});
 }catch(error){
  const message=String(error?.message??"");
  // Only a conflict on THIS tenant/idempotency-key uniqueness constraint
  // may be recovered. Invoice-number and source-quotation collisions must
  // propagate; neither is proof of an idempotent retry.
  if(!/UNIQUE constraint failed:\s*essentials_invoice_drafts\.tenant_id,\s*essentials_invoice_drafts\.idempotency_key/i.test(message))
   throw error;
  const replay=verifyReplay(await read(),record);
  if(replay)return replay;
  throw error;
 }
}
