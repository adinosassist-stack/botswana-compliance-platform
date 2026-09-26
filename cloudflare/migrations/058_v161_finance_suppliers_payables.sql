-- V161 / Money Intelligence v3: canonical supplier and payable ledger.
-- Supplier identity is explicit and tenant-scoped. Payable settlement is derived only from
-- append-only allocations to recorded negative Finance Core transactions.
-- This migration grants no payment, approval, journal, procurement or other execution authority.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS finance_suppliers(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  supplier_code TEXT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  default_expense_category TEXT NOT NULL DEFAULT 'other'
    CHECK(default_expense_category IN ('inventory','materials','rent','utilities','payroll','transport','marketing','tax','loan','equipment','professional_services','other')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,supplier_code),
  UNIQUE(tenant_id,normalized_name),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS finance_suppliers_tenant_idx
  ON finance_suppliers(tenant_id,status,name);

CREATE TABLE IF NOT EXISTS finance_supplier_aliases(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  alias_text TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'owner_confirmed' CHECK(source_kind='owner_confirmed'),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,normalized_alias),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(supplier_id) REFERENCES finance_suppliers(id) ON DELETE RESTRICT,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS finance_supplier_aliases_supplier_idx
  ON finance_supplier_aliases(tenant_id,supplier_id,normalized_alias);

CREATE TABLE IF NOT EXISTS finance_payables(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  payable_number TEXT NOT NULL,
  issued_on TEXT NOT NULL,
  due_on TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  total_minor INTEGER NOT NULL CHECK(total_minor>0),
  currency TEXT NOT NULL DEFAULT 'BWP' CHECK(currency='BWP'),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','void')),
  expense_category TEXT NOT NULL DEFAULT 'other'
    CHECK(expense_category IN ('inventory','materials','rent','utilities','payroll','transport','marketing','tax','loan','equipment','professional_services','other')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,supplier_id,payable_number),
  CHECK(length(issued_on)=10 AND length(due_on)=10 AND due_on>=issued_on),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(supplier_id) REFERENCES finance_suppliers(id) ON DELETE RESTRICT,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS finance_payables_tenant_due_idx
  ON finance_payables(tenant_id,status,due_on,supplier_id);
CREATE INDEX IF NOT EXISTS finance_payables_supplier_idx
  ON finance_payables(tenant_id,supplier_id,issued_on DESC);

CREATE TABLE IF NOT EXISTS finance_payable_allocations(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  payable_id TEXT NOT NULL,
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
  FOREIGN KEY(payable_id) REFERENCES finance_payables(id) ON DELETE RESTRICT,
  FOREIGN KEY(transaction_id) REFERENCES finance_transactions(id) ON DELETE RESTRICT,
  FOREIGN KEY(reverses_allocation_id) REFERENCES finance_payable_allocations(id) ON DELETE RESTRICT,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS finance_payable_allocations_payable_idx
  ON finance_payable_allocations(tenant_id,payable_id,created_at);
CREATE INDEX IF NOT EXISTS finance_payable_allocations_transaction_idx
  ON finance_payable_allocations(tenant_id,transaction_id,created_at);

CREATE TRIGGER IF NOT EXISTS finance_supplier_alias_tenant_guard
BEFORE INSERT ON finance_supplier_aliases
BEGIN
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1 FROM finance_suppliers s
    WHERE s.id=NEW.supplier_id AND s.tenant_id=NEW.tenant_id AND s.status='active'
  ) THEN RAISE(ABORT,'finance_supplier_tenant_mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS finance_payables_supplier_tenant_guard
BEFORE INSERT ON finance_payables
BEGIN
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1 FROM finance_suppliers s
    WHERE s.id=NEW.supplier_id AND s.tenant_id=NEW.tenant_id AND s.status='active'
  ) THEN RAISE(ABORT,'finance_supplier_tenant_mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS finance_payable_allocations_apply_guard
BEFORE INSERT ON finance_payable_allocations
WHEN NEW.entry_type='apply'
BEGIN
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1 FROM finance_payables p
    WHERE p.id=NEW.payable_id AND p.tenant_id=NEW.tenant_id AND p.status='open'
  ) THEN RAISE(ABORT,'finance_payable_not_allocatable') END;
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1 FROM finance_transactions t
    WHERE t.id=NEW.transaction_id AND t.tenant_id=NEW.tenant_id AND t.amount_minor<0
  ) THEN RAISE(ABORT,'finance_transaction_not_allocatable') END;
  SELECT (CASE WHEN (
    SELECT COALESCE(SUM(CASE WHEN a.entry_type='apply' THEN a.amount_minor ELSE -a.amount_minor END),0)
    FROM finance_payable_allocations a
    WHERE a.tenant_id=NEW.tenant_id AND a.payable_id=NEW.payable_id
  ) + NEW.amount_minor > (
    SELECT p.total_minor FROM finance_payables p
    WHERE p.id=NEW.payable_id AND p.tenant_id=NEW.tenant_id
  ) THEN RAISE(ABORT,'finance_payable_overallocation') END;
  SELECT (CASE WHEN (
    SELECT COALESCE(SUM(CASE WHEN a.entry_type='apply' THEN a.amount_minor ELSE -a.amount_minor END),0)
    FROM finance_payable_allocations a
    WHERE a.tenant_id=NEW.tenant_id AND a.transaction_id=NEW.transaction_id
  ) + NEW.amount_minor > (
    SELECT ABS(t.amount_minor) FROM finance_transactions t
    WHERE t.id=NEW.transaction_id AND t.tenant_id=NEW.tenant_id
  ) THEN RAISE(ABORT,'finance_transaction_overallocation') END;
END;

CREATE TRIGGER IF NOT EXISTS finance_payable_allocations_reverse_guard
BEFORE INSERT ON finance_payable_allocations
WHEN NEW.entry_type='reverse'
BEGIN
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1 FROM finance_payable_allocations a
    WHERE a.id=NEW.reverses_allocation_id
      AND a.tenant_id=NEW.tenant_id
      AND a.payable_id=NEW.payable_id
      AND a.transaction_id=NEW.transaction_id
      AND a.amount_minor=NEW.amount_minor
      AND a.entry_type='apply'
  ) THEN RAISE(ABORT,'finance_payable_allocation_reversal_mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS finance_payable_allocations_immutable_update
BEFORE UPDATE ON finance_payable_allocations
BEGIN
  SELECT RAISE(ABORT,'finance_payable_allocation_immutable');
END;

CREATE TRIGGER IF NOT EXISTS finance_payable_allocations_immutable_delete
BEFORE DELETE ON finance_payable_allocations
BEGIN
  SELECT RAISE(ABORT,'finance_payable_allocation_immutable');
END;
