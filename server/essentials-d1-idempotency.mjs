import {insertEssentialsDraftD1,findEssentialsDraftByKeyD1} from "./essentials-d1-draft-repository.mjs";
/** Recover a concurrent insert only after a DB uniqueness error and a matching,
 * tenant-scoped idempotency record. Other constraint failures are propagated.
 * The caller must allocate invoice numbers and authorize tenant access.
 */
export async function insertOrReplayEssentialsDraftD1({db,record}={}){
 try {
  const inserted=await insertEssentialsDraftD1({db,record});
  return Object.freeze({invoice:inserted,replayed:false});
 } catch(error) {
  const message=String(error?.message||"");
  if(!/(UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE|SQLITE_CONSTRAINT_PRIMARYKEY)/i.test(message))throw error;
  const existing=await findEssentialsDraftByKeyD1({db,tenantId:record?.tenantId,idempotencyKey:record?.idempotencyKey});
  if(!existing)throw error;
  const normalize=draft=>{const copy={...draft};delete copy.invoiceReference;return JSON.stringify(copy);};
  if(existing.sourceQuotationId!==record.sourceQuotationId||existing.status!=="draft"||
     existing.customerId!==record.customerId||existing.createdByUserId!==record.createdByUserId||
     !record.draft||normalize(existing.draft)!==normalize(record.draft))throw new Error("idempotency_conflict");
  return Object.freeze({invoice:existing,replayed:true});
 }
}
