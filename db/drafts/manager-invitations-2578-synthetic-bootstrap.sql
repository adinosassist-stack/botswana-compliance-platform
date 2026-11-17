-- #2578: ISOLATED SYNTHETIC STAGING ONLY. UNAPPLIED DRAFT.
-- Do not run against bw-compliance-os or any production D1.
-- Read-only preflight on 2026-11-17 showed dedicated staging D1 lacked
-- sessions, operating_locations and workspace_manager_location_grants.
-- D1 Worker-bound application tests require these tables with appropriate
-- indexes and foreign keys. Does not insert users, secrets, grants or sessions.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS sessions(
 token_hash TEXT PRIMARY KEY,
 public_id TEXT UNIQUE,
 user_id TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','manager','reviewer','auditor')),
 session_generation INTEGER NOT NULL DEFAULT 0,
 csrf_token TEXT,
 expires_at TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_seen_at TEXT,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id,expires_at);
CREATE TABLE IF NOT EXISTS operating_locations(
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 name TEXT NOT NULL,
 code TEXT,
 town TEXT,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS operating_locations_by_tenant ON operating_locations(tenant_id,active,id);
-- Apply the independently reviewed
-- db/drafts/manager-invitations-2578-location-grants.sql
-- in the *same isolated synthetic DB* only, after exact schema review.
-- DO NOT create the staging Worker, enable ingress, or insert synthetic
-- credentials under this draft alone. Separate authorization required.
