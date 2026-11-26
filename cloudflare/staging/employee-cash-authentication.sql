-- Private Employee Cash acceptance database only.
-- Apply only after verifying the isolated employee staging identity marker.
PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN session_generation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN onboarding_complete INTEGER NOT NULL DEFAULT 0;

CREATE TABLE memberships (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role = 'manager'),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  PRIMARY KEY (user_id, tenant_id)
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role = 'manager'),
  session_generation INTEGER NOT NULL,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id, tenant_id) REFERENCES memberships(user_id, tenant_id) ON DELETE CASCADE
);

CREATE TABLE auth_rate_limits (
  key_hash TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  window_start INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);
