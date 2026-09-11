-- V78 1.21.47: bounded public authentication abuse controls.
-- Stores only HMAC-derived bucket keys; raw IP addresses and email addresses are not persisted here.
CREATE TABLE IF NOT EXISTS auth_rate_limits(
  key_hash TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK(count >= 0),
  window_start INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_rate_limits_expiry_idx ON auth_rate_limits(expires_at);
CREATE INDEX IF NOT EXISTS auth_rate_limits_scope_expiry_idx ON auth_rate_limits(scope,expires_at);
