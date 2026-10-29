// Cloudflare D1 reference adapter. Not connected to production routes.
// D1's prepared statement .run() returns {meta:{changes}}; rely on DB uniqueness.
export function createD1BankAllocationAdapter(db) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("trusted D1 binding required");
  return Object.freeze({
    async insertUniqueAllocation(record) {
      if (!record || !["bankTransactionId","tenantId","invoiceId","currency","verifiedByActorId","verifiedAt"].every(k=>typeof record[k]==="string" && record[k].trim()) ||
          !Number.isSafeInteger(record.amountMinor) || record.amountMinor<=0) throw new TypeError("invalid allocation record");
      const result=await db.prepare(`INSERT OR IGNORE INTO owner_bank_receipt_allocation
        (bank_transaction_id,tenant_id,invoice_id,amount_minor,currency,verified_by_actor_id,verified_at)
        VALUES (?,?,?,?,?,?,?)`)
        .bind(record.bankTransactionId,record.tenantId,record.invoiceId,record.amountMinor,record.currency,record.verifiedByActorId,record.verifiedAt)
        .run();
      if (!result || result.success!==true || !Number.isSafeInteger(result.meta?.changes)) throw new Error("unconfirmed D1 insert");
      return result.meta.changes===1;
    }
  });
}
