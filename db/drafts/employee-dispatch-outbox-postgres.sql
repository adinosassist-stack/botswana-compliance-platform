-- DESIGN-ONLY EMPLOYEE DISPATCH OUTBOX. NOT A PRODUCTION MIGRATION.
-- Apply only after employee-dispatch-proposal-review-postgres.sql to disposable CI.
-- No worker, lease lifecycle, side effects, authorization role mapping or RLS.
create table employee_dispatch_intents (
  id uuid primary key,
  tenant_id text not null,
  proposal_id text not null,
  review_id text not null,
  action text not null check (action in ('internal.task.create','internal.report.draft')),
  intent_type text not null check (intent_type in ('task','report')),
  idempotency_key text not null check (length(idempotency_key) between 1 and 200),
  state text not null default 'pending' check (state = 'pending'),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, proposal_id)
    references employee_dispatch_proposal_heads (tenant_id, proposal_id),
  foreign key (tenant_id, review_id)
    references employee_dispatch_proposal_reviews (tenant_id, review_id),
  check ((action = 'internal.task.create' and intent_type = 'task') or
         (action = 'internal.report.draft' and intent_type = 'report'))
);
create index employee_dispatch_intents_tenant_proposal_idx
  on employee_dispatch_intents (tenant_id, proposal_id, created_at desc);

-- An intent cannot be inserted for another proposal's review, a superseded
-- review, a revoked head, or a stale revision. Lock the proposal head so a
-- concurrent revocation or revision update cannot race the insert.
-- Reviewer role/permission checks remain a separate trusted admission blocker.
create function employee_dispatch_guard_intent_insert()
returns trigger language plpgsql as $employee_dispatch$
declare
  allowed boolean;
begin
  select true into allowed
    from employee_dispatch_proposal_heads h
    join employee_dispatch_proposal_versions v
      on v.tenant_id=h.tenant_id and v.proposal_id=h.proposal_id
     and v.revision=h.current_revision
    join employee_dispatch_proposal_reviews r
      on r.tenant_id=h.tenant_id and r.proposal_id=h.proposal_id
     and r.proposal_revision=h.current_revision
   where h.tenant_id=new.tenant_id and h.proposal_id=new.proposal_id
     and h.revoked=false and r.review_id=new.review_id
     and r.review_sequence=h.last_review_sequence
     and r.decision='approved' and r.reviewer_id<>v.author_id
     and new.action=v.action
   for update of h;
  if allowed is distinct from true then
    raise exception 'employee_dispatch_approval_not_current' using errcode='23514';
  end if;
  return new;
end;
$employee_dispatch$;
create trigger employee_dispatch_intent_admission
  before insert on employee_dispatch_intents
  for each row execute function employee_dispatch_guard_intent_insert();

-- No worker implementation is authorized, so draft intents are immutable.
create function employee_dispatch_reject_intent_mutation()
returns trigger language plpgsql as $employee_dispatch$
begin
  raise exception 'employee_dispatch_intent_immutable' using errcode='23514';
end;
$employee_dispatch$;
create trigger employee_dispatch_intent_immutable
  before update or delete on employee_dispatch_intents
  for each row execute function employee_dispatch_reject_intent_mutation();

-- Admission audit belongs to the SAME PostgreSQL transaction as intent insert.
-- Tenant-qualified FK ensures an audit cannot reference another tenant's intent.
create table employee_dispatch_admission_audit (
  id uuid primary key,
  tenant_id text not null,
  intent_id uuid not null,
  actor_id text not null,
  event_type text not null check (event_type='employee.dispatch.admitted'),
  created boolean not null,
  recorded_at timestamptz not null default now(),
  foreign key (tenant_id, intent_id)
    references employee_dispatch_intents (tenant_id, id)
);
create index employee_dispatch_admission_audit_tenant_idx
  on employee_dispatch_admission_audit (tenant_id, intent_id, recorded_at);

create function employee_dispatch_reject_admission_audit_mutation()
returns trigger language plpgsql as $employee_dispatch$
begin
  raise exception 'employee_dispatch_admission_audit_immutable' using errcode='23514';
end;
$employee_dispatch$;
create trigger employee_dispatch_admission_audit_immutable
  before update or delete on employee_dispatch_admission_audit
  for each row execute function employee_dispatch_reject_admission_audit_mutation();

-- Not release ready: reviewer role binding, canonical identity, write privileges,
-- RLS/tenant session scoping, migration/rollback, worker lease fencing,
-- effect idempotency and operator activation must be independently verified.
