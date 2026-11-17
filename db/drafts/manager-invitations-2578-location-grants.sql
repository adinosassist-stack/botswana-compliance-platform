-- #2578 candidate schema extension ONLY. Never apply without owner authorization.
-- Existing operating_locations is the authoritative branch/location record.
-- Label in workspace_manager_invites.branch_name is display metadata, NOT access.
CREATE TABLE IF NOT EXISTS workspace_manager_location_grants (
  tenant_id TEXT NOT NULL,
  manager_user_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  granted_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  PRIMARY KEY(tenant_id,manager_user_id,location_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(manager_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(location_id) REFERENCES operating_locations(id) ON DELETE CASCADE,
  FOREIGN KEY(granted_by_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS workspace_manager_location_grants_lookup
 ON workspace_manager_location_grants(tenant_id,manager_user_id,status,location_id);
-- Grant creation MUST check tenant-scoped active operating_locations AND
-- a fresh active owner membership in the same atomic D1 batch.
-- Business API queries MUST enforce these grants at row level on each read/write.
-- Do not use user-provided branch display strings as permissions.
