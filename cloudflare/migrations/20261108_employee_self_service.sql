-- Employee self-service foundation. Additive and inert until THEBE_STAFF_PORTAL_ENABLED is reviewed and enabled.
-- Dedicated staff identity: NEVER reuse company workspace membership roles.
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS employee_portal_accounts(
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
 email TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,employee_id),
 UNIQUE(tenant_id,email)
);
CREATE INDEX IF NOT EXISTS employee_portal_accounts_employee_idx ON employee_portal_accounts(tenant_id,employee_id,status);

CREATE TABLE IF NOT EXISTS employee_portal_invites(
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
 email TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','used','revoked')),
 expires_at TEXT NOT NULL,
 used_at TEXT,
 consumed_nonce TEXT,
 issued_by_user_id TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS employee_portal_invites_employee_idx ON employee_portal_invites(tenant_id,employee_id,status);

CREATE TABLE IF NOT EXISTS employee_portal_sessions(
 token_hash TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES employee_portal_accounts(id) ON DELETE CASCADE,
 csrf_token TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS employee_portal_sessions_account_idx ON employee_portal_sessions(account_id,expires_at);

CREATE TABLE IF NOT EXISTS employee_portal_tasks(
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 160),
 detail TEXT NOT NULL DEFAULT '' CHECK(length(detail)<=1500),
 due_date TEXT,
 priority INTEGER NOT NULL DEFAULT 2 CHECK(priority BETWEEN 1 AND 3),
 status TEXT NOT NULL DEFAULT 'assigned' CHECK(status IN ('assigned','in_progress','submitted','completed')),
 version INTEGER NOT NULL DEFAULT 0,
 assigned_by_user_id TEXT NOT NULL REFERENCES users(id),
 reviewed_by_user_id TEXT REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS employee_portal_tasks_assignee_idx ON employee_portal_tasks(tenant_id,employee_id,status,due_date);
CREATE INDEX IF NOT EXISTS employee_portal_tasks_review_idx ON employee_portal_tasks(tenant_id,status,updated_at);

CREATE TABLE IF NOT EXISTS employee_portal_task_events(
 id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL REFERENCES employee_portal_tasks(id) ON DELETE CASCADE,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 actor_kind TEXT NOT NULL CHECK(actor_kind IN ('employee','manager')),
 actor_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('assign','start','submit','approve','return')),
 previous_status TEXT,
 next_status TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=500),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS employee_portal_task_events_task_idx ON employee_portal_task_events(tenant_id,task_id,created_at);
