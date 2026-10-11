-- Staged v332 schema candidate. This is not a production migration until a separately
-- reviewed release promotes it into cloudflare/migrations with matching release metadata,
-- readiness probes, runbook updates, and production migration authorization.
-- Employee-submitted proof remains reported/quarantined until the existing malware-scan
-- and management-review lifecycle promotes it. It never becomes accounting truth by itself.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS daily_report_evidence(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  report_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL UNIQUE,
  employee_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  report_date TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('receipt','payment_proof','work_photo','other')),
  amount_bwp REAL,
  reference TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  reconciliation_status TEXT NOT NULL DEFAULT 'reported'
    CHECK(reconciliation_status IN ('reported','partially_matched','bank_matched','verified','needs_review')),
  bank_transaction_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(report_id) REFERENCES daily_employee_reports(id) ON DELETE CASCADE,
  FOREIGN KEY(evidence_id) REFERENCES evidence(id) ON DELETE CASCADE,
  FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY(location_id) REFERENCES operating_locations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS daily_report_evidence_report_idx
ON daily_report_evidence(tenant_id,report_id,created_at DESC);

CREATE INDEX IF NOT EXISTS daily_report_evidence_reconciliation_idx
ON daily_report_evidence(tenant_id,reconciliation_status,report_date,location_id);

CREATE INDEX IF NOT EXISTS daily_report_evidence_branch_date_idx
ON daily_report_evidence(tenant_id,location_id,report_date,created_at DESC);