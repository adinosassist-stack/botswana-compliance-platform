-- DISPOSABLE STAGING D1 ONLY. Never apply to production.
-- Validate database uniqueness independently of application-level lookups.
CREATE TABLE owner_bank_receipt_allocation (
  bank_transaction_id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  verified_by_actor_id TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  UNIQUE (tenant_id, invoice_id)
);
INSERT INTO owner_bank_receipt_allocation
  (bank_transaction_id,tenant_id,invoice_id,amount_minor,currency,verified_by_actor_id,verified_at)
VALUES ('staging-bank-1','staging-tenant-a','staging-invoice-1',150000,'BWP','staging-owner','2026-10-29T12:00:00Z');
INSERT OR IGNORE INTO owner_bank_receipt_allocation
  (bank_transaction_id,tenant_id,invoice_id,amount_minor,currency,verified_by_actor_id,verified_at)
VALUES ('staging-bank-1','staging-tenant-b','staging-invoice-2',150000,'BWP','staging-owner','2026-10-29T12:01:00Z');
INSERT OR IGNORE INTO owner_bank_receipt_allocation
  (bank_transaction_id,tenant_id,invoice_id,amount_minor,currency,verified_by_actor_id,verified_at)
VALUES ('staging-bank-2','staging-tenant-a','staging-invoice-1',150000,'BWP','staging-owner','2026-10-29T12:02:00Z');
SELECT COUNT(*) AS expected_one_row FROM owner_bank_receipt_allocation;
SELECT bank_transaction_id,tenant_id,invoice_id,amount_minor,currency
FROM owner_bank_receipt_allocation;
