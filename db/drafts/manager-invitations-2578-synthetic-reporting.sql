-- #2578 ISOLATED SYNTHETIC MANAGER STAGING ONLY.
-- Source: columns and constraints copied from cloudflare/schema.sql.
-- Apply only to D1 518a9e33-b2ba-4204-ac52-aae4150a7b52
-- after verifying its exact name, tables, and recovery bookmark.
-- No seed users, employees, reports, invitations, passwords or tenant data.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS employees(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role_title TEXT,
  employment_type TEXT,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS employees_tenant_status_idx ON employees(tenant_id,status);
CREATE TABLE IF NOT EXISTS daily_employee_reports(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  report_date TEXT NOT NULL,
  work_summary TEXT NOT NULL DEFAULT '',
  wins TEXT NOT NULL DEFAULT '',
  blockers TEXT NOT NULL DEFAULT '',
  incidents TEXT NOT NULL DEFAULT '',
  next_plan TEXT NOT NULL DEFAULT '',
  kpi_json TEXT NOT NULL DEFAULT '{}',
  needs_attention INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'employee_link' CHECK(source IN ('employee_link','manager_entry','import')),
  revision_count INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY(location_id) REFERENCES operating_locations(id) ON DELETE CASCADE,
  UNIQUE(tenant_id,employee_id,location_id,report_date)
);
CREATE INDEX IF NOT EXISTS daily_employee_reports_tenant_date_idx ON daily_employee_reports(tenant_id,report_date,location_id,submitted_at DESC);
CREATE INDEX IF NOT EXISTS daily_employee_reports_employee_date_idx ON daily_employee_reports(tenant_id,employee_id,report_date DESC);
-- Revision logging, employee-link token issuance, uploads, production imports,
-- and real staff/report onboarding are intentionally OUT OF SCOPE.
