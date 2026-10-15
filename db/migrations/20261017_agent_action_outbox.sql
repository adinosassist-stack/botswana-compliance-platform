-- Durable execution intents only. Workers must remain disabled until an audited
-- idempotent executor and authenticated approval workflow are implemented.
create table if not exists agent_action_outbox (
  id uuid primary key,
  tenant_id text not null,
  actor_id text not null,
  action text not null,
  argument_digest char(64) not null,
  authorization_id uuid not null,
  idempotency_key text not null,
  status text not null default 'pending'
    check (status in ('pending','leased','succeeded','failed','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  leased_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key),
  unique (authorization_id)
);
create index if not exists agent_action_outbox_ready_idx
  on agent_action_outbox(available_at, created_at)
  where status = 'pending';
create index if not exists agent_action_outbox_tenant_idx
  on agent_action_outbox(tenant_id, created_at desc);
