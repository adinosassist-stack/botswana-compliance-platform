-- THEBE EMPLOYEE DISPATCH WORKER RECOVERY — DESIGN / CI ONLY.
-- NOT A PRODUCTION MIGRATION; NO EXECUTION ADAPTER OR WORKER STARTUP.
-- Requires proposal/review, outbox and admission audit drafts loaded first.
-- The "qualified" state means simulated worker preflight only. Never claim
-- that a task, report, notification or external effect was actually executed.
create table employee_dispatch_worker_claims (
  tenant_id text not null,
  intent_id uuid not null,
  state text not null default 'pending'
    check (state in ('pending','leased','qualified','dead_letter')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  max_attempts integer not null default 3 check (max_attempts between 1 and 3),
  lease_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id,intent_id),
  foreign key (tenant_id,intent_id)
    references employee_dispatch_intents (tenant_id,id),
  check (attempts <= max_attempts),
  check ((state='leased' and lease_token is not null and lease_expires_at is not null)
         or (state<>'leased' and lease_token is null and lease_expires_at is null))
);
create index employee_dispatch_worker_claim_ready_idx
  on employee_dispatch_worker_claims (tenant_id,state,next_attempt_at)
  where state in ('pending','leased');

-- Populate only from newly inserted immutable admission intents. The deferred
-- creation-audit constraint on intents still prevents an unaudited commit.
create function employee_dispatch_seed_worker_claim()
returns trigger language plpgsql as $employee_worker$
begin
  insert into employee_dispatch_worker_claims(tenant_id,intent_id)
  values (new.tenant_id,new.id);
  return new;
end;
$employee_worker$;
create trigger employee_dispatch_worker_claim_seed
  after insert on employee_dispatch_intents
  for each row execute function employee_dispatch_seed_worker_claim();

create table employee_dispatch_worker_events (
  event_id uuid primary key,
  tenant_id text not null,
  intent_id uuid not null,
  attempt integer not null check (attempt between 1 and 3),
  lease_token uuid not null,
  event_type text not null
    check (event_type in ('claimed','retried','dead_lettered','qualified')),
  recorded_at timestamptz not null default now(),
  foreign key (tenant_id,intent_id)
    references employee_dispatch_worker_claims(tenant_id,intent_id)
);
create index employee_dispatch_worker_events_intent_idx
  on employee_dispatch_worker_events(tenant_id,intent_id,recorded_at);

-- Once an event has been recorded, it must not be rewritten or erased.
create function employee_dispatch_reject_worker_event_mutation()
returns trigger language plpgsql as $employee_worker$
begin
  raise exception 'employee_worker_event_immutable' using errcode='23514';
end;
$employee_worker$;
create trigger employee_dispatch_worker_event_immutable
  before update or delete on employee_dispatch_worker_events
  for each row execute function employee_dispatch_reject_worker_event_mutation();

-- A worker claim must be paired with a recorded immutable claim event in the
-- SAME database transaction. The operator never relies on timestamps alone.
create function employee_dispatch_require_worker_claim_event()
returns trigger language plpgsql as $employee_worker$
begin
  if not exists (
    select 1 from employee_dispatch_worker_events e
     where e.tenant_id=new.tenant_id and e.intent_id=new.intent_id
       and e.attempt=new.attempts and e.lease_token=new.lease_token
       and e.event_type='claimed'
  ) then
    raise exception 'employee_worker_claim_audit_required' using errcode='23514';
  end if;
  return null;
end;
$employee_worker$;
create constraint trigger employee_dispatch_worker_claim_audit_required
  after update on employee_dispatch_worker_claims
  deferrable initially deferred
  for each row
  when (new.state='leased' and old.state<>'leased' or
        (new.state='leased' and old.lease_token is distinct from new.lease_token))
  execute function employee_dispatch_require_worker_claim_event();

-- This CI model is NEVER a production role design. RLS defaults to deny.
alter table employee_dispatch_worker_claims enable row level security;
alter table employee_dispatch_worker_events enable row level security;
revoke all on employee_dispatch_worker_claims,
  employee_dispatch_worker_events from public;
revoke all on function
  employee_dispatch_seed_worker_claim(),
  employee_dispatch_reject_worker_event_mutation(),
  employee_dispatch_require_worker_claim_event()
from public;

-- Explicitly NO GRANT SELECT/INSERT/UPDATE/DELETE for the preview or tenant
-- roles. Their existing RLS policies do not extend to these new tables.
-- BLOCKERS: trusted admission adapter; DB-writer provenance/least privilege;
-- reauth at effect COMMIT; atomic internal effects and lease completion;
-- crash recovery and runbook; external effect idempotency; feature approval.
