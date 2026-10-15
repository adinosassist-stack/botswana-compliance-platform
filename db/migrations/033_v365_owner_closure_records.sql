-- V365: dedicated owner-closure record schema foundation.
-- This migration adds storage constraints only. It adds no writer, route, UI trigger, or deployment activation.

create table if not exists owner_closure_records(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  workspace_id text not null,
  actor_user_id uuid not null,
  namespace text not null,
  kind text not null,
  source_key text not null,
  disposition text not null,
  wording text not null,
  residual_carryover jsonb not null default '[]'::jsonb,
  expected_target_version integer not null,
  authorization_token_id text not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  record_version integer not null default 1,
  recorded_at timestamptz not null default now(),

  constraint owner_closure_records_workspace_nonempty check(length(btrim(workspace_id)) > 0),
  constraint owner_closure_records_namespace_nonempty check(length(btrim(namespace)) > 0),
  constraint owner_closure_records_kind_nonempty check(length(btrim(kind)) > 0),
  constraint owner_closure_records_source_key_nonempty check(length(btrim(source_key)) > 0),
  constraint owner_closure_records_disposition_nonempty check(length(btrim(disposition)) > 0),
  constraint owner_closure_records_wording_nonempty check(length(btrim(wording)) > 0),
  constraint owner_closure_records_authorization_nonempty check(length(btrim(authorization_token_id)) > 0),
  constraint owner_closure_records_idempotency_nonempty check(length(btrim(idempotency_key)) > 0),
  constraint owner_closure_records_target_version_positive check(expected_target_version > 0),
  constraint owner_closure_records_record_version_one check(record_version = 1),
  constraint owner_closure_records_residual_array check(jsonb_typeof(residual_carryover) = 'array'),
  constraint owner_closure_records_fingerprint_sha256 check(request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint owner_closure_records_idempotency_unique unique(tenant_id,workspace_id,idempotency_key)
);

create index if not exists owner_closure_records_target_idx
  on owner_closure_records(tenant_id,workspace_id,namespace,kind,source_key,recorded_at desc);

create index if not exists owner_closure_records_tenant_time_idx
  on owner_closure_records(tenant_id,recorded_at desc);

-- Closure records are append-only with respect to in-place mutation. Tenant lifecycle deletion
-- remains governed by the existing tenant cascade/deletion process.
create or replace function reject_owner_closure_record_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'owner_closure_records_are_append_only' using errcode = '55000';
end;
$$;

drop trigger if exists owner_closure_records_reject_update on owner_closure_records;
create trigger owner_closure_records_reject_update
before update on owner_closure_records
for each row execute function reject_owner_closure_record_update();

comment on table owner_closure_records is
  'V365 immutable owner closure records. Schema foundation only; no production writer or route is enabled.';
comment on column owner_closure_records.actor_user_id is
  'Server-authoritative actor UUID captured durably; intentionally not a user FK so account deletion does not erase record provenance.';
comment on column owner_closure_records.request_fingerprint is
  'Lowercase SHA-256 over the canonical target, closure semantics, and server-authoritative actor binding.';
