-- v73: multi-location daily employee reporting and grounded AI management summaries.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS operating_locations(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  town TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS operating_locations_tenant_idx ON operating_locations(tenant_id,active,name);
CREATE UNIQUE INDEX IF NOT EXISTS operating_locations_tenant_code_uq ON operating_locations(tenant_id,code) WHERE code IS NOT NULL AND code<>'';

CREATE TABLE IF NOT EXISTS employee_reporting_access(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT,
  last_rotated_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY(location_id) REFERENCES operating_locations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS employee_reporting_access_tenant_idx ON employee_reporting_access(tenant_id,status,location_id,employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS employee_reporting_access_active_uq ON employee_reporting_access(tenant_id,employee_id,location_id) WHERE status='active';

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

CREATE TABLE IF NOT EXISTS daily_report_revisions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  revision_no INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(report_id) REFERENCES daily_employee_reports(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS daily_report_revisions_report_idx ON daily_report_revisions(report_id,revision_no DESC);

CREATE TABLE IF NOT EXISTS daily_reporting_settings(
  tenant_id TEXT PRIMARY KEY,
  auto_summary_enabled INTEGER NOT NULL DEFAULT 0,
  digest_hour_local INTEGER NOT NULL DEFAULT 18,
  digest_minute_local INTEGER NOT NULL DEFAULT 15,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_operations_summaries(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  summary_date TEXT NOT NULL,
  location_id TEXT,
  report_count INTEGER NOT NULL DEFAULT 0,
  expected_count INTEGER NOT NULL DEFAULT 0,
  generation_mode TEXT NOT NULL CHECK(generation_mode IN ('workers_ai','structured_fallback')),
  trigger_type TEXT NOT NULL DEFAULT 'manual' CHECK(trigger_type IN ('manual','scheduled')),
  model TEXT,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  narrative_json TEXT NOT NULL DEFAULT '{}',
  source_report_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(location_id) REFERENCES operating_locations(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS daily_operations_summaries_tenant_date_idx ON daily_operations_summaries(tenant_id,summary_date,created_at DESC);

CREATE TABLE IF NOT EXISTS daily_reporting_exceptions(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  report_date TEXT NOT NULL,
  reason_code TEXT NOT NULL CHECK(reason_code IN ('leave','rest_day','field_assignment','training','connectivity','other')),
  note TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY(location_id) REFERENCES operating_locations(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(tenant_id,employee_id,location_id,report_date)
);
CREATE INDEX IF NOT EXISTS daily_reporting_exceptions_date_idx ON daily_reporting_exceptions(tenant_id,report_date,location_id);
