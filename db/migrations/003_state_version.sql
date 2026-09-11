alter table app_state add column if not exists version bigint not null default 1;
create index if not exists app_state_updated_idx on app_state(updated_at desc);
