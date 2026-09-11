-- V78 1.21.52: verifiable tenant purge completion tombstones for the optional Node/Postgres profile.
-- No tenant/user PII or raw tenant identifier is retained.
create table if not exists deletion_tombstones(
  request_id uuid primary key,
  tenant_fingerprint text not null unique,
  purge_version text not null default 'v1',
  evidence_records_purged integer not null default 0 check(evidence_records_purged>=0),
  orphan_users_purged integer not null default 0 check(orphan_users_purged>=0),
  completed_at timestamptz not null default now()
);
create index if not exists deletion_tombstones_completed_idx on deletion_tombstones(completed_at);
