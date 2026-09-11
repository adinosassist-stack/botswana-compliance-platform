create table if not exists auth_rate_limits(
  scope text not null,
  key_hash text not null,
  window_start timestamptz not null default now(),
  attempts integer not null default 0 check(attempts>=0),
  updated_at timestamptz not null default now(),
  primary key(scope,key_hash)
);
create index if not exists auth_rate_limits_window_idx on auth_rate_limits(window_start);
