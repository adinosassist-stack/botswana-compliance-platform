create table if not exists external_identities (
  provider text not null,
  provider_user_id text not null,
  user_id uuid not null references users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, provider_user_id)
);
create index if not exists external_identities_user_idx on external_identities(user_id);
