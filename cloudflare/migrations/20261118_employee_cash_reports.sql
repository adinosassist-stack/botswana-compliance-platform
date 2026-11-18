-- Employee Cash & Expenses (issue #2653).
-- Additive schema; zero permissions until separately approved staff portal and cash feature flags.
-- No finance_transactions writes, no real payment execution, no employee-issued advances.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS employee_cash_entries(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  actor_kind TEXT NOT NULL CHECK(actor_kind IN ('employee','manager')),
  actor_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('advance','expense')),
  amount_minor INTEGER NOT NULL CHECK(amount_minor BETWEEN 1 AND 10000000),
  category TEXT NOT NULL CHECK(length(category) BETWEEN 1 AND 32),
  purpose TEXT NOT NULL CHECK(length(purpose) BETWEEN 3 AND 500),
  receipt_reference TEXT NOT NULL DEFAULT '' CHECK(length(receipt_reference)<=160),
  job_reference TEXT NOT NULL DEFAULT '' CHECK(length(job_reference)<=120),
  occurred_on TEXT NOT NULL CHECK(length(occurred_on)=10),
  idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 16 AND 80),
  status TEXT NOT NULL CHECK(status IN ('submitted','approved','rejected')),
  reviewed_by_user_id TEXT REFERENCES users(id),
  reviewed_at TEXT,
  review_note TEXT NOT NULL DEFAULT '' CHECK(length(review_note)<=500),
  last_review_event_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,employee_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS employee_cash_entries_employee_idx
  ON employee_cash_entries(tenant_id,employee_id,occurred_on,created_at);
CREATE INDEX IF NOT EXISTS employee_cash_entries_review_idx
  ON employee_cash_entries(tenant_id,status,created_at);

CREATE TABLE IF NOT EXISTS employee_cash_counts(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  report_date TEXT NOT NULL CHECK(length(report_date)=10),
  counted_minor INTEGER NOT NULL CHECK(counted_minor BETWEEN 0 AND 100000000),
  note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=500),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','approved','flagged')),
  reviewed_by_user_id TEXT REFERENCES users(id),
  reviewed_at TEXT,
  review_note TEXT NOT NULL DEFAULT '' CHECK(length(review_note)<=500),
  last_review_event_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,employee_id,report_date)
);
CREATE INDEX IF NOT EXISTS employee_cash_counts_review_idx
  ON employee_cash_counts(tenant_id,status,report_date);

CREATE TABLE IF NOT EXISTS employee_cash_events(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  entry_id TEXT REFERENCES employee_cash_entries(id) ON DELETE CASCADE,
  count_id TEXT REFERENCES employee_cash_counts(id) ON DELETE CASCADE,
  actor_kind TEXT NOT NULL CHECK(actor_kind IN ('employee','manager')),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('advance_recorded','expense_submitted','expense_approved','expense_rejected','count_submitted','count_approved','count_flagged')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK((entry_id IS NOT NULL AND count_id IS NULL) OR (entry_id IS NULL AND count_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS employee_cash_events_tenant_idx
  ON employee_cash_events(tenant_id,employee_id,created_at);

-- Defense in depth: each cash employee must belong to the same tenant.
-- A standalone employee_id FK does not imply tenant ownership.
CREATE TRIGGER IF NOT EXISTS employee_cash_entries_tenant_guard
BEFORE INSERT ON employee_cash_entries
WHEN NOT EXISTS (
  SELECT 1 FROM employees e
  WHERE e.id=NEW.employee_id AND e.tenant_id=NEW.tenant_id
)
BEGIN SELECT RAISE(ABORT,'employee_cash_tenant_mismatch'); END;

CREATE TRIGGER IF NOT EXISTS employee_cash_counts_tenant_guard
BEFORE INSERT ON employee_cash_counts
WHEN NOT EXISTS (
  SELECT 1 FROM employees e
  WHERE e.id=NEW.employee_id AND e.tenant_id=NEW.tenant_id
)
BEGIN SELECT RAISE(ABORT,'employee_cash_tenant_mismatch'); END;

-- Audit rows must identify the same tenant and employee as their linked entry/count.
CREATE TRIGGER IF NOT EXISTS employee_cash_events_tenant_guard
BEFORE INSERT ON employee_cash_events
WHEN NOT EXISTS (
  SELECT 1 FROM employees e
  WHERE e.id=NEW.employee_id AND e.tenant_id=NEW.tenant_id
) OR (NEW.entry_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM employee_cash_entries c
  WHERE c.id=NEW.entry_id AND c.employee_id=NEW.employee_id AND c.tenant_id=NEW.tenant_id
)) OR (NEW.count_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM employee_cash_counts c
  WHERE c.id=NEW.count_id AND c.employee_id=NEW.employee_id AND c.tenant_id=NEW.tenant_id
))
BEGIN SELECT RAISE(ABORT,'employee_cash_audit_tenant_mismatch'); END;
