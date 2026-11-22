-- OFFLINE CANDIDATE ONLY -- MUST NOT RUN WITHOUT SEPARATE OWNER AND THUSICO APPROVAL.
-- New isolated Cloudflare account: ae0dccfed66fc497259aebd81229f08d
-- New isolated EMPTY D1: bw-essentials-invoice-rehearsal
-- D1 UUID: 4eb6c739-9c45-4756-bfa9-8ec0a6efb3be
-- Protected main at preparation: 72a61c0c6d05d52193f940037bef2da31337b0a9
-- Ordered DDL ONLY. No synthetic/customer records. No staging execution authorized.
-- DO NOT use production account ddd23cab31928a4bb3d4998df9b26d1d
-- DO NOT use old D1 f6d35915-851a-4771-9e07-589572dc4d05

-- BEGIN dependency_schema
-- Synthetic isolated Essentials D1 qualification only. Never run against production.
-- Minimal foreign-key dependencies; NOT a replica of production Finance Core.
CREATE TABLE tenants (id TEXT PRIMARY KEY);
CREATE TABLE users (id TEXT PRIMARY KEY);
CREATE TABLE finance_customers (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','inactive')),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);
-- END dependency_schema

-- BEGIN invoice_drafts
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
-- END invoice_drafts

-- BEGIN accepted_snapshots
-- STAGING-ONLY CANDIDATE. DO NOT EXECUTE without exact SQL, D1 and recovery approvals.
-- This is a new authoritative accepted-quotation snapshot, NOT a migration
-- of existing editable quotation drafts; no real customer data is copied here.
CREATE TABLE essentials_accepted_quotation_snapshots (
 tenant_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 quotation_reference TEXT NOT NULL,
 acceptance_version INTEGER NOT NULL CHECK(acceptance_version BETWEEN 1 AND 2147483647),
 total_minor INTEGER NOT NULL CHECK(total_minor>=0),
 accepted_by_user_id TEXT NOT NULL,
 accepted_at TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'accepted' CHECK(state IN ('accepted','revoked')),
 PRIMARY KEY (tenant_id,quotation_id),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id),
 FOREIGN KEY(customer_id) REFERENCES finance_customers(id),
 FOREIGN KEY(accepted_by_user_id) REFERENCES users(id)
);
-- Prevent all changes except irreversible revocation of existing acceptance.
CREATE TRIGGER essentials_accepted_snapshot_immutable
BEFORE UPDATE ON essentials_accepted_quotation_snapshots
WHEN NEW.tenant_id<>OLD.tenant_id OR NEW.quotation_id<>OLD.quotation_id
 OR NEW.customer_id<>OLD.customer_id OR NEW.quotation_reference<>OLD.quotation_reference
 OR NEW.acceptance_version<>OLD.acceptance_version OR NEW.total_minor<>OLD.total_minor
 OR NEW.accepted_by_user_id<>OLD.accepted_by_user_id OR NEW.accepted_at<>OLD.accepted_at
 OR OLD.state='revoked' OR NEW.state<>'revoked'
BEGIN
 SELECT RAISE(ABORT,'essentials_acceptance_immutable');
END;
CREATE TRIGGER essentials_accepted_snapshot_no_delete
BEFORE DELETE ON essentials_accepted_quotation_snapshots
BEGIN
 SELECT RAISE(ABORT,'essentials_acceptance_delete_denied');
END;
CREATE TRIGGER essentials_accepted_snapshot_customer_guard
BEFORE INSERT ON essentials_accepted_quotation_snapshots
BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM finance_customers AS c
  WHERE c.id=NEW.customer_id AND c.tenant_id=NEW.tenant_id AND c.status='active'
 ) THEN RAISE(ABORT,'essentials_acceptance_customer_invalid') END;
END;
-- END accepted_snapshots

