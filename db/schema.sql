create extension if not exists pgcrypto;
create table if not exists tenants(id uuid primary key default gen_random_uuid(),name text not null,created_at timestamptz not null default now());
create table if not exists users(id uuid primary key default gen_random_uuid(),email text not null unique,password_salt text,password_hash text,display_name text,onboarding_complete boolean not null default false,password_reset_version integer not null default 0,session_generation integer not null default 0,created_at timestamptz not null default now());
create table if not exists memberships(tenant_id uuid not null references tenants(id) on delete cascade,user_id uuid not null references users(id) on delete cascade,role text not null check(role in('owner','manager','reviewer','auditor')),status text not null default 'active',primary key(tenant_id,user_id));
create table if not exists sessions(id uuid primary key default gen_random_uuid(),token_hash text not null unique,user_id uuid not null references users(id) on delete cascade,tenant_id uuid not null references tenants(id) on delete cascade,session_generation integer not null default 0,csrf_token text not null,expires_at timestamptz not null,revoked_at timestamptz,last_seen_at timestamptz,created_at timestamptz not null default now());
create index if not exists sessions_token_idx on sessions(token_hash);
create table if not exists app_state(tenant_id uuid primary key references tenants(id) on delete cascade,state jsonb not null default '{}'::jsonb,updated_at timestamptz not null default now(),version integer not null default 1);
create table if not exists rule_versions(id uuid primary key default gen_random_uuid(),rule_key text not null,jurisdiction text not null default 'BW',version text not null,status text not null check(status in('draft','review','published','blocked','retired')),effective_from date,effective_to date,source_url text not null,source_hash text,rule_json jsonb not null,reviewed_by uuid references users(id),reviewed_at timestamptz,created_at timestamptz not null default now(),unique(rule_key,version));
create table if not exists evidence(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references tenants(id) on delete cascade,company_id_text text not null,category text not null,display_name text not null,object_key text,review_date date,upload_status text not null default 'metadata_only' check(upload_status in('metadata_only','pending','uploaded','failed')),uploaded_at timestamptz,expected_size bigint,content_type text,scan_status text not null default 'not_scanned' check(scan_status in('not_scanned','pending','clean','infected','error')),scan_sha256 text,scan_details text,scanned_at timestamptz,scan_job_id uuid,scan_job_consumed_at timestamptz,verified boolean not null default false,verified_by uuid references users(id),verified_at timestamptz,created_at timestamptz not null default now());
create index if not exists evidence_tenant_company_idx on evidence(tenant_id,company_id_text);
create table if not exists audit_events(seq bigserial primary key,id uuid not null default gen_random_uuid(),tenant_id uuid not null references tenants(id) on delete cascade,actor_user_id uuid references users(id),event_type text not null,entity_type text,entity_id_text text,request_id uuid,event_data jsonb not null default '{}'::jsonb,occurred_at timestamptz not null default now());
create index if not exists audit_tenant_time_idx on audit_events(tenant_id,occurred_at desc);

create table if not exists subscriptions(tenant_id uuid primary key references tenants(id) on delete cascade,status text not null check(status in('trialing','active','past_due','paused','canceled','expired')),trial_ends_at timestamptz,current_period_ends_at timestamptz,provider text,provider_customer_id text,provider_subscription_id text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
-- Node/Postgres lineage: tenant/user identities are UUIDs. Decision IDs remain opaque text.
CREATE TABLE IF NOT EXISTS management_rereview_queue(
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL,
  decision_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('obligation','company_action','hr_case','tender_review')),
  source_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','claimed','resolved','superseded')),
  reason TEXT NOT NULL,
  changed_json TEXT NOT NULL DEFAULT '[]',
  reviewer_user_id UUID,
  response_due_at TEXT NOT NULL,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at TEXT,
  resolved_at TEXT,
  resolved_by_decision_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewer_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(tenant_id,decision_id)
);
CREATE INDEX IF NOT EXISTS management_rereview_queue_status_idx ON management_rereview_queue(tenant_id,status,response_due_at);
CREATE INDEX IF NOT EXISTS management_rereview_queue_reviewer_idx ON management_rereview_queue(tenant_id,reviewer_user_id,status,response_due_at);

-- V78 1.21.52: minimal non-PII proof that a tenant purge completed.
create table if not exists deletion_tombstones(
  request_id uuid primary key,
  tenant_fingerprint text not null unique,
  purge_version text not null default 'v1',
  evidence_records_purged integer not null default 0 check(evidence_records_purged>=0),
  orphan_users_purged integer not null default 0 check(orphan_users_purged>=0),
  completed_at timestamptz not null default now()
);
create index if not exists deletion_tombstones_completed_idx on deletion_tombstones(completed_at);

-- V78 1.21.75: durable Node/Postgres authentication brute-force limiter.
create table if not exists auth_rate_limits(
  scope text not null,
  key_hash text not null,
  window_start timestamptz not null default now(),
  attempts integer not null default 0 check(attempts>=0),
  updated_at timestamptz not null default now(),
  primary key(scope,key_hash)
);
create index if not exists auth_rate_limits_window_idx on auth_rate_limits(window_start);
