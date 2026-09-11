-- V78 1.21.68: session inventory activity parity.
alter table sessions add column if not exists last_seen_at timestamptz;
update sessions set last_seen_at=coalesce(last_seen_at,created_at) where last_seen_at is null;
create index if not exists sessions_user_generation_live_idx on sessions(user_id,session_generation,expires_at);
