
ALTER TABLE audit_events ADD COLUMN tenant_seq INTEGER;
ALTER TABLE audit_events ADD COLUMN prev_hash TEXT;
ALTER TABLE audit_events ADD COLUMN event_hash TEXT;
ALTER TABLE audit_events ADD COLUMN integrity_version INTEGER;
ALTER TABLE audit_events ADD COLUMN write_source TEXT NOT NULL DEFAULT 'server';
CREATE UNIQUE INDEX IF NOT EXISTS audit_tenant_seq_unique
ON audit_events(tenant_id,tenant_seq) WHERE tenant_seq IS NOT NULL;

CREATE TABLE IF NOT EXISTS audit_chain_state(
  tenant_id TEXT PRIMARY KEY,
  last_event_id INTEGER,
  last_hash TEXT,
  event_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_write_failures(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  actor_user_id TEXT,
  event_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  event_data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS audit_write_failures_tenant_idx
ON audit_write_failures(tenant_id,resolved_at,created_at DESC);

CREATE TABLE IF NOT EXISTS audit_integrity_checks(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK(status IN ('valid','invalid','empty','legacy_unsealed')),
  checked_events INTEGER NOT NULL DEFAULT 0,
  legacy_events INTEGER NOT NULL DEFAULT 0,
  first_invalid_seq INTEGER,
  details_json TEXT NOT NULL DEFAULT '{}',
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS audit_integrity_checks_tenant_idx
ON audit_integrity_checks(tenant_id,checked_at DESC);

CREATE TABLE IF NOT EXISTS control_lineage_snapshots(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  control_key TEXT NOT NULL,
  status TEXT NOT NULL,
  assurance_level TEXT NOT NULL,
  assurance_freshness TEXT NOT NULL,
  snapshot_seq INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  prev_snapshot_hash TEXT,
  snapshot_hash TEXT NOT NULL,
  lineage_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(control_key) REFERENCES control_library(control_key) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS control_lineage_snapshots_idx
ON control_lineage_snapshots(tenant_id,control_key,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS control_lineage_snapshot_seq_unique
ON control_lineage_snapshots(tenant_id,control_key,snapshot_seq);

CREATE TABLE IF NOT EXISTS control_lineage_state(
  tenant_id TEXT NOT NULL,
  control_key TEXT NOT NULL,
  last_snapshot_id TEXT,
  last_content_hash TEXT,
  last_snapshot_hash TEXT,
  snapshot_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,control_key),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(control_key) REFERENCES control_library(control_key) ON DELETE CASCADE
);

INSERT OR REPLACE INTO plan_entitlements(plan,feature_key,enabled,limit_value) VALUES
 ('starter','control_lineage',0,NULL),
 ('business','control_lineage',1,NULL),
 ('pro','control_lineage',1,NULL),
 ('partner','control_lineage',1,NULL);
