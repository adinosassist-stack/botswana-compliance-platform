-- Issue #2578: isolated synthetic manager staging ONLY.
-- Canonical DDL from cloudflare/schema.sql for auth_rate_limits.
-- Required for canonical /api/auth/login rate-limit before password check.
-- Apply only to bw-manager-invitations-synthetic-staging after identity/bookmark
-- preflight; never to bw-compliance-os or any production D1.
-- No users, tenant data, credentials, invitations or login attempts inserted.
CREATE TABLE IF NOT EXISTS auth_rate_limits(
  key_hash TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK(count >= 0),
  window_start INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_rate_limits_expiry_idx ON auth_rate_limits(expires_at);
CREATE INDEX IF NOT EXISTS auth_rate_limits_scope_expiry_idx ON auth_rate_limits(scope,expires_at);
