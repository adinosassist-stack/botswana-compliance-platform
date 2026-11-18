-- Essentials additive draft-only storage. DO NOT APPLY without isolated staging qualification.
-- Existing finance_invoices and finance_invoice_allocations remain unchanged.
CREATE TABLE IF NOT EXISTS essentials_invoice_drafts (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 source_quotation_id TEXT NOT NULL,
 idempotency_key TEXT NOT NULL,
 invoice_number TEXT NOT NULL,
 draft_payload_json TEXT NOT NULL CHECK(json_valid(draft_payload_json)),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status='draft'),
 created_by_user_id TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,idempotency_key),
 UNIQUE(tenant_id,invoice_number),
 UNIQUE(tenant_id,source_quotation_id),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(customer_id) REFERENCES finance_customers(id) ON DELETE RESTRICT,
 FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS essentials_invoice_drafts_tenant_customer_idx ON essentials_invoice_drafts(tenant_id,customer_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS essentials_invoice_drafts_customer_guard
BEFORE INSERT ON essentials_invoice_drafts
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM finance_customers c
  WHERE c.id=NEW.customer_id AND c.tenant_id=NEW.tenant_id AND c.status='active'
 ) THEN RAISE(ABORT,'essentials_customer_tenant_mismatch') END;
END;
