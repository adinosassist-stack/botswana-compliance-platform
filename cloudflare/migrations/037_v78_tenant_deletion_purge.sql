-- V78 1.21.52: verifiable tenant-data purge completion tombstones.
-- Stores no tenant name, email, user ID, raw tenant ID, evidence filename, or business data.
CREATE TABLE IF NOT EXISTS deletion_tombstones(
  request_id TEXT PRIMARY KEY,
  tenant_fingerprint TEXT NOT NULL UNIQUE,
  purge_version TEXT NOT NULL DEFAULT 'v1',
  evidence_records_purged INTEGER NOT NULL DEFAULT 0 CHECK(evidence_records_purged >= 0),
  evidence_objects_purged INTEGER NOT NULL DEFAULT 0 CHECK(evidence_objects_purged >= 0),
  orphan_users_purged INTEGER NOT NULL DEFAULT 0 CHECK(orphan_users_purged >= 0),
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS deletion_tombstones_completed_idx ON deletion_tombstones(completed_at);
