-- Issue #2578: candidate ONLY; not in cloudflare/migrations, not applied.
-- Must be reviewed against the exact current D1 schema before promoting.
-- Invitations are distinct from employee self-service.
CREATE TABLE IF NOT EXISTS workspace_manager_invites (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  branch_name TEXT NOT NULL CHECK(branch_name IN ('Gaborone','Mahalapye','Palapye','Francistown','Maun')),
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),
  invited_by_user_id TEXT NOT NULL,
  accepted_by_user_id TEXT,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(invited_by_user_id) REFERENCES users(id),
  FOREIGN KEY(accepted_by_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS workspace_manager_invites_tenant_email
  ON workspace_manager_invites(tenant_id,email,status);
CREATE INDEX IF NOT EXISTS workspace_manager_invites_expiration
  ON workspace_manager_invites(status,expires_at);
-- No memberships are added by this migration.
-- Activation handler must atomically update invite pending->accepted, create or
-- associate a user with a password, and add an ACTIVE manager membership in the
-- same tenant. It MUST reject already-used, expired and revoked tokens.
-- Branch assignment alone does not enforce branch data access.
