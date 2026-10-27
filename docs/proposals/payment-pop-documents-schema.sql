-- DESIGN CANDIDATE ONLY. Not a runnable release migration.
-- Requires privacy/security review, existing-schema integration and governed migration packaging.
-- POP intake metadata only. No activation or bank verification effect.
-- Attachment bytes remain private in R2 and must not be publicly served.
CREATE TABLE IF NOT EXISTS payment_pop_documents (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 payment_order_id TEXT NOT NULL,
 submission_id TEXT,
 source TEXT NOT NULL CHECK(source IN ('web','whatsapp_manual')),
 object_key TEXT NOT NULL UNIQUE,
 display_name TEXT NOT NULL,
 content_type TEXT NOT NULL CHECK(content_type IN ('application/pdf','image/jpeg','image/png')),
 bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 3670016),
 scan_status TEXT NOT NULL DEFAULT 'pending' CHECK(scan_status IN ('pending','clean','blocked','failed')),
 received_by_user_id TEXT,
 uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 deleted_at TEXT,
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(payment_order_id) REFERENCES payment_orders(id) ON DELETE CASCADE,
 FOREIGN KEY(submission_id) REFERENCES manual_payment_submissions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS payment_pop_documents_order_idx ON payment_pop_documents(tenant_id,payment_order_id,uploaded_at DESC);
CREATE INDEX IF NOT EXISTS payment_pop_documents_scan_idx ON payment_pop_documents(scan_status,uploaded_at);
-- POP storage is intentionally separate from payment fulfillment; never use these
-- records to mark an order paid or activate any subscription.
