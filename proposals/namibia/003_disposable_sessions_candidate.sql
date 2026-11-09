-- Disposable Namibia INTERNAL session test fixture only. Never in migrations.
-- No real accounts, email addresses, secrets, tokens or live customers allowed.
-- Physical D1: na-sessions-disposable-20261107, NOT Botswana auth DB.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY CHECK(id GLOB 'synthetic-*'),
 email TEXT NOT NULL UNIQUE CHECK(email LIKE '%@example.test'),
 session_generation INTEGER NOT NULL DEFAULT 1 CHECK(session_generation BETWEEN 1 AND 1000000)
);
CREATE TABLE IF NOT EXISTS memberships (
 user_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL CHECK(tenant_id GLOB 'synthetic-*'),
 role TEXT NOT NULL CHECK(role IN ('owner','manager','reviewer','auditor')),
 status TEXT NOT NULL CHECK(status IN ('active','suspended')),
 PRIMARY KEY(user_id,tenant_id),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY CHECK(length(token_hash)=64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
 user_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL CHECK(tenant_id GLOB 'synthetic-*'),
 csrf_token TEXT NOT NULL CHECK(length(csrf_token) BETWEEN 12 AND 160),
 session_generation INTEGER NOT NULL CHECK(session_generation>=1),
 expires_at TEXT NOT NULL,
 FOREIGN KEY(user_id,tenant_id) REFERENCES memberships(user_id,tenant_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS na_sessions_tenant_expiry_idx
 ON sessions(tenant_id,expires_at);
-- Deliberate lack of account-creation/consumer login paths. Synthetic sessions for tests only.
