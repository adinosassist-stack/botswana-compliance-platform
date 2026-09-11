create table if not exists subscriptions (
 tenant_id uuid primary key references tenants(id) on delete cascade,
 status text not null check(status in('trialing','active','past_due','paused','canceled','expired')),
 trial_ends_at timestamptz,
 current_period_ends_at timestamptz,
 provider text, provider_customer_id text, provider_subscription_id text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists subscriptions_status_idx on subscriptions(status);
