
ALTER TABLE regulatory_sources ADD COLUMN submitted_by_user_id TEXT;
ALTER TABLE regulatory_sources ADD COLUMN approved_by_user_id TEXT;
ALTER TABLE regulatory_sources ADD COLUMN approved_at TEXT;
ALTER TABLE regulatory_sources ADD COLUMN content_hash TEXT;
ALTER TABLE regulatory_sources ADD COLUMN metadata_hash TEXT;
ALTER TABLE regulatory_sources ADD COLUMN latest_snapshot_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE regulatory_sources ADD COLUMN last_checked_at TEXT;
ALTER TABLE regulatory_sources ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'unverified'
  CHECK(verification_status IN ('unverified','verified','changed','unavailable'));
ALTER TABLE regulatory_rules ADD COLUMN created_by_user_id TEXT;
ALTER TABLE regulatory_rules ADD COLUMN approved_by_user_id TEXT;
ALTER TABLE regulatory_rules ADD COLUMN published_by_user_id TEXT;
ALTER TABLE regulatory_rules ADD COLUMN approved_at TEXT;
ALTER TABLE regulatory_rules ADD COLUMN published_at TEXT;
ALTER TABLE regulatory_rules ADD COLUMN definition_hash TEXT;
ALTER TABLE regulatory_rules ADD COLUMN supersedes_rule_id TEXT;
ALTER TABLE regulatory_rollout_runs ADD COLUMN cursor_tenant_id TEXT;
ALTER TABLE regulatory_rollout_runs ADD COLUMN tenants_failed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE regulatory_rollout_runs ADD COLUMN next_run_at TEXT;
CREATE TABLE IF NOT EXISTS regulatory_source_snapshots(
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL, version INTEGER NOT NULL, content_hash TEXT NOT NULL, metadata_hash TEXT NOT NULL,
  content_excerpt TEXT, object_key TEXT, captured_by_user_id TEXT NOT NULL, captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(source_id) REFERENCES regulatory_sources(id) ON DELETE CASCADE, UNIQUE(source_id,version));
CREATE INDEX IF NOT EXISTS regulatory_source_snapshots_source_idx ON regulatory_source_snapshots(source_id,version DESC);
CREATE TABLE IF NOT EXISTS regulatory_conflict_sources(
  conflict_id TEXT NOT NULL, source_id TEXT NOT NULL, PRIMARY KEY(conflict_id,source_id),
  FOREIGN KEY(conflict_id) REFERENCES regulatory_conflicts(id) ON DELETE CASCADE, FOREIGN KEY(source_id) REFERENCES regulatory_sources(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS regulatory_conflict_sources_source_idx ON regulatory_conflict_sources(source_id,conflict_id);
CREATE TABLE IF NOT EXISTS regulatory_rollout_failures(
  id TEXT PRIMARY KEY, rollout_id TEXT NOT NULL, tenant_id TEXT NOT NULL, error_message TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 1,
  last_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, resolved_at TEXT,
  FOREIGN KEY(rollout_id) REFERENCES regulatory_rollout_runs(id) ON DELETE CASCADE, FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE(rollout_id,tenant_id));
CREATE INDEX IF NOT EXISTS regulatory_rollout_failures_idx ON regulatory_rollout_failures(rollout_id,resolved_at,last_attempt_at DESC);
CREATE TABLE IF NOT EXISTS platform_regulatory_audit(
  id INTEGER PRIMARY KEY AUTOINCREMENT, actor_user_id TEXT NOT NULL, actor_email TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL,
  entity_id TEXT, event_data TEXT NOT NULL DEFAULT '{}', occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS platform_regulatory_audit_idx ON platform_regulatory_audit(occurred_at DESC,action);
CREATE TABLE IF NOT EXISTS regulatory_governance_state(state_key TEXT PRIMARY KEY,state_value TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS platform_regulatory_principals(
  user_id TEXT PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('editor','reviewer','admin')), active INTEGER NOT NULL DEFAULT 1,
  provisioned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS platform_regulatory_principals_role_idx ON platform_regulatory_principals(active,role,email);
ALTER TABLE compliance_obligations ADD COLUMN superseded_by_rule_id TEXT;
ALTER TABLE compliance_obligations ADD COLUMN superseded_at TEXT;
