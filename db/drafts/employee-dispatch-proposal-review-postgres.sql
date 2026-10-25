-- DESIGN DRAFT ONLY. NOT A MIGRATION. DO NOT APPLY TO PRODUCTION.
-- Requires independent review of canonical identity, permissions, RLS, backups,
-- deployment sequencing and the authoritative proposal/review write APIs.
create table employee_dispatch_proposal_versions (
  tenant_id text not null,
  proposal_id text not null,
  revision bigint not null check (revision > 0),
  author_id text not null,
  action text not null check (action in ('internal.task.create','internal.report.draft')),
  payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  primary key (tenant_id, proposal_id, revision)
);

-- The head row serializes all proposal revision and review decision writers.
-- Never update last_review_sequence outside the database review-insert trigger.
create table employee_dispatch_proposal_heads (
  tenant_id text not null,
  proposal_id text not null,
  current_revision bigint not null,
  revoked boolean not null default false,
  last_review_sequence bigint not null default 0
    check (last_review_sequence >= 0),
  primary key (tenant_id, proposal_id),
  foreign key (tenant_id, proposal_id, current_revision)
    references employee_dispatch_proposal_versions(tenant_id, proposal_id, revision)
);

-- DB-assigned sequence is authoritative for the order of review decisions.
-- reviewed_at remains display metadata, never an authorization ordering key.
create table employee_dispatch_proposal_reviews (
  tenant_id text not null,
  review_id text not null,
  proposal_id text not null,
  proposal_revision bigint not null,
  reviewer_id text not null,
  decision text not null check (decision in ('approved','rejected','revoked')),
  review_sequence bigint not null check (review_sequence > 0),
  reviewed_at timestamptz not null default now(),
  primary key (tenant_id, review_id),
  unique (tenant_id, proposal_id, review_sequence),
  foreign key (tenant_id, proposal_id, proposal_revision)
    references employee_dispatch_proposal_versions(tenant_id, proposal_id, revision)
);
create index employee_dispatch_review_latest_idx
  on employee_dispatch_proposal_reviews (tenant_id, proposal_id, review_sequence desc);

-- All review inserts acquire a write lock on the matching current proposal
-- head, serializing decisions and version/revocation updates. Rejected inserts
-- roll back their head-counter update within the same DB transaction.
create function employee_dispatch_assign_review_sequence()
returns trigger language plpgsql as $employee_review$
declare
  sequence_value bigint;
begin
  if new.review_sequence is not null then
    raise exception 'review_sequence_must_be_database_assigned' using errcode='23514';
  end if;

  update employee_dispatch_proposal_heads h
     set last_review_sequence = h.last_review_sequence + 1
    from employee_dispatch_proposal_versions v
   where h.tenant_id = new.tenant_id
     and h.proposal_id = new.proposal_id
     and h.current_revision = new.proposal_revision
     and h.revoked = false
     and h.last_review_sequence < 9223372036854775807
     and v.tenant_id = h.tenant_id
     and v.proposal_id = h.proposal_id
     and v.revision = h.current_revision
     and v.author_id <> new.reviewer_id
  returning h.last_review_sequence into sequence_value;

  if sequence_value is null then
    raise exception 'stale_revoked_or_self_reviewed_proposal' using errcode='23514';
  end if;
  new.review_sequence := sequence_value;
  return new;
end;
$employee_review$;
create trigger employee_dispatch_review_sequence
  before insert on employee_dispatch_proposal_reviews
  for each row execute function employee_dispatch_assign_review_sequence();

-- In the draft, even privileged direct mutations of existing review rows are
-- rejected; genuine corrections must be appended as a new review decision.
create function employee_dispatch_reject_review_mutation()
returns trigger language plpgsql as $employee_review$
begin
  raise exception 'employee_dispatch_review_immutable' using errcode='23514';
end;
$employee_review$;
create trigger employee_dispatch_review_immutable
  before update or delete on employee_dispatch_proposal_reviews
  for each row execute function employee_dispatch_reject_review_mutation();

-- Proposal versions are content-addressed, therefore edits to a persisted
-- author, action or payload digest must never rewrite what a review approved.
-- Publish a new version instead; deletions are also denied.
create function employee_dispatch_reject_proposal_version_mutation()
returns trigger language plpgsql as $employee_proposal$
begin
  raise exception 'employee_dispatch_proposal_version_immutable' using errcode='23514';
end;
$employee_proposal$;
create trigger employee_dispatch_proposal_version_immutable
  before update or delete on employee_dispatch_proposal_versions
  for each row execute function employee_dispatch_reject_proposal_version_mutation();

-- Remaining release blockers: trusted reviewer identity/role verification,
-- write privileges/RLS, client transaction scope,
-- tenant session binding, dispatch idempotency+audit, and lease fencing.
-- This draft has NO deployment/activation authority.
