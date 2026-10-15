-- Agent authorization persistence. No autonomous execution is enabled by this migration.
create table if not exists agent_action_approvals (
  id uuid primary key,
  tenant_id text not null,
  actor_id text not null,
  action text not null,
  argument_digest char(64) not null,
  nonce text not null,
  status text not null check (status in ('pending','approved','rejected','expired')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists agent_approvals_tenant_status_idx on agent_action_approvals(tenant_id,status,expires_at);
create table if not exists agent_action_audit (
  id uuid primary key,
  tenant_id text not null,
  actor_id text not null,
  action text not null,
  argument_digest char(64) not null,
  approval_id uuid,
  allowed boolean not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists agent_action_audit_tenant_time_idx on agent_action_audit(tenant_id,created_at desc);
