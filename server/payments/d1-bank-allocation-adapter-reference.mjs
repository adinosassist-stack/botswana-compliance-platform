import {canonicalAllocationId,validAllocationCurrency,validAllocationTimestamp} from "./bank-allocation-input-validation.mjs";
// Cloudflare D1 reference adapter. Not connected to production routes.
// D1's prepared statement .run() returns {meta:{changes}}; rely on DB uniqueness.
export function createD1BankAllocationAdapter(db) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("trusted D1 binding required");
  return Object.freeze({
    // Server-side conflict read, global on transaction ID and scoped to
    // tenant+invoice. Atomic INSERT uniqueness remains the final authority.
    async loadConflictingAllocations({bankTransactionId,tenantId,invoiceId} = {}) {
      if (![bankTransactionId,tenantId,invoiceId].every(canonicalAllocationId))
        throw new TypeError("invalid allocation lookup");
      const result=await db.prepare(
        "SELECT bank_transaction_id AS bankTransactionId, tenant_id AS tenantId, invoice_id AS invoiceId FROM owner_bank_receipt_allocation WHERE bank_transaction_id=? OR (tenant_id=? AND invoice_id=?) LIMIT 2"
      ).bind(bankTransactionId,tenantId,invoiceId).all();
      if (!result || result.success!==true || !Array.isArray(result.results))
        throw new Error("unconfirmed D1 allocation lookup");
      return result.results;
    },
    async insertUniqueAllocation(record) {
      if (!record || !["bankTransactionId","tenantId","invoiceId","verifiedByActorId"].every(k=>canonicalAllocationId(record[k])) ||
          !validAllocationCurrency(record.currency) || !validAllocationTimestamp(record.verifiedAt) ||
          !Number.isSafeInteger(record.amountMinor) || record.amountMinor<=0) throw new TypeError("invalid allocation record");
      const result=await db.prepare(`INSERT OR IGNORE INTO owner_bank_receipt_allocation
        (bank_transaction_id,tenant_id,invoice_id,amount_minor,currency,verified_by_actor_id,verified_at)
        VALUES (?,?,?,?,?,?,?)`)
        .bind(record.bankTransactionId,record.tenantId,record.invoiceId,record.amountMinor,record.currency,record.verifiedByActorId,record.verifiedAt)
        .run();
      if (!result || result.success!==true || !Number.isSafeInteger(result.meta?.changes) || ![0,1].includes(result.meta.changes)) throw new Error("unconfirmed D1 insert");
      return result.meta.changes===1;
    }
  });
}
