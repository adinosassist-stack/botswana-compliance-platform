-- Offline candidate for a NEW isolated Dock staging database only.
-- No production migration, no existing D1 mutation. Not a complete workspace schema.
PRAGMA foreign_keys=ON;
CREATE TABLE tenants (
 id TEXT PRIMARY KEY CHECK(id LIKE 'dock-fixture-%'), name TEXT NOT NULL
);
CREATE TABLE users (
 id TEXT PRIMARY KEY CHECK(id LIKE 'dock-fixture-%'),
 email TEXT NOT NULL UNIQUE CHECK(email LIKE '%@%.invalid'),
 display_name TEXT NOT NULL,
 onboarding_complete INTEGER NOT NULL DEFAULT 1 CHECK(onboarding_complete IN (0,1)),
 session_generation INTEGER NOT NULL DEFAULT 0 CHECK(session_generation>=0)
);
CREATE TABLE memberships (
 tenant_id TEXT NOT NULL REFERENCES tenants(id), user_id TEXT NOT NULL REFERENCES users(id),
 role TEXT NOT NULL CHECK(role IN ('owner','manager','reviewer','auditor')),
 status TEXT NOT NULL CHECK(status IN ('active','inactive')),
 PRIMARY KEY(user_id,tenant_id)
);
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY CHECK(length(token_hash)=64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
 public_id TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, tenant_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','manager','reviewer','auditor')),
 csrf_token TEXT NOT NULL CHECK(length(csrf_token)=64 AND csrf_token NOT GLOB '*[^0-9a-f]*'),
 session_generation INTEGER NOT NULL CHECK(session_generation>=0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expires_at TEXT NOT NULL CHECK(expires_at>created_at AND expires_at<=datetime(created_at,'+15 minutes')),
 FOREIGN KEY(user_id,tenant_id) REFERENCES memberships(user_id,tenant_id)
);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE app_state (
 tenant_id TEXT PRIMARY KEY REFERENCES tenants(id), version INTEGER NOT NULL CHECK(version>=1),
 state_json TEXT NOT NULL CHECK(json_valid(state_json)), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Independently verified staging database identity marker; no default seed.
CREATE TABLE dock_staging_identity (id INTEGER PRIMARY KEY CHECK(id=1), database_id TEXT NOT NULL UNIQUE, environment TEXT NOT NULL CHECK(environment='dock-hosted-staging'));
