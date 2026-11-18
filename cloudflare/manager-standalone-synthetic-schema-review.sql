-- MANAGER SYNTHETIC SCHEMA SOURCE ONLY; NEVER APPLY WITHOUT THUSICO REVIEW.
-- Source: read-only sqlite_master definitions from legacy synthetic D1 518a9e33-b2ba-4204-ac52-aae4150a7b52.
-- Destination after separate approval: new-account D1 1a2fc702-2592-491c-9f55-80e032a56dd8.
-- This file contains 13 CREATE TABLE and 13 CREATE INDEX statements; NO CUSTOMER DATA OR DML.
-- Execute only in new isolated account after exact-source and recovery approvals.

-- table: audit_events
CREATE TABLE audit_events(id INTEGER PRIMARY KEY AUTOINCREMENT,tenant_id TEXT NOT NULL,actor_user_id TEXT,event_type TEXT NOT NULL,entity_type TEXT,entity_id TEXT,event_data TEXT NOT NULL DEFAULT '{}',occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

-- table: auth_rate_limits
CREATE TABLE auth_rate_limits(key_hash TEXT PRIMARY KEY,scope TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 0 CHECK(count >= 0),window_start INTEGER NOT NULL,expires_at TEXT NOT NULL);

-- table: daily_employee_reports
CREATE TABLE daily_employee_reports(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,employee_id TEXT NOT NULL,location_id TEXT NOT NULL,report_date TEXT NOT NULL,work_summary TEXT NOT NULL DEFAULT '',wins TEXT NOT NULL DEFAULT '',blockers TEXT NOT NULL DEFAULT '',incidents TEXT NOT NULL DEFAULT '',next_plan TEXT NOT NULL DEFAULT '',kpi_json TEXT NOT NULL DEFAULT '{}',needs_attention INTEGER NOT NULL DEFAULT 0,source TEXT NOT NULL DEFAULT 'employee_link' CHECK(source IN ('employee_link','manager_entry','import')),revision_count INTEGER NOT NULL DEFAULT 0,submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE,FOREIGN KEY(location_id) REFERENCES operating_locations(id) ON DELETE CASCADE,UNIQUE(tenant_id,employee_id,location_id,report_date));

-- table: employees
CREATE TABLE employees(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,full_name TEXT NOT NULL,role_title TEXT,employment_type TEXT,start_date TEXT,end_date TEXT,status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE);

-- table: memberships
CREATE TABLE memberships(tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','manager','reviewer','auditor')),status TEXT NOT NULL DEFAULT 'active',PRIMARY KEY(tenant_id,user_id),FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(user_id) REFERENCES users(id));

-- table: operating_locations
CREATE TABLE operating_locations(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT NOT NULL,code TEXT,town TEXT,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE);

-- table: sessions
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,public_id TEXT UNIQUE,user_id TEXT NOT NULL,tenant_id TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','manager','reviewer','auditor')),session_generation INTEGER NOT NULL DEFAULT 0,csrf_token TEXT,expires_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_seen_at TEXT,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE);

-- table: tenants
CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT NOT NULL);

-- table: users
CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,display_name TEXT,password_hash TEXT,onboarding_complete INTEGER NOT NULL DEFAULT 0,session_generation INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

-- table: workspace_manager_access_requests
CREATE TABLE workspace_manager_access_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  requester_user_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '' CHECK(length(reason)<=500),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved_for_provisioning','provisioned','rejected')),
  reviewed_by_user_id TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(requester_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewed_by_user_id) REFERENCES users(id),
  FOREIGN KEY(location_id) REFERENCES operating_locations(id)
);

-- table: workspace_manager_invites
CREATE TABLE workspace_manager_invites (id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,email TEXT NOT NULL COLLATE NOCASE,branch_name TEXT NOT NULL CHECK(branch_name IN ('Gaborone','Mahalapye','Palapye','Francistown','Maun')),token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),invited_by_user_id TEXT NOT NULL,accepted_by_user_id TEXT,expires_at TEXT NOT NULL,accepted_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,FOREIGN KEY(invited_by_user_id) REFERENCES users(id),FOREIGN KEY(accepted_by_user_id) REFERENCES users(id));

-- table: workspace_manager_location_grants
CREATE TABLE workspace_manager_location_grants(tenant_id TEXT NOT NULL,manager_user_id TEXT NOT NULL,location_id TEXT NOT NULL,granted_by_user_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,revoked_at TEXT,PRIMARY KEY(tenant_id,manager_user_id,location_id),FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,FOREIGN KEY(manager_user_id) REFERENCES users(id) ON DELETE CASCADE,FOREIGN KEY(location_id) REFERENCES operating_locations(id) ON DELETE CASCADE,FOREIGN KEY(granted_by_user_id) REFERENCES users(id));

-- table: workspace_manager_request_codes
CREATE TABLE workspace_manager_request_codes (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 location_id TEXT NOT NULL,
 code_hash TEXT NOT NULL UNIQUE CHECK(length(code_hash)=64),
 created_by_user_id TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 revoked_at TEXT,
 consumed_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 FOREIGN KEY(location_id) REFERENCES operating_locations(id),
 FOREIGN KEY(created_by_user_id) REFERENCES users(id)
);

-- index: auth_rate_limits_expiry_idx
CREATE INDEX auth_rate_limits_expiry_idx ON auth_rate_limits(expires_at);

-- index: auth_rate_limits_scope_expiry_idx
CREATE INDEX auth_rate_limits_scope_expiry_idx ON auth_rate_limits(scope,expires_at);

-- index: daily_employee_reports_employee_date_idx
CREATE INDEX daily_employee_reports_employee_date_idx ON daily_employee_reports(tenant_id,employee_id,report_date DESC);

-- index: daily_employee_reports_tenant_date_idx
CREATE INDEX daily_employee_reports_tenant_date_idx ON daily_employee_reports(tenant_id,report_date,location_id,submitted_at DESC);

-- index: employees_tenant_status_idx
CREATE INDEX employees_tenant_status_idx ON employees(tenant_id,status);

-- index: manager_access_one_pending_per_user_tenant
CREATE UNIQUE INDEX manager_access_one_pending_per_user_tenant
  ON workspace_manager_access_requests(tenant_id,requester_user_id) WHERE status='pending';

-- index: manager_access_requests_owner_queue
CREATE INDEX manager_access_requests_owner_queue
  ON workspace_manager_access_requests(tenant_id,status,created_at);

-- index: manager_request_codes_scope
CREATE INDEX manager_request_codes_scope
 ON workspace_manager_request_codes(tenant_id,location_id,expires_at);

-- index: operating_locations_by_tenant
CREATE INDEX operating_locations_by_tenant ON operating_locations(tenant_id,active,id);

-- index: sessions_user_idx
CREATE INDEX sessions_user_idx ON sessions(user_id,expires_at);

-- index: workspace_manager_invites_expiration
CREATE INDEX workspace_manager_invites_expiration ON workspace_manager_invites(status,expires_at);

-- index: workspace_manager_invites_tenant_email
CREATE INDEX workspace_manager_invites_tenant_email ON workspace_manager_invites(tenant_id,email,status);

-- index: workspace_manager_location_grants_lookup
CREATE INDEX workspace_manager_location_grants_lookup ON workspace_manager_location_grants(tenant_id,manager_user_id,status,location_id);
