-- #2599 follow-up: additive proposal for PRIVATE staging only.
-- Requires independent review, isolated D1 migration and runtime gating.
-- A request MUST NEVER grant a manager membership or branch permission.
CREATE TABLE IF NOT EXISTS workspace_manager_access_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  requester_user_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '' CHECK(length(reason)<=500),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved_for_provisioning','provisioned','rejected')),
  reviewed_by_user_id TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(requester_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewed_by_user_id) REFERENCES users(id),
  FOREIGN KEY(location_id) REFERENCES operating_locations(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS manager_access_one_pending_per_user_tenant
  ON workspace_manager_access_requests(tenant_id,requester_user_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS manager_access_requests_owner_queue
  ON workspace_manager_access_requests(tenant_id,status,created_at);
