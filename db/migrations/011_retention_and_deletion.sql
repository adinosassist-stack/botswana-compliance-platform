
create table if not exists legal_holds(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  scope text not null default 'tenant',
  reason text not null,
  active boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  released_at timestamptz
);
create index if not exists legal_holds_tenant_active_idx on legal_holds(tenant_id,active);

create table if not exists deletion_requests(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'requested' check(status in ('requested','blocked','approved','completed','canceled')),
  reason text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  completed_at timestamptz
);
create index if not exists deletion_requests_tenant_idx on deletion_requests(tenant_id,requested_at desc);

alter table evidence add column if not exists deleted_at timestamptz;
alter table evidence add column if not exists retention_until timestamptz;
alter table evidence add column if not exists legal_hold boolean not null default false;
