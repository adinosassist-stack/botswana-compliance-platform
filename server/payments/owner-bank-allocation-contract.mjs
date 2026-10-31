// Reference SQL contract only. This module does not connect to or modify a database.
// A unique bank transaction key must be enforced by the database, not a UI check.
export const OWNER_BANK_ALLOCATION_SCHEMA = `
CREATE TABLE IF NOT EXISTS owner_bank_receipt_allocation (
  bank_transaction_id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  verified_by_actor_id TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  UNIQUE (tenant_id, invoice_id)
);
CREATE INDEX IF NOT EXISTS idx_owner_bank_allocation_tenant
  ON owner_bank_receipt_allocation (tenant_id, verified_at);
`;

// Transaction adapter must implement a single atomic insert with a uniqueness
// constraint. It must be server-owned, never supplied from request JSON.
export async function allocateVerifiedBankReceipt({adapter, decision, tenantId, invoice, reviewer, verifiedAt} = {}) {
  if (!adapter || typeof adapter.insertUniqueAllocation !== "function")
    return {status:"unavailable"};
  if (!decision || decision.decision !== "verified" ||
      decision.invoiceId !== invoice?.id ||
      typeof decision.bankTransactionId !== "string" || !decision.bankTransactionId ||
      typeof tenantId !== "string" || !tenantId ||
      invoice?.tenantId !== tenantId ||
      !Number.isSafeInteger(invoice.amountMinor) || invoice.amountMinor <= 0 ||
      !/^[A-Z]{3}$/.test(invoice.currency || "") ||
      reviewer?.authenticated !== true || reviewer?.role !== "owner" ||
      reviewer?.tenantId !== tenantId || !reviewer?.actorId ||
      typeof verifiedAt !== "string" || !Number.isFinite(Date.parse(verifiedAt))) {
    return {status:"denied"};
  }
  try {
    const inserted = await adapter.insertUniqueAllocation({
      bankTransactionId:decision.bankTransactionId,
      tenantId,invoiceId:invoice.id,amountMinor:invoice.amountMinor,
      currency:invoice.currency,verifiedByActorId:reviewer.actorId,verifiedAt
    });
    return inserted === true ? {status:"allocated"} : {status:"conflict"};
  } catch {
    // Database errors, constraint conflicts and unavailable stores fail closed.
    return {status:"unavailable"};
  }
}
