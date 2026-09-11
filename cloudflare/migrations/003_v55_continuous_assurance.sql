
CREATE TABLE IF NOT EXISTS control_assurance_runs(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'manual'
    CHECK(trigger_type IN ('manual','scheduled','rule_change','evidence_change')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','partial','failed')),
  controls_tested INTEGER NOT NULL DEFAULT 0,
  stale_controls INTEGER NOT NULL DEFAULT 0,
  overdue_controls INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  error_summary TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS control_assurance_runs_tenant_idx
ON control_assurance_runs(tenant_id,started_at DESC);

CREATE TABLE IF NOT EXISTS control_assurance_results(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  control_key TEXT NOT NULL,
  previous_status TEXT,
  result_status TEXT NOT NULL,
  previous_assurance TEXT,
  result_assurance TEXT NOT NULL,
  freshness TEXT NOT NULL
    CHECK(freshness IN ('current','due','overdue','stale','unknown')),
  reason TEXT,
  tested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(run_id) REFERENCES control_assurance_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(control_key) REFERENCES control_library(control_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS control_assurance_results_tenant_idx
ON control_assurance_results(tenant_id,control_key,tested_at DESC);

CREATE TABLE IF NOT EXISTS control_review_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  control_key TEXT NOT NULL,
  actor_user_id TEXT,
  event_type TEXT NOT NULL
    CHECK(event_type IN ('human_review','freshness_changed','owner_changed')),
  event_data TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(control_key) REFERENCES control_library(control_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS control_review_events_tenant_idx
ON control_review_events(tenant_id,control_key,occurred_at DESC);

CREATE TABLE IF NOT EXISTS continuous_assurance_state(
  state_key TEXT PRIMARY KEY,
  state_value TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE tenant_control_status ADD COLUMN assurance_freshness TEXT NOT NULL DEFAULT 'unknown'
  CHECK(assurance_freshness IN ('current','due','overdue','stale','unknown'));
ALTER TABLE tenant_control_status ADD COLUMN stale_reason TEXT;
ALTER TABLE tenant_control_status ADD COLUMN last_auto_checked_at TEXT;
ALTER TABLE tenant_control_status ADD COLUMN last_human_review_at TEXT;
ALTER TABLE tenant_control_status ADD COLUMN review_sla_at TEXT;
