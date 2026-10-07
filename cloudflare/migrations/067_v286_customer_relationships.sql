-- V286: governed customer relationship and follow-up preparation foundation.
-- This migration adds customer contact consent and human-approved follow-up drafts.
-- It does not enable external customer messaging or autonomous dispatch.

CREATE TABLE IF NOT EXISTS customer_contacts(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('whatsapp','email')),
  contact_value TEXT NOT NULL,
  contact_hash TEXT NOT NULL,
  consent_status TEXT NOT NULL DEFAULT 'unknown' CHECK(consent_status IN ('unknown','opted_in','opted_out')),
  consent_source TEXT,
  consent_recorded_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,customer_id,channel,contact_hash),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(customer_id) REFERENCES finance_customers(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS customer_contacts_customer_idx
  ON customer_contacts(tenant_id,customer_id,status,channel);
CREATE INDEX IF NOT EXISTS customer_contacts_consent_idx
  ON customer_contacts(tenant_id,consent_status,status,channel);

CREATE TABLE IF NOT EXISTS customer_followups(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  invoice_id TEXT,
  purpose TEXT NOT NULL CHECK(purpose IN ('receivable','quote','appointment','general')),
  message_body TEXT NOT NULL,
  message_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  prepared_by TEXT NOT NULL DEFAULT 'human' CHECK(prepared_by IN ('human','thebe')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','cancelled')),
  requested_by_user_id TEXT,
  approved_by_user_id TEXT,
  approved_at TEXT,
  queued_at TEXT,
  sent_at TEXT,
  provider_message_id TEXT,
  failure_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,idempotency_key),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(customer_id) REFERENCES finance_customers(id) ON DELETE CASCADE,
  FOREIGN KEY(contact_id) REFERENCES customer_contacts(id) ON DELETE CASCADE,
  FOREIGN KEY(invoice_id) REFERENCES finance_invoices(id) ON DELETE SET NULL,
  FOREIGN KEY(requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS customer_followups_status_idx
  ON customer_followups(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS customer_followups_customer_idx
  ON customer_followups(tenant_id,customer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS customer_followups_invoice_idx
  ON customer_followups(tenant_id,invoice_id,created_at DESC);

CREATE TRIGGER IF NOT EXISTS customer_contacts_tenant_guard
BEFORE INSERT ON customer_contacts
BEGIN
  SELECT (CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM finance_customers c
      WHERE c.id=NEW.customer_id AND c.tenant_id=NEW.tenant_id AND c.status='active'
    )
    THEN RAISE(ABORT,'customer_contact_scope_invalid')
  END);
END;

CREATE TRIGGER IF NOT EXISTS customer_contacts_identity_immutable_guard
BEFORE UPDATE ON customer_contacts
WHEN NEW.tenant_id<>OLD.tenant_id
  OR NEW.customer_id<>OLD.customer_id
  OR NEW.channel<>OLD.channel
  OR NEW.contact_value<>OLD.contact_value
  OR NEW.contact_hash<>OLD.contact_hash
  OR COALESCE(NEW.created_by_user_id,'')<>COALESCE(OLD.created_by_user_id,'')
BEGIN
  SELECT RAISE(ABORT,'customer_contact_identity_immutable');
END;

CREATE TRIGGER IF NOT EXISTS customer_followups_scope_guard
BEFORE INSERT ON customer_followups
BEGIN
  SELECT (CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM finance_customers c
      WHERE c.id=NEW.customer_id AND c.tenant_id=NEW.tenant_id AND c.status='active'
    )
    THEN RAISE(ABORT,'customer_followup_customer_scope_invalid')
  END);
  SELECT (CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM customer_contacts cc
      WHERE cc.id=NEW.contact_id AND cc.tenant_id=NEW.tenant_id
        AND cc.customer_id=NEW.customer_id AND cc.status='active'
    )
    THEN RAISE(ABORT,'customer_followup_contact_scope_invalid')
  END);
  SELECT (CASE
    WHEN NEW.invoice_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM finance_invoices i
      WHERE i.id=NEW.invoice_id AND i.tenant_id=NEW.tenant_id
        AND i.customer_id=NEW.customer_id AND i.status='issued'
    )
    THEN RAISE(ABORT,'customer_followup_invoice_scope_invalid')
  END);
END;

CREATE TRIGGER IF NOT EXISTS customer_followups_immutable_payload_guard
BEFORE UPDATE ON customer_followups
WHEN NEW.tenant_id<>OLD.tenant_id
  OR NEW.customer_id<>OLD.customer_id
  OR NEW.contact_id<>OLD.contact_id
  OR COALESCE(NEW.invoice_id,'')<>COALESCE(OLD.invoice_id,'')
  OR NEW.purpose<>OLD.purpose
  OR NEW.message_body<>OLD.message_body
  OR NEW.message_hash<>OLD.message_hash
  OR NEW.idempotency_key<>OLD.idempotency_key
  OR NEW.prepared_by<>OLD.prepared_by
  OR COALESCE(NEW.requested_by_user_id,'')<>COALESCE(OLD.requested_by_user_id,'')
BEGIN
  SELECT RAISE(ABORT,'customer_followup_payload_immutable');
END;

CREATE TRIGGER IF NOT EXISTS customer_followups_status_guard
BEFORE UPDATE ON customer_followups
WHEN NEW.status<>OLD.status
BEGIN
  SELECT (CASE
    WHEN NOT (
      (OLD.status='draft' AND NEW.status IN ('approved','cancelled'))
      OR (OLD.status='approved' AND NEW.status='cancelled')
    )
    THEN RAISE(ABORT,'customer_followup_status_transition_invalid')
  END);
  SELECT (CASE
    WHEN NEW.status='approved' AND (
      NEW.approved_by_user_id IS NULL
      OR NEW.approved_at IS NULL
      OR NOT EXISTS(
        SELECT 1 FROM customer_contacts cc
        WHERE cc.id=NEW.contact_id AND cc.tenant_id=NEW.tenant_id
          AND cc.customer_id=NEW.customer_id AND cc.status='active'
          AND cc.consent_status='opted_in'
      )
    )
    THEN RAISE(ABORT,'customer_followup_approval_invalid')
  END);
END;
