-- Isolated General AI staging-only auth schema. Never migrate production.
PRAGMA foreign_keys=ON;
CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,session_generation INTEGER NOT NULL DEFAULT 0);
CREATE TABLE memberships(user_id TEXT NOT NULL REFERENCES users(id),tenant_id TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','manager','reviewer','auditor')),status TEXT NOT NULL CHECK(status IN ('active','inactive')),PRIMARY KEY(user_id,tenant_id));
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),tenant_id TEXT NOT NULL,csrf_token TEXT NOT NULL,session_generation INTEGER NOT NULL,expires_at TEXT NOT NULL,FOREIGN KEY(user_id,tenant_id) REFERENCES memberships(user_id,tenant_id));
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
