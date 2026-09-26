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

CREATE TRIGGER IF NOT EXISTS finance_supplier_name_alias_collision_guard
BEFORE INSERT ON finance_suppliers
BEGIN
  SELECT RAISE(ABORT,'finance_supplier_name_alias_collision')
  WHERE EXISTS(
    SELECT 1 FROM finance_supplier_aliases a
    WHERE a.tenant_id=NEW.tenant_id AND a.normalized_alias=NEW.normalized_name
  );
END;

CREATE TRIGGER IF NOT EXISTS finance_supplier_alias_canonical_collision_guard
BEFORE INSERT ON finance_supplier_aliases
BEGIN
  SELECT RAISE(ABORT,'finance_supplier_alias_canonical_collision')
  WHERE EXISTS(
    SELECT 1 FROM finance_suppliers s
    WHERE s.tenant_id=NEW.tenant_id AND s.normalized_name=NEW.normalized_alias AND s.id<>NEW.supplier_id
  );
END;

CREATE TRIGGER IF NOT EXISTS finance_supplier_alias_tenant_guard
BEFORE INSERT ON finance_supplier_aliases
BEGIN
  SELECT RAISE(ABORT,'finance_supplier_tenant_mismatch')
  WHERE NOT EXISTS(
    SELECT 1 FROM finance_suppliers s
    WHERE s.id=NEW.supplier_id AND s.tenant_id=NEW.tenant_id AND s.status='active'
  );
END;

CREATE TRIGGER IF NOT EXISTS finance_payables_supplier_tenant_guard
BEFORE INSERT ON finance_payables
BEGIN
  SELECT RAISE(ABORT,'finance_supplier_tenant_mismatch')
  WHERE NOT EXISTS(
    SELECT 1 FROM finance_suppliers s
    WHERE s.id=NEW.supplier_id AND s.tenant_id=NEW.tenant_id AND s.status='active'
  );
END;

CREATE TRIGGER IF NOT EXISTS finance_payable_allocations_apply_guard
BEFORE INSERT ON finance_payable_allocations
WHEN NEW.entry_type='apply'
BEGIN
  SELECT RAISE(ABORT,'finance_payable_not_allocatable')
  WHERE NOT EXISTS(
    SELECT 1 FROM finance_payables p
    WHERE p.id=NEW.payable_id AND p.tenant_id=NEW.tenant_id AND p.status='open'
  );

  SELECT RAISE(ABORT,'finance_transaction_not_allocatable')
  WHERE NOT EXISTS(
    SELECT 1 FROM finance_transactions t
    WHERE t.id=NEW.transaction_id AND t.tenant_id=NEW.tenant_id AND t.amount_minor<0
  );

  SELECT RAISE(ABORT,'finance_payable_overallocation')
  WHERE (
    SELECT COALESCE(SUM(CASE WHEN a.entry_type='apply' THEN a.amount_minor ELSE -a.amount_minor END),0)
    FROM finance_payable_allocations a
    WHERE a.tenant_id=NEW.tenant_id AND a.payable_id=NEW.payable_id
  ) + NEW.amount_minor > (
    SELECT p.total_minor FROM finance_payables p
    WHERE p.id=NEW.payable_id AND p.tenant_id=NEW.tenant_id
  );

  SELECT RAISE(ABORT,'finance_transaction_overallocation')
  WHERE (
    SELECT COALESCE(SUM(CASE WHEN a.entry_type='apply' THEN a.amount_minor ELSE -a.amount_minor END),0)
    FROM finance_payable_allocations a
    WHERE a.tenant_id=NEW.tenant_id AND a.transaction_id=NEW.transaction_id
  ) + NEW.amount_minor > (
    SELECT ABS(t.amount_minor) FROM finance_transactions t
    WHERE t.id=NEW.transaction_id AND t.tenant_id=NEW.tenant_id
  );
END;

CREATE TRIGGER IF NOT EXISTS finance_payable_allocations_reverse_guard
BEFORE INSERT ON finance_payable_allocations
WHEN NEW.entry_type='reverse'
BEGIN
  SELECT RAISE(ABORT,'finance_payable_allocation_reversal_mismatch')
  WHERE NOT EXISTS(
    SELECT 1 FROM finance_payable_allocations a
    WHERE a.id=NEW.reverses_allocation_id
      AND a.tenant_id=NEW.tenant_id
      AND a.payable_id=NEW.payable_id
      AND a.transaction_id=NEW.transaction_id
      AND a.amount_minor=NEW.amount_minor
      AND a.entry_type='apply'
  );
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
