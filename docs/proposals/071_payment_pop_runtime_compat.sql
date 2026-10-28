-- DESIGN CANDIDATE ONLY — migration 071: additive POP persistence compatibility only.
-- REQUIRES independent review, backup, schema rehearsal and protected migration authorization.
-- No payment settlement, entitlement, upload enablement or scanner activation.
ALTER TABLE payment_pop_documents ADD COLUMN content_sha256 TEXT;
ALTER TABLE payment_pop_documents ADD COLUMN object_etag TEXT;

-- Keep reserved and failed requests until a separate reviewed reconciliation policy.
CREATE TABLE payment_pop_upload_requests (
 document_id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 payment_order_id TEXT NOT NULL,
 key_hash TEXT NOT NULL CHECK(length(key_hash)=64),
 request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
 bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 3670016),
 state TEXT NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','stored','failed')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,payment_order_id,key_hash),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(payment_order_id) REFERENCES payment_orders(id) ON DELETE CASCADE
);
CREATE INDEX payment_pop_upload_requests_tenant_idx ON payment_pop_upload_requests(tenant_id,created_at);
