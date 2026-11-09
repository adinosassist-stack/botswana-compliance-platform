-- Thebe Life D1 SQLite schema PROPOSAL ONLY. Not a deployed migration.
-- D1 has no PostgreSQL row-level security. Every query MUST enforce session
-- identity and household/group membership server-side with scoped predicates.
-- DO NOT run on production. Review existing migrations, backups and rollback.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS life_households (
 id TEXT PRIMARY KEY NOT NULL,
 display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 160),
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS life_household_members (
 household_id TEXT NOT NULL REFERENCES life_households(id),
 user_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','adult','viewer')),
 status TEXT NOT NULL CHECK(status IN ('invited','active','revoked')),
 PRIMARY KEY(household_id,user_id)
);
CREATE TABLE IF NOT EXISTS life_household_entries (
 household_id TEXT NOT NULL REFERENCES life_households(id),
 id TEXT NOT NULL,
 type TEXT NOT NULL CHECK(type IN ('income','expense','commitment','transfer_in','transfer_out')),
 category TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(amount_minor BETWEEN 0 AND 9007199254740991),
 currency TEXT NOT NULL DEFAULT 'BWP' CHECK(currency='BWP'),
 occurred_on TEXT NOT NULL CHECK(length(occurred_on)=10),
 transfer_id TEXT,
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(household_id,id),
 CHECK(type NOT IN ('transfer_in','transfer_out') OR transfer_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS life_household_entries_recent
 ON life_household_entries(household_id,occurred_on DESC,id DESC);
CREATE TABLE IF NOT EXISTS life_motshelo_groups (
 id TEXT PRIMARY KEY NOT NULL,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
 model TEXT NOT NULL CHECK(model IN ('rotating','annual','lending','grocery','burial','property','investment')),
 created_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS life_motshelo_members (
 group_id TEXT NOT NULL REFERENCES life_motshelo_groups(id),
 user_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('chair','treasurer','secretary','member','auditor')),
 status TEXT NOT NULL CHECK(status IN ('invited','active','revoked')),
 PRIMARY KEY(group_id,user_id)
);
CREATE TABLE IF NOT EXISTS life_motshelo_contributions (
 group_id TEXT NOT NULL REFERENCES life_motshelo_groups(id),
 id TEXT NOT NULL,
 member_user_id TEXT NOT NULL,
 due_on TEXT NOT NULL,
 reported_minor INTEGER NOT NULL DEFAULT 0 CHECK(reported_minor >= 0),
 matched_minor INTEGER NOT NULL DEFAULT 0 CHECK(matched_minor >= 0),
 cleared_minor INTEGER NOT NULL DEFAULT 0 CHECK(cleared_minor >= 0),
 currency TEXT NOT NULL DEFAULT 'BWP' CHECK(currency='BWP'),
 CHECK(cleared_minor <= matched_minor AND matched_minor <= reported_minor),
 FOREIGN KEY(group_id,member_user_id) REFERENCES life_motshelo_members(group_id,user_id),
 PRIMARY KEY(group_id,id)
);
-- Intentionally excludes write triggers, insurance execution, payment rails,
-- customer route registration and schema migration deployment.
