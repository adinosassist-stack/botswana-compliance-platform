-- V78 1.21.67: generation-based session revocation for the Node/Postgres fallback.
alter table users add column if not exists session_generation integer not null default 0;
alter table sessions add column if not exists session_generation integer not null default 0;
create index if not exists sessions_user_generation_idx on sessions(user_id,session_generation,expires_at);
