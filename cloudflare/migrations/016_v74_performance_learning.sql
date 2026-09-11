-- v74: auditable performance learning, baseline memory, feedback and notifications.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS daily_performance_snapshots(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  location_id TEXT,
  location_name TEXT NOT NULL DEFAULT 'All locations',
  coverage REAL NOT NULL DEFAULT 0,
  reports_received INTEGER NOT NULL DEFAULT 0,
  reports_expected INTEGER NOT NULL DEFAULT 0,
  tasks REAL NOT NULL DEFAULT 0,
  customers REAL NOT NULL DEFAULT 0,
  revenue REAL NOT NULL DEFAULT 0,
  incidents REAL NOT NULL DEFAULT 0,
  attention REAL NOT NULL DEFAULT 0,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(location_id) REFERENCES operating_locations(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS daily_performance_snapshots_uq ON daily_performance_snapshots(tenant_id,snapshot_date,COALESCE(location_id,''));
CREATE INDEX IF NOT EXISTS daily_performance_snapshots_history_idx ON daily_performance_snapshots(tenant_id,location_id,snapshot_date DESC);

CREATE TABLE IF NOT EXISTS performance_alert_settings(
  tenant_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  notify_deterioration INTEGER NOT NULL DEFAULT 1,
  notify_improvement INTEGER NOT NULL DEFAULT 1,
  notify_reporting_gap INTEGER NOT NULL DEFAULT 1,
  notify_incidents INTEGER NOT NULL DEFAULT 1,
  notify_in_app INTEGER NOT NULL DEFAULT 1,
  notify_email INTEGER NOT NULL DEFAULT 0,
  coverage_drop_points REAL NOT NULL DEFAULT 20,
  metric_drop_percent REAL NOT NULL DEFAULT 30,
  improvement_percent REAL NOT NULL DEFAULT 25,
  incident_spike_count REAL NOT NULL DEFAULT 2,
  recurring_days INTEGER NOT NULL DEFAULT 3,
  min_baseline_days INTEGER NOT NULL DEFAULT 3,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS performance_learning_profiles(
  tenant_id TEXT NOT NULL,
  location_key TEXT NOT NULL DEFAULT '__all__',
  location_id TEXT,
  location_name TEXT NOT NULL DEFAULT 'All locations',
  sample_days INTEGER NOT NULL DEFAULT 0,
  baseline_7d_json TEXT NOT NULL DEFAULT '{}',
  baseline_30d_json TEXT NOT NULL DEFAULT '{}',
  recurring_themes_json TEXT NOT NULL DEFAULT '[]',
  feedback_context_json TEXT NOT NULL DEFAULT '{}',
  summary_memory_json TEXT NOT NULL DEFAULT '[]',
  learning_status TEXT NOT NULL DEFAULT 'learning' CHECK(learning_status IN ('learning','active','limited')),
  learned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,location_key),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(location_id) REFERENCES operating_locations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS performance_insights(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  insight_date TEXT NOT NULL,
  location_id TEXT,
  location_name TEXT NOT NULL DEFAULT 'All locations',
  signal_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('info','positive','warning','critical')),
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  current_json TEXT NOT NULL DEFAULT '{}',
  baseline_json TEXT NOT NULL DEFAULT '{}',
  ai_narrative_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved','dismissed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TEXT,
  resolved_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(location_id) REFERENCES operating_locations(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS performance_insights_dedupe_uq ON performance_insights(tenant_id,insight_date,COALESCE(location_id,''),signal_type);
CREATE INDEX IF NOT EXISTS performance_insights_open_idx ON performance_insights(tenant_id,status,insight_date DESC,severity);

CREATE TABLE IF NOT EXISTS performance_feedback(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  summary_id TEXT,
  insight_id TEXT,
  user_id TEXT NOT NULL,
  rating TEXT NOT NULL CHECK(rating IN ('useful','not_useful')),
  outcome TEXT CHECK(outcome IN ('watch','resolved','false_positive','actioned','other')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(summary_id) REFERENCES daily_operations_summaries(id) ON DELETE SET NULL,
  FOREIGN KEY(insight_id) REFERENCES performance_insights(id) ON DELETE SET NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS performance_feedback_tenant_idx ON performance_feedback(tenant_id,created_at DESC);
