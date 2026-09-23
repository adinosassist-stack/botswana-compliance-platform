-- V108 Phase 1: authoritative, provider-neutral invoices and receivables ledger.
-- Balances are derived from immutable invoice totals and append-only transaction allocations.
-- Money is stored as integer minor units. Canonical currency is Botswana pula (BWP).

CREATE TABLE IF NOT EXISTS finance_customers(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_code TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,customer_code),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS finance_customers_tenant_idx
  ON finance_customers(tenant_id,status,name);

CREATE TABLE IF NOT EXISTS finance_invoices(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  issued_on TEXT NOT NULL,
  due_on TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  total_minor INTEGER NOT NULL CHECK(total_minor>0),
  currency TEXT NOT NULL DEFAULT 'BWP' CHECK(currency='BWP'),
  status TEXT NOT NULL DEFAULT 'issued' CHECK(status IN ('issued','void')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,invoice_number),
  CHECK(length(issued_on)=10 AND length(due_on)=10 AND due_on>=issued_on),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(customer_id) REFERENCES finance_customers(id) ON DELETE RESTRICT,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS finance_invoices_tenant_due_idx
  ON finance_invoices(tenant_id,status,due_on,customer_id);
CREATE INDEX IF NOT EXISTS finance_invoices_customer_idx
  ON finance_invoices(tenant_id,customer_id,issued_on DESC);

CREATE TABLE IF NOT EXISTS finance_invoice_allocations(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
  entry_type TEXT NOT NULL DEFAULT 'apply' CHECK(entry_type IN ('apply','reverse')),
  reverses_allocation_id TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(
    (entry_type='apply' AND reverses_allocation_id IS NULL) OR
    (entry_type='reverse' AND reverses_allocation_id IS NOT NULL)
  ),
  UNIQUE(tenant_id,reverses_allocation_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(invoice_id) REFERENCES finance_invoices(id) ON DELETE RESTRICT,
  FOREIGN KEY(transaction_id) REFERENCES finance_transactions(id) ON DELETE RESTRICT,
  FOREIGN KEY(reverses_allocation_id) REFERENCES finance_invoice_allocations(id) ON DELETE RESTRICT,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS finance_invoice_allocations_invoice_idx
  ON finance_invoice_allocations(tenant_id,invoice_id,created_at);
CREATE INDEX IF NOT EXISTS finance_invoice_allocations_transaction_idx
  ON finance_invoice_allocations(tenant_id,transaction_id,created_at);

CREATE TRIGGER IF NOT EXISTS finance_invoices_customer_tenant_guard
BEFORE INSERT ON finance_invoices
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM finance_customers c
      WHERE c.id=NEW.customer_id AND c.tenant_id=NEW.tenant_id AND c.status='active'
    )
    THEN RAISE(ABORT,'finance_customer_tenant_mismatch')
  END;
END;

CREATE TRIGGER IF NOT EXISTS finance_invoice_allocations_apply_guard
BEFORE INSERT ON finance_invoice_allocations
WHEN NEW.entry_type='apply'
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM finance_invoices i
      WHERE i.id=NEW.invoice_id AND i.tenant_id=NEW.tenant_id AND i.status='issued'
    )
    THEN RAISE(ABORT,'finance_invoice_not_allocatable')
  END;
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM finance_transactions t
      WHERE t.id=NEW.transaction_id AND t.tenant_id=NEW.tenant_id AND t.amount_minor>0
    )
    THEN RAISE(ABORT,'finance_transaction_not_allocatable')
  END;
  SELECT CASE
    WHEN (
      SELECT COALESCE(SUM(CASE WHEN a.entry_type='apply' THEN a.amount_minor ELSE -a.amount_minor END),0)
      FROM finance_invoice_allocations a
      WHERE a.tenant_id=NEW.tenant_id AND a.invoice_id=NEW.invoice_id
    ) + NEW.amount_minor >
    (
      SELECT i.total_minor FROM finance_invoices i
      WHERE i.id=NEW.invoice_id AND i.tenant_id=NEW.tenant_id
    )
    THEN RAISE(ABORT,'finance_invoice_overallocation')
  END;
  SELECT CASE
    WHEN (
      SELECT COALESCE(SUM(CASE WHEN a.entry_type='apply' THEN a.amount_minor ELSE -a.amount_minor END),0)
      FROM finance_invoice_allocations a
      WHERE a.tenant_id=NEW.tenant_id AND a.transaction_id=NEW.transaction_id
    ) + NEW.amount_minor >
    (
      SELECT t.amount_minor FROM finance_transactions t
      WHERE t.id=NEW.transaction_id AND t.tenant_id=NEW.tenant_id
    )
    THEN RAISE(ABORT,'finance_transaction_overallocation')
  END;
END;

CREATE TRIGGER IF NOT EXISTS finance_invoice_allocations_reverse_guard
BEFORE INSERT ON finance_invoice_allocations
WHEN NEW.entry_type='reverse'
BEGIN
  SELECT CASE
    WHEN NOT EXISTS(
      SELECT 1 FROM finance_invoice_allocations a
      WHERE a.id=NEW.reverses_allocation_id
        AND a.tenant_id=NEW.tenant_id
        AND a.invoice_id=NEW.invoice_id
        AND a.transaction_id=NEW.transaction_id
        AND a.amount_minor=NEW.amount_minor
        AND a.entry_type='apply'
    )
    THEN RAISE(ABORT,'finance_allocation_reversal_mismatch')
  END;
END;

CREATE TRIGGER IF NOT EXISTS finance_invoice_allocations_immutable_update
BEFORE UPDATE ON finance_invoice_allocations
BEGIN
  SELECT RAISE(ABORT,'finance_allocation_immutable');
END;

CREATE TRIGGER IF NOT EXISTS finance_invoice_allocations_immutable_delete
BEFORE DELETE ON finance_invoice_allocations
BEGIN
  SELECT RAISE(ABORT,'finance_allocation_immutable');
END;
